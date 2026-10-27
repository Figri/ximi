import AsyncStorage from '@react-native-async-storage/async-storage';
import { notionRequest, searchAll, titleOf } from './client';

// 连上 Notion 后自动找到要用的库和页面（按标题找，不需要你复制任何链接），再逐条检查属性。
// OS 不改 Notion 的结构（D10），缺什么就告诉你在哪加、叫什么、选什么类型。

export interface NotionIds {
  diaryDb: string | null;
  stateDb: string | null;
  planDb: string | null;
  backupDb: string | null;
  /** 「知识 / 🎏 笔记」库：手机里的旧笔记搬去这里（没连给西米OS 就找不到，不影响别的） */
  notesDb: string | null;
  rulesPage: string | null;
  personaPage: string | null;
  inOsPage: string | null;
  archivePage: string | null;
  recentPage: string | null;
  chatArchivePage: string | null;
  checkedAt: string | null;
}

const K_IDS = 'notion_ids_v1';

export const EMPTY_IDS: NotionIds = {
  diaryDb: null,
  stateDb: null,
  planDb: null,
  backupDb: null,
  notesDb: null,
  rulesPage: null,
  personaPage: null,
  inOsPage: null,
  archivePage: null,
  recentPage: null,
  chatArchivePage: null,
  checkedAt: null,
};

export async function loadNotionIds(): Promise<NotionIds> {
  try {
    const raw = await AsyncStorage.getItem(K_IDS);
    return raw ? { ...EMPTY_IDS, ...JSON.parse(raw) } : { ...EMPTY_IDS };
  } catch {
    return { ...EMPTY_IDS };
  }
}

export async function saveNotionIds(ids: NotionIds): Promise<void> {
  await AsyncStorage.setItem(K_IDS, JSON.stringify(ids));
}

const norm = (s: string) => s.replace(/[\s​]/g, '').replace(/^[^\p{L}\p{N}]+/u, '');

function pick(list: any[], match: (title: string) => boolean): string | null {
  const hit = list.find((o) => !o.archived && !o.in_trash && match(norm(titleOf(o))));
  return hit?.id ?? null;
}

/** 按标题找库和页面 */
export async function discover(): Promise<NotionIds> {
  const dbs = await searchAll('', 'database');
  const ids: NotionIds = { ...EMPTY_IDS };
  ids.diaryDb = pick(dbs, (t) => t === '日记');
  ids.stateDb = pick(dbs, (t) => t.includes('状态日志'));
  ids.planDb = pick(dbs, (t) => t.includes('计划与待办'));
  ids.backupDb = pick(dbs, (t) => t.includes('西米OS备份'));
  ids.notesDb = pick(dbs, (t) => t === '笔记');

  const find = async (query: string, match: (t: string) => boolean) => pick(await searchAll(query, 'page'), match);
  ids.rulesPage = await find('系统规则', (t) => t === '系统规则');
  ids.personaPage = await find('灵·人设', (t) => t === '灵·人设');
  ids.inOsPage = await find('灵·在西米OS', (t) => t === '灵·在西米OS');
  ids.archivePage = await find('长期档案', (t) => t.includes('长期档案'));
  ids.recentPage = await find('近况', (t) => t === '西米近况' || t === '近况');
  ids.chatArchivePage = await find('灵的对话存档', (t) => t.includes('灵的对话存档'));
  ids.checkedAt = new Date().toISOString();
  await saveNotionIds(ids);
  return ids;
}

/** 只找「笔记」库（以前连上 Notion 时还没有这一项，用到时补找一次，找到就记下来） */
export async function findNotesDb(): Promise<string | null> {
  const ids = await loadNotionIds();
  if (ids.notesDb) return ids.notesDb;
  const hit = pick(await searchAll('笔记', 'database'), (t) => t === '笔记');
  if (hit) await saveNotionIds({ ...ids, notesDb: hit });
  return hit;
}

// ---- 逐条检查 ----

export interface CheckItem {
  key: string;
  label: string;
  ok: boolean;
  hint: string;
  required: boolean;
}

type PropSpec = { name: string; type: string; option?: string; typeLabel: string };

