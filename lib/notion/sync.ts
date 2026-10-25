import AsyncStorage from '@react-native-async-storage/async-storage';
import { appendChildren, deleteBlock, getChildren, getNotionToken, notionRequest, pageToText, plainText, queryDatabase, richText, textToBlocks, titleOf } from './client';
import { findNotesDb, loadNotionIds, type NotionIds } from './discover';
import { getInOsText, saveLayer, type LayerKey } from '../ling/prompt';
import { lingDayKey, loadLingSettings } from '../ling/settings';
import { loadAllMessages, type LingMessage } from '../ling/thread';
import { callAIOnce } from '../ai';
import { currentBrain } from '../ling/brain';
import { buildDayDigest, dayWindow } from '../dayDigest';
import { deleteStateEvent, STATE_REPLACE_MS, unsyncedStateEvents, updateStateEvent } from '../states';
import { exportBackup } from '../backup';
import { db } from '../localdb';

// OS ↔ Notion 同步（需求文档 §3.4、§4.3）：
// - 拉：灵·人设 / 系统规则 / 灵·在西米OS / 长期档案 / 近况 → 灵的提示词缓存；计划与待办的「下一步」→ 今天页
// - 写：状态打点 → 状态日志新行（来源 = OS）；每天的数字 → 日记属性（只写属性，不碰正文）；
//       每周备份 → 💾 西米OS 备份；和灵的对话 → 💬 灵的对话存档（每月一页，可关）
// 后台跑，失败不弹窗，在「设置与数据」里能看到每一项的结果，可以重试。

const K_STATUS = 'notion_sync_status_v1';
const K_NEXT_STEPS = 'notion_next_steps_v1';
const K_CHAT_ARCHIVED_UNTIL = 'notion_chat_archived_until_v1';
const K_LAST_BACKUP = 'notion_last_backup_v1';
const K_IN_OS_PULLED_AT = 'notion_in_os_pulled_at_v1';
const K_CHAT_SUMMARY = 'notion_chat_summary_v1';
const K_IDEAS = 'notion_ideas_v1';
const K_NOTES_MOVED = 'notion_notes_moved_v1';
const MIN_INTERVAL_MS = 30 * 60 * 1000;

export type JobKey = 'layers' | 'states' | 'ideas' | 'diary' | 'nextSteps' | 'chatArchive' | 'backup' | 'notes';

export const JOB_LABELS: Record<JobKey, string> = {
  layers: '灵的人设和规矩',
  states: '状态日志',
  ideas: '想法池',
  diary: '日记属性',
  nextSteps: '项目的下一步',
  chatArchive: '对话存档',
  backup: '每周备份',
  notes: '旧笔记搬去 Notion',
};

export interface JobResult {
  ok: boolean;
  at: string;
  detail?: string;
  error?: string;
}

export interface SyncStatus {
  lastRunAt: string | null;
  jobs: Partial<Record<JobKey, JobResult>>;
}

export async function loadSyncStatus(): Promise<SyncStatus> {
  try {
    const raw = await AsyncStorage.getItem(K_STATUS);
    return raw ? (JSON.parse(raw) as SyncStatus) : { lastRunAt: null, jobs: {} };
  } catch {
    return { lastRunAt: null, jobs: {} };
  }
}

