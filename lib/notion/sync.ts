import AsyncStorage from '@react-native-async-storage/async-storage';
import { appendChildren, deleteBlock, getChildren, getNotionToken, notionRequest, pageToText, plainText, queryDatabase, richText, textToBlocks, titleOf } from './client';
import { loadNotionIds, type NotionIds } from './discover';
import { getInOsText, saveLayer, type LayerKey } from '../ling/prompt';
import { lingDayKey, loadLingSettings } from '../ling/settings';
import { loadAllMessages, type LingMessage } from '../ling/thread';
import { callAIOnce } from '../ai';
import { currentBrain } from '../ling/brain';
import { buildDayDigest, dayWindow } from '../dayDigest';
import { unsyncedStateEvents, updateStateEvent } from '../states';
import { exportBackup } from '../backup';

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
const MIN_INTERVAL_MS = 30 * 60 * 1000;

export type JobKey = 'layers' | 'states' | 'diary' | 'nextSteps' | 'chatArchive' | 'backup';

export const JOB_LABELS: Record<JobKey, string> = {
  layers: '灵的人设和规矩',
  states: '状态日志',
  diary: '日记属性',
  nextSteps: '项目的下一步',
  chatArchive: '对话存档',
  backup: '每周备份',
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
  const list = await unsyncedStateEvents();
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
      ['diary', () => writeDiary(ids)],
      ['nextSteps', () => pullNextSteps(ids)],
      ['chatArchive', () => archiveChat(ids)],
      ['backup', () => backupToNotion(false)],
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