const DIARY_PROPS: PropSpec[] = [
  { name: '日期', type: 'date', typeLabel: '日期' },
  { name: '睡眠', type: 'number', typeLabel: '数字' },
  { name: '入睡', type: 'rich_text', typeLabel: '文本' },
  { name: '起床', type: 'rich_text', typeLabel: '文本' },
  { name: '状态', type: 'rich_text', typeLabel: '文本' },
  { name: '时间分布', type: 'rich_text', typeLabel: '文本' },
  { name: '例行', type: 'rich_text', typeLabel: '文本' },
  { name: '事项', type: 'number', typeLabel: '数字' },
  { name: '今日碎片', type: 'rich_text', typeLabel: '文本' },
  { name: '和灵聊了什么', type: 'rich_text', typeLabel: '文本' },
  { name: '同步时间', type: 'rich_text', typeLabel: '文本' },
  { name: '积分', type: 'number', typeLabel: '数字' },
];

const STATE_PROPS: PropSpec[] = [
  { name: '时间', type: 'date', typeLabel: '日期' },
  { name: '时段', type: 'select', typeLabel: '单选' },
  { name: '状态', type: 'multi_select', option: '内耗', typeLabel: '多选' },
  { name: '强度', type: 'number', typeLabel: '数字' },
  { name: '来源', type: 'select', option: 'OS', typeLabel: '单选' },
];

const PLAN_PROPS: PropSpec[] = [
  { name: '下一步', type: 'rich_text', typeLabel: '文本' },
  { name: '阶段', type: 'select', typeLabel: '单选' },
  { name: '备注', type: 'rich_text', typeLabel: '文本' },
];

const BACKUP_PROPS: PropSpec[] = [{ name: '日期', type: 'date', typeLabel: '日期' }];

async function checkDb(id: string | null, dbLabel: string, props: PropSpec[], key: string): Promise<CheckItem[]> {
  if (!id) {
    return [{ key, label: `找到「${dbLabel}」`, ok: false, required: true, hint: `没找到这个库。确认 💓 2026 已经连给「西米OS」集成，库名里有「${dbLabel}」。` }];
  }
  let db: any;
  try {
    db = await notionRequest(`/databases/${id}`);
  } catch (err) {
    return [{ key, label: `打开「${dbLabel}」`, ok: false, required: true, hint: err instanceof Error ? err.message : String(err) }];
  }
  const items: CheckItem[] = [{ key, label: `找到「${dbLabel}」`, ok: true, required: true, hint: '' }];
  const existing = db.properties ?? {};
  for (const p of props) {
    const prop = existing[p.name];
    let ok = !!prop && prop.type === p.type;
    let hint = ok ? '' : prop ? `「${p.name}」的类型要改成${p.typeLabel}（现在是 ${prop.type}）` : `在「${dbLabel}」里加一个属性「${p.name}」，类型选${p.typeLabel}`;
    if (ok && p.option) {
      const opts: any[] = prop[p.type]?.options ?? [];
      if (!opts.some((o) => o.name === p.option)) {
        ok = false;
        hint = `「${p.name}」里加一个选项「${p.option}」`;
      }
    }
    items.push({ key: `${key}.${p.name}`, label: `${dbLabel} · ${p.name}`, ok, required: true, hint });
  }
  return items;
}

export async function runChecks(ids: NotionIds): Promise<CheckItem[]> {
  const items: CheckItem[] = [];
  items.push(...(await checkDb(ids.diaryDb, '日记', DIARY_PROPS, 'diary')));
  items.push(...(await checkDb(ids.stateDb, '西米状态日志', STATE_PROPS, 'state')));
  items.push(...(await checkDb(ids.planDb, '计划与待办', PLAN_PROPS, 'plan')));
  items.push(...(await checkDb(ids.backupDb, '西米OS 备份', BACKUP_PROPS, 'backup')));
  const page = (id: string | null, label: string, required: boolean, hint: string): CheckItem => ({
    key: `page.${label}`,
    label: `找到「${label}」`,
    ok: !!id,
    required,
    hint: id ? '' : hint,
  });
  items.push(page(ids.rulesPage, '系统规则', true, '灵读规矩用。确认它在 💓 2026 下面。'));
  items.push(page(ids.personaPage, '灵·人设', true, '灵读人设用，在系统规则下面。'));
  items.push(page(ids.inOsPage, '灵·在西米OS', true, '在系统规则下面建一页，标题照抄，正文空着也行。'));
  items.push(page(ids.archivePage, '西米长期档案', false, '没有也能用，灵会少知道一些你的事。'));
  items.push(page(ids.recentPage, '西米近况', false, '没有也能用。'));
  items.push(page(ids.chatArchivePage, '灵的对话存档', false, '想把对话存进 Notion 的话，在 💓 2026 下面建一页叫「💬 灵的对话存档」。'));
  return items;
}

export function allRequiredOk(items: CheckItem[]): boolean {
  return items.filter((i) => i.required).every((i) => i.ok);
}