async function saveSyncStatus(s: SyncStatus): Promise<void> {
  await AsyncStorage.setItem(K_STATUS, JSON.stringify(s));
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function mmddhhmm(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hhmm(d)}`;
}

function offsetIso(d: Date): string {
  // 带本地时区的时间，Notion 里显示成你手机上的时间
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const abs = Math.abs(tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// ---------------- 拉：灵的提示词 ----------------

const LAYER_LABELS: Record<string, string> = { persona: '人设', rules: '规矩', archive: '长期档案', recent: '近况' };

async function pullLayers(ids: NotionIds): Promise<string> {
  const pulled: string[] = [];
  const pairs: [LayerKey, string | null][] = [
    ['persona', ids.personaPage],
    ['rules', ids.rulesPage],
    ['archive', ids.archivePage],
    ['recent', ids.recentPage],
  ];
  for (const [key, id] of pairs) {
    if (!id) continue;
    const page = await notionRequest<any>(`/pages/${id}`);
    const text = await pageToText(id);
    if (text) {
      await saveLayer(key, { text, updatedAt: page.last_edited_time ?? new Date().toISOString(), source: 'notion' });
      pulled.push(LAYER_LABELS[key] ?? key);
    }
  }

  // 第 3 层：App 里改过、而且比上次从 Notion 拉的新 → 推上去；否则 Notion 有内容就拉下来
  if (ids.inOsPage) {
    const local = await getInOsText();
    const pulledAt = await AsyncStorage.getItem(K_IN_OS_PULLED_AT);
    const localNewer = local.source !== 'notion' && local.updatedAt && (!pulledAt || local.updatedAt > pulledAt);
    if (localNewer) {
      await pushInOsToNotion();
      pulled.push('在西米OS（App 里改的写回了 Notion）');
    } else {
      const text = await pageToText(ids.inOsPage);
      if (text && text.trim() !== local.text.trim()) {
        await saveLayer('inOs', { text, updatedAt: new Date().toISOString(), source: 'notion' });
        pulled.push('在西米OS（换成了 Notion 里的）');
      }
      await AsyncStorage.setItem(K_IN_OS_PULLED_AT, new Date().toISOString());
    }
  }
  return pulled.length ? `读到：${pulled.join('、')}` : '没有可读的页面';
}

/** 把 App 里的第 3 层写回 Notion（整页替换正文） */
export async function pushInOsToNotion(): Promise<boolean> {
  if (!(await getNotionToken())) return false;
  const ids = await loadNotionIds();
  if (!ids.inOsPage) return false;
  const { text } = await getInOsText();
  const old = await getChildren(ids.inOsPage);
  for (const b of old) {
    if (b.type === 'child_page' || b.type === 'child_database') continue;
    await deleteBlock(b.id);
  }
  await appendChildren(ids.inOsPage, textToBlocks(text));
  await AsyncStorage.setItem(K_IN_OS_PULLED_AT, new Date().toISOString());
  return true;
}

// ---------------- 写：状态日志 ----------------

async function pushStates(ids: NotionIds): Promise<string> {
  if (!ids.stateDb) return '没找到状态日志';
  // 刚点的先不写：5 分钟内还可能改成别的（今天页点错了直接点另一个）
  const list = (await unsyncedStateEvents()).filter((e) => Date.now() - new Date(e.created_at || e.at).getTime() >= STATE_REPLACE_MS);
  let n = 0;
  for (const e of list) {
    const at = new Date(e.at);
    const page = await notionRequest<any>('/pages', {
      method: 'POST',
      body: {
        parent: { database_id: ids.stateDb },
        properties: {
          事件: { title: richText(e.note?.trim() || `${e.state}（西米OS 打点）`) },
          时间: { date: { start: offsetIso(at) } },
          时段: { select: { name: e.period } },
          状态: { multi_select: [{ name: e.state }] },
          ...(e.intensity != null ? { 强度: { number: e.intensity } } : {}),
          来源: { select: { name: 'OS' } },
        },
      },
    });
    await updateStateEvent(e.id, { notion_page_id: page.id });
    n++;
  }
  return n ? `新写了 ${n} 行` : '没有新的';
}

/** 把 Notion 里的一页放进回收站（30 天内能找回）：撤销打点 / 改了想法池的归类时用 */
export async function archiveNotionPage(pageId: string): Promise<void> {
  await notionRequest(`/pages/${pageId}`, { method: 'PATCH', body: { archived: true } });
}

/** 撤销一次状态打点：等手上这轮同步跑完再删，免得刚写进 Notion 的那行没人管；已经写进去的归档掉 */
export async function removeStateEvent(id: string): Promise<void> {
  if (running) await running.catch(() => null);
  const row = await deleteStateEvent(id);
  if (row?.notion_page_id && (await getNotionToken())) await archiveNotionPage(row.notion_page_id).catch(() => {});
}

// ---------------- 写：想法池（＋ 里「想做个人短剧」这种） ----------------

export interface QueuedIdea {
  id: string;
  text: string;
  createdAt: string;
  pageId: string | null;
}

// 想法先进本地发件箱，连得上 Notion 时写成计划与待办里阶段 = 想法池的一行。没网、没连都不丢。
let ideasLock: Promise<unknown> = Promise.resolve();
function withIdeasLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = ideasLock.then(fn, fn);
  ideasLock = run.catch(() => {});
  return run;
}

async function readIdeas(): Promise<QueuedIdea[]> {
  try {
    const raw = await AsyncStorage.getItem(K_IDEAS);
    return raw ? (JSON.parse(raw) as QueuedIdea[]) : [];
  } catch {
    return [];
  }
}

export function pendingIdeas(): Promise<QueuedIdea[]> {
  return readIdeas().then((list) => list.filter((i) => !i.pageId));
}

export function queueIdea(text: string): Promise<QueuedIdea> {
  return withIdeasLock(async () => {
    const idea: QueuedIdea = { id: `idea-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: text.trim(), createdAt: new Date().toISOString(), pageId: null };
    const list = await readIdeas();
    // 已经写进 Notion 的只留最近 50 条（撤销用），没写进去的全留着
    const pushed = list.filter((i) => i.pageId).slice(-50);
    await AsyncStorage.setItem(K_IDEAS, JSON.stringify([...list.filter((i) => !i.pageId), ...pushed, idea]));
    return idea;
  });
}

