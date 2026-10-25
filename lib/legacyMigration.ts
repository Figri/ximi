import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeRows, readTable } from './localdb';
import { loadLogs, saveLogs, loadCategories as loadTimeCategories, saveCategories as saveTimeCategories, loadTags as loadTimeTags, saveTags as saveTimeTags } from './timelogLocal';
import { loadItems as loadTodoItems, saveItems as saveTodoItems, loadCategories as loadTodoCategories, saveCategories as saveTodoCategories, loadCompletions as loadTodoCompletions, saveCompletions as saveTodoCompletions } from './todoLocal';
import { loadDiaries, saveDiaries } from './scheduleLocal';

// 一次性把旧 Supabase 库（ximi 项目）里的数据搬进手机本地，之后 App 不再连 Supabase。
//
// - 原来只存在云端的表（习惯卡片、打卡、猫、旧聊天、AI 记忆……）整表搬进本地数据库，按 id 合并，
//   不会覆盖搬家之后在手机上新建的东西。
// - 原来"本地为主、顺手上云"的表（时间块、事项、日程日记）以手机里的为准：只有手机里是空的
//   （比如重装过）才从云端补回来。
// - 库连不上（暂停、没网）就下次打开再试，不报错、不打扰。

const K_STATE = 'legacy_migration_v1';

const CLOUD_ONLY_TABLES = [
  'cards',
  'actions',
  'completions',
  'card_links',
  'collections',
  'cats',
  'cat_events',
  'timeline_entries',
  'worries',
  'daily_summaries',
  'messages',
  'settings',
  'tags',
  'projects',
  'project_logs',
  'folders',
  'notes',
] as const;

export interface MigrationState {
  status: 'done' | 'failed' | 'skipped';
  at: string;
  counts: Record<string, number>;
  error?: string;
  attempts: number;
}

export const MIGRATION_LABELS: Record<string, string> = {
  cards: '习惯卡片',
  actions: '卡片动作',
  completions: '打卡记录',
  cats: '猫',
  cat_events: '猫的记录',
  messages: '旧聊天',
  settings: '设置和 AI 记忆',
  tags: '标签',
  timeline_entries: '时间轴',
  daily_summaries: '每日总结',
  notes: '笔记',
  folders: '笔记文件夹',
  worries: '烦恼',
  projects: '项目',
  project_logs: '项目记录',
  collections: '收藏',
  card_links: '卡片关联',
  time_logs: '时间块（补回）',
  todo_items: '事项（补回）',
  schedule_diary: '日程日记（补回）',
};

export async function getMigrationState(): Promise<MigrationState | null> {
  try {
    const raw = await AsyncStorage.getItem(K_STATE);
    return raw ? (JSON.parse(raw) as MigrationState) : null;
  } catch {
    return null;
  }
}

async function saveState(state: MigrationState): Promise<void> {
  await AsyncStorage.setItem(K_STATE, JSON.stringify(state));
}

function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} 超时`)), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

type Client = { from: (t: string) => any };

function loadClient(): Client | null {
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) return null;
  try {
    // 延迟加载：没配旧库地址的环境（比如本地网页预览）不去创建客户端
    return require('./supabase').supabase as Client;
  } catch {
    return null;
  }
}

async function fetchAll(client: Client, table: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await withTimeout<any>(
      client.from(table).select('*').range(from, from + 999),
      20000,
      table
    );
    if (error) throw new Error(`${table}: ${error.message ?? error}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

let running: Promise<MigrationState | null> | null = null;

/** App 启动时调用：没搬过就搬一次。force=true 时不管之前的结果再搬一遍（按 id 合并，重复搬不会重复） */
export function runLegacyMigration(force = false): Promise<MigrationState | null> {
  if (running) return running;
  running = (async () => {
    const prev = await getMigrationState();
    if (!force && prev && (prev.status === 'done' || prev.status === 'skipped')) return prev;
    const attempts = (prev?.attempts ?? 0) + 1;

    const client = loadClient();
    if (!client) {
      // 记成 failed 而不是 skipped：下次打开还会再试，万一是这次打包漏了地址
      const state: MigrationState = {
        status: 'failed',
        at: new Date().toISOString(),
        counts: {},
        error: '这个安装包里没有旧库的地址',
        attempts,
      };
      await saveState(state);
      return state;
    }

    const counts: Record<string, number> = {};
    try {
      for (const table of CLOUD_ONLY_TABLES) {
        const rows = await fetchAll(client, table);
        counts[table] = await mergeRows(table, rows);
      }

      // 本地为主的表：手机里空着才补
      if ((await loadLogs()).length === 0) {
        const logs = await fetchAll(client, 'time_logs');
        if (logs.length) {
          const cats = await fetchAll(client, 'time_categories');
          const tags = await fetchAll(client, 'time_tags');
          const localCats = await loadTimeCategories();
          const localTags = await loadTimeTags();
          const catIds = new Set(localCats.map((c) => c.id));
          const tagIds = new Set(localTags.map((t) => t.id));
          await saveTimeCategories([...localCats, ...cats.filter((c) => !catIds.has(c.id))]);
          await saveTimeTags([...localTags, ...tags.filter((t) => !tagIds.has(t.id))]);
          await saveLogs(logs.map((l) => ({ ...l, tag_ids: l.tag_ids ?? [] })));
          counts.time_logs = logs.length;
        }
      }
      if ((await loadTodoItems()).length === 0) {
        const items = await fetchAll(client, 'todo_items');
        if (items.length) {
          const cats = await fetchAll(client, 'todo_categories');
          const localCats = await loadTodoCategories();
          const ids = new Set(localCats.map((c) => c.id));
          await saveTodoCategories([...localCats, ...cats.filter((c) => !ids.has(c.id))]);
          await saveTodoItems(items);
          const comps = await fetchAll(client, 'todo_completions');
          if (comps.length && (await loadTodoCompletions()).length === 0) await saveTodoCompletions(comps);
          counts.todo_items = items.length;
        }
      }
      if ((await loadDiaries()).length === 0) {
        const diaries = await fetchAll(client, 'schedule_diary');
        if (diaries.length) {
          await saveDiaries(diaries.map((d) => ({ date: d.date, content: d.content ?? '' })));
          counts.schedule_diary = diaries.length;
        }
      }

      const state: MigrationState = { status: 'done', at: new Date().toISOString(), counts, attempts };
      await saveState(state);
      return state;
    } catch (err) {
      const state: MigrationState = {
        status: 'failed',
        at: new Date().toISOString(),
        counts,
        error: err instanceof Error ? err.message : String(err),
        attempts,
      };
      await saveState(state);
      return state;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** 设置页"不搬了"：标记跳过，以后不再尝试 */
export async function skipLegacyMigration(): Promise<void> {
  const prev = await getMigrationState();
  await saveState({
    status: 'skipped',
    at: new Date().toISOString(),
    counts: prev?.counts ?? {},
    error: '你选择了不搬',
    attempts: prev?.attempts ?? 0,
  });
}

/** 本地已经有多少旧数据（设置页展示用） */
export async function localLegacyCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of ['cards', 'completions', 'cats', 'messages'] as const) out[t] = (await readTable(t)).length;
  return out;
}