export async function removeIdea(id: string): Promise<void> {
  if (running) await running.catch(() => null);
  const removed = await withIdeasLock(async () => {
    const list = await readIdeas();
    const hit = list.find((i) => i.id === id) ?? null;
    await AsyncStorage.setItem(K_IDEAS, JSON.stringify(list.filter((i) => i.id !== id)));
    return hit;
  });
  if (removed?.pageId && (await getNotionToken())) await archiveNotionPage(removed.pageId).catch(() => {});
}

const titlePropCache = new Map<string, string>();
async function titlePropOf(databaseId: string): Promise<string> {
  const cached = titlePropCache.get(databaseId);
  if (cached) return cached;
  const db = await notionRequest<any>(`/databases/${databaseId}`);
  const name = Object.entries<any>(db.properties ?? {}).find(([, v]) => v?.type === 'title')?.[0] ?? '名称';
  titlePropCache.set(databaseId, name);
  return name;
}

async function pushIdeas(ids: NotionIds): Promise<string> {
  const pending = await pendingIdeas();
  if (!pending.length) return '没有新的';
  if (!ids.planDb) return `没找到计划与待办，${pending.length} 条先存着`;
  const titleProp = await titlePropOf(ids.planDb);
  let n = 0;
  for (const idea of pending) {
    const page = await notionRequest<any>('/pages', {
      method: 'POST',
      body: {
        parent: { database_id: ids.planDb },
        properties: {
          [titleProp]: { title: richText(idea.text) },
          阶段: { select: { name: '想法池' } },
          备注: { rich_text: richText(`西米OS ＋ 里记的 · ${mmddhhmm(new Date(idea.createdAt))}`) },
        },
      },
    });
    // 写的这几秒里她可能已经把它改成别的了：那就把刚建的这页归档
    const stillThere = await withIdeasLock(async () => {
      const list = await readIdeas();
      const hit = list.find((i) => i.id === idea.id);
      if (hit) {
        hit.pageId = page.id;
        await AsyncStorage.setItem(K_IDEAS, JSON.stringify(list));
      }
      return !!hit;
    });
    if (!stillThere) await archiveNotionPage(page.id).catch(() => {});
    else n++;
  }
  return `新写了 ${n} 条`;
}

// ---------------- 写：日记属性 ----------------

async function chatSummary(dayKey: string, dayStartHour: number, messages: LingMessage[]): Promise<string> {
  const { start, end } = dayWindow(dayKey, dayStartHour);
  const today = messages.filter((m) => {
    const t = new Date(m.created_at).getTime();
    return t >= start.getTime() && t < end.getTime() && m.kind !== 'divider' && m.kind !== 'note';
  });
  const userLines = today.filter((m) => m.role === 'user').map((m) => m.content.replace(/\s+/g, ' '));
  if (!userLines.length) return '';
  const cacheRaw = await AsyncStorage.getItem(K_CHAT_SUMMARY);
  const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
  if (cache[dayKey]?.count === today.length) return cache[dayKey].text;
  let text = userLines.slice(0, 3).map((l) => l.slice(0, 18)).join('；');
  try {
    const { model, apiKey } = await currentBrain();
    if (apiKey) {
      const convo = today.map((m) => `${m.role === 'user' ? '她' : '灵'}：${m.content.slice(0, 120)}`).join('\n').slice(-3000);
      const out = await callAIOnce('你在帮忙记日记的属性栏。用一句话（不超过 30 个字）写这天她和灵聊了什么，只写话题，用分号隔开，不评价，不加引号。', convo, model, apiKey, 100);
      if (out.trim()) text = out.trim().replace(/^["“]|["”]$/g, '').slice(0, 60);
    }
  } catch {}
  cache[dayKey] = { count: today.length, text };
  const keys = Object.keys(cache).sort().slice(-10);
  await AsyncStorage.setItem(K_CHAT_SUMMARY, JSON.stringify(Object.fromEntries(keys.map((k) => [k, cache[k]]))));
  return text;
}

/** 找到这一天的日记页：同一天多页时，写标签是「每日归档」的那页，没有就写最早那页 */
async function findDiaryPage(diaryDb: string, dayKey: string): Promise<{ id: string; duplicates: number } | null> {
  const rows = await queryDatabase(diaryDb, { filter: { property: '日期', date: { equals: dayKey } } }, 1);
  if (!rows.length) return null;
  const archived = rows.filter((r) => (r.properties?.标签?.multi_select ?? []).some((o: any) => o.name === '每日归档'));
  const pool = archived.length ? archived : rows;
  pool.sort((a, b) => String(a.created_time).localeCompare(String(b.created_time)));
  return { id: pool[0].id, duplicates: rows.length - 1 };
}

async function writeDiary(ids: NotionIds): Promise<string> {
  if (!ids.diaryDb) return '没找到日记库';
  const settings = await loadLingSettings();
  const now = new Date();
  const today = lingDayKey(now, settings.dayStartHour);
  const yesterday = lingDayKey(new Date(now.getTime() - 24 * 3600 * 1000), settings.dayStartHour);
  const messages = await loadAllMessages();
  const notes: string[] = [];
  for (const dayKey of [yesterday, today]) {
    const digest = await buildDayDigest(dayKey, settings.dayStartHour);
    const summary = await chatSummary(dayKey, settings.dayStartHour, messages);
    if (!digest.hasData && !summary) continue;
    const props: Record<string, any> = {
      睡眠: { number: digest.sleepHours },
      入睡: { rich_text: digest.sleepStart ? richText(digest.sleepStart) : [] },
      起床: { rich_text: digest.sleepEnd ? richText(digest.sleepEnd) : [] },
      状态: { rich_text: digest.states ? richText(digest.states) : [] },
      时间分布: { rich_text: digest.timeSplit ? richText(digest.timeSplit) : [] },
      例行: { rich_text: digest.routines ? richText(digest.routines) : [] },
      事项: { number: digest.todosDone },
      今日碎片: { rich_text: digest.fragments ? richText(digest.fragments.slice(0, 1900)) : [] },
      和灵聊了什么: { rich_text: summary ? richText(summary) : [] },
      同步时间: { rich_text: richText(mmddhhmm(now)) },
    };
    const found = await findDiaryPage(ids.diaryDb, dayKey);
    if (found) {
      await notionRequest(`/pages/${found.id}`, { method: 'PATCH', body: { properties: props } });
      if (found.duplicates) {
        notes.push(`${dayKey.slice(5)} 已写（这天有 ${found.duplicates + 1} 页，写在「每日归档」那页）`);
        continue;
      }
    } else if (dayKey === today) {
      // 今天还没过完：没有页就先不建，晚上归档时（不管在哪边）建的那页第二天会被找到并补上数字，免得同一天两页
      notes.push(`${dayKey.slice(5)} 还没有页，过完这天再建`);
      continue;
    } else {
      await notionRequest('/pages', {
        method: 'POST',
        body: {
          parent: { database_id: ids.diaryDb },
          properties: { 名称: { title: richText(dayKey) }, 日期: { date: { start: dayKey } }, 标签: { multi_select: [{ name: '每日归档' }] }, ...props },
        },
      });
    }
    notes.push(`${dayKey.slice(5)} 已写`);
  }
  return notes.join('；') || '这两天还没有能写的';
}

// ---------------- 拉：项目的下一步 ----------------

export interface NextStep {
  id: string;
  title: string;
  step: string;
  stage: string;
  url: string;
}

export async function loadNextSteps(): Promise<NextStep[]> {
  try {
    const raw = await AsyncStorage.getItem(K_NEXT_STEPS);
    return raw ? (JSON.parse(raw) as NextStep[]) : [];
  } catch {
    return [];
  }
}

async function pullNextSteps(ids: NotionIds): Promise<string> {
  if (!ids.planDb) return '没找到计划与待办';
  const rows = await queryDatabase(ids.planDb, { filter: { property: '下一步', rich_text: { is_not_empty: true } } }, 2);
  const list: NextStep[] = rows
    .map((r) => ({
      id: r.id,
      title: titleOf(r),
      step: plainText(r.properties?.下一步?.rich_text),
      stage: r.properties?.阶段?.select?.name ?? '',
      url: r.url ?? '',
    }))
    .filter((r) => r.step.trim() && r.stage !== '想法池' && r.stage !== '已完成');
  await AsyncStorage.setItem(K_NEXT_STEPS, JSON.stringify(list));
  return `${list.length} 条`;
}

/** 今天页「这一步做完了」：下一步清空，备注里追加一行带日期的记录 */
export async function completeNextStep(item: NextStep): Promise<void> {
  const page = await notionRequest<any>(`/pages/${item.id}`);
  const note = plainText(page.properties?.备注?.rich_text);
  const d = new Date();
  const line = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 做完：${item.step}`;
  await notionRequest(`/pages/${item.id}`, {
    method: 'PATCH',
    body: { properties: { 下一步: { rich_text: [] }, 备注: { rich_text: richText(note ? `${note}\n${line}` : line) } } },
  });
  const list = (await loadNextSteps()).filter((s) => s.id !== item.id);
  await AsyncStorage.setItem(K_NEXT_STEPS, JSON.stringify(list));
}

// ---------------- 写：对话存档（每月一页） ----------------

async function archiveChat(ids: NotionIds): Promise<string> {
  const settings = await loadLingSettings();
  if (!settings.archiveChatToNotion) return '已关闭';
  if (!ids.chatArchivePage) return '没找到对话存档页';
  const since = (await AsyncStorage.getItem(K_CHAT_ARCHIVED_UNTIL)) ?? '';
  const messages = (await loadAllMessages()).filter((m) => m.created_at > since && m.kind !== 'note' && m.content.trim());
  if (!messages.length) return '没有新的';
  const byMonth = new Map<string, LingMessage[]>();
  for (const m of messages) {
    const d = new Date(m.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth.set(key, [...(byMonth.get(key) ?? []), m]);
  }
  const children = await getChildren(ids.chatArchivePage);
  for (const [month, list] of byMonth) {
    let pageId = children.find((c) => c.type === 'child_page' && c.child_page?.title === month)?.id;
    if (!pageId) {
      const page = await notionRequest<any>('/pages', {
        method: 'POST',
        body: { parent: { page_id: ids.chatArchivePage }, properties: { title: { title: richText(month) } } },
      });
      pageId = page.id;
    }
    const blocks = list.map((m) => {
      const d = new Date(m.created_at);
      const who = m.kind === 'divider' ? '—— 翻篇 ——' : m.role === 'user' ? '西米' : '灵';
      const text = m.kind === 'divider' ? `${mmddhhmm(d)} ${who}` : `${mmddhhmm(d)} ${who}：${m.content}`;
      return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText(text) } };
    });
    await appendChildren(pageId!, blocks);
  }
  await AsyncStorage.setItem(K_CHAT_ARCHIVED_UNTIL, messages[messages.length - 1].created_at);
  return `存了 ${messages.length} 条`;
}

// ---------------- 写：旧笔记搬去 Notion 的「笔记」库 ----------------
// 西米OS 不再有笔记页（笔记就在 Notion 里记）。手机里要是还有以前写的笔记，一条一页搬过去，
// 搬过的记下来不重复搬；本地那份不删，备份里也还有。

async function moveNotes(ids: NotionIds): Promise<string> {
  const { data } = await db.from('notes').select('*').order('created_at', { ascending: true });
  const notes = ((data ?? []) as { id: string; title: string | null; content: string | null; folder_id: string | null; created_at?: string }[]).filter(
    (n) => (n.title ?? '').trim() || (n.content ?? '').trim()
  );
  if (!notes.length) return '手机里没有旧笔记';
  let moved: string[] = [];
  try {
    moved = JSON.parse((await AsyncStorage.getItem(K_NOTES_MOVED)) ?? '[]');
  } catch {}
  const done = new Set(moved);
  const todo = notes.filter((n) => !done.has(n.id));
  if (!todo.length) return `都搬过了（${notes.length} 条）`;
  const notesDb = ids.notesDb ?? (await findNotesDb());
  if (!notesDb) return `手机里有 ${todo.length} 条旧笔记，没找到 Notion 的「笔记」库：把「知识」页连给西米OS 集成，再点一次同步`;
  const dbInfo = await notionRequest<any>(`/databases/${notesDb}`);
  const props = dbInfo.properties ?? {};
  const titleProp = Object.entries<any>(props).find(([, v]) => v?.type === 'title')?.[0] ?? '标题';
  const { data: folders } = await db.from('folders').select('*');
  const folderName = new Map(((folders ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name]));
  for (const n of todo) {
    const folder = n.folder_id ? folderName.get(n.folder_id) : null;
    const body = `${(n.content ?? '').trim()}${folder ? `\n\n（从西米OS 搬来的，原来在「${folder}」文件夹）` : '\n\n（从西米OS 搬来的）'}`;
    const blocks = textToBlocks(body);
    const page = await notionRequest<any>('/pages', {
      method: 'POST',
      body: {
        parent: { database_id: notesDb },
        properties: {
          [titleProp]: { title: richText((n.title ?? '').trim() || '无标题') },
          ...(props['日期']?.type === 'date' && n.created_at ? { 日期: { date: { start: n.created_at.slice(0, 10) } } } : {}),
        },
        children: blocks.slice(0, 100),
      },
    });
    if (blocks.length > 100) await appendChildren(page.id, blocks.slice(100));
    done.add(n.id);
    await AsyncStorage.setItem(K_NOTES_MOVED, JSON.stringify([...done]));
  }
  return `搬了 ${todo.length} 条笔记`;
}

// ---------------- 写：每周备份 ----------------

export async function lastBackupAt(): Promise<string | null> {
  return AsyncStorage.getItem(K_LAST_BACKUP);
}

/** 备份写成 💾 西米OS 备份 里的一行：正文是几个 JSON 代码块（每块 ≤ 9 万字），恢复时按顺序拼回去 */
export async function backupToNotion(force = false): Promise<string> {
  const ids = await loadNotionIds();
  if (!ids.backupDb) return '没找到备份库';
  const last = await lastBackupAt();
  if (!force && last && Date.now() - new Date(last).getTime() < 7 * 24 * 3600 * 1000) return `上次是 ${last.slice(0, 10)}，还不到一周`;
  const { json, counts } = await exportBackup();
  const now = new Date();
  const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const page = await notionRequest<any>('/pages', {
    method: 'POST',
    body: {
      parent: { database_id: ids.backupDb },
      properties: { 名称: { title: richText(`西米OS 备份 ${dayKey} ${hhmm(now)}`) }, 日期: { date: { start: dayKey } } },
    },
  });
  const summary = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ');
  const CHUNK = 1900;
  const PER_BLOCK = 45;
  const pieces: string[] = [];
  for (let i = 0; i < json.length; i += CHUNK) pieces.push(json.slice(i, i + CHUNK));
  const codeBlocks: any[] = [];
  for (let i = 0; i < pieces.length; i += PER_BLOCK) {
    codeBlocks.push({
      object: 'block',
      type: 'code',
      code: { language: 'json', rich_text: pieces.slice(i, i + PER_BLOCK).map((p) => ({ type: 'text', text: { content: p } })) },
    });
  }
  await appendChildren(page.id, [
    { object: 'block', type: 'paragraph', paragraph: { rich_text: richText(`西米OS 自动备份。内容：${summary || '空'}。下面的代码块按顺序拼起来就是完整数据，在 App 的「设置与数据 → 从 Notion 恢复」里选这一行就能恢复。`) } },
  ]);
  for (const b of codeBlocks) await appendChildren(page.id, [b]);
  await AsyncStorage.setItem(K_LAST_BACKUP, now.toISOString());
  return `备份好了（${Math.round(json.length / 1024)} KB）`;
}

export interface BackupRow {
  id: string;
  title: string;
  date: string;
}

export async function listBackups(): Promise<BackupRow[]> {
  const ids = await loadNotionIds();
  if (!ids.backupDb) return [];
  const rows = await queryDatabase(ids.backupDb, { sorts: [{ timestamp: 'created_time', direction: 'descending' }] }, 1);
  return rows.map((r) => ({ id: r.id, title: titleOf(r), date: r.properties?.日期?.date?.start ?? String(r.created_time).slice(0, 10) }));
}

export async function readBackup(pageId: string): Promise<string> {
  const blocks = await getChildren(pageId, 50);
  return blocks
    .filter((b) => b.type === 'code')
    .map((b) => plainText(b.code?.rich_text))
    .join('');
}

// ---------------- 总调度 ----------------

let running: Promise<SyncStatus> | null = null;

/**
 * 全部跑一遍。force=false 时 30 分钟内只跑一次（打开 App 时调用）；单项失败不影响其他项。
 * 同一时间只跑一个：正在跑整轮时又来一个只跑某几项的（比如刚打了状态），排在后面再跑，
 * 不然整轮已经读过状态表，新打的那条要等半小时；也避免两边同时写出重复的行。
 */
export function syncAll(force = false, only?: JobKey[]): Promise<SyncStatus> {
  if (running) return only ? running.then(() => syncAll(force, only)) : running;
  running = (async () => {
    const status = await loadSyncStatus();
    if (!(await getNotionToken())) return status;
    if (!force && status.lastRunAt && Date.now() - new Date(status.lastRunAt).getTime() < MIN_INTERVAL_MS) return status;
    const ids = await loadNotionIds();
    const jobs: [JobKey, () => Promise<string>][] = [
      ['layers', () => pullLayers(ids)],
      ['states', () => pushStates(ids)],
      ['ideas', () => pushIdeas(ids)],
      ['diary', () => writeDiary(ids)],
      ['nextSteps', () => pullNextSteps(ids)],
      ['chatArchive', () => archiveChat(ids)],
      ['backup', () => backupToNotion(false)],
      ['notes', () => moveNotes(ids)],
    ];
    for (const [key, run] of jobs) {
      if (only && !only.includes(key)) continue;
      try {
        const detail = await run();
        status.jobs[key] = { ok: true, at: new Date().toISOString(), detail };
      } catch (err) {
        status.jobs[key] = { ok: false, at: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) };
      }
    }
    if (!only) status.lastRunAt = new Date().toISOString();
    await saveSyncStatus(status);
    return status;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** 状态打点后立刻试一下（没连 Notion 或失败都不打扰） */
export function syncStatesSoon(): void {
  syncAll(true, ['states']).catch(() => {});
}

/** ＋ 里记了想法后试一下 */
export function syncIdeasSoon(): void {
  syncAll(true, ['ideas']).catch(() => {});
}
