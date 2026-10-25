import AsyncStorage from '@react-native-async-storage/async-storage';
import { readTable, replaceTable } from './localdb';

// 完整备份：本地数据库的所有表 + 时间/事项/日程/底栏/灵的设定这些存在 AsyncStorage 里的数据。
// 每周自动存进 Notion（lib/notion/sync.ts），换手机或清数据后可以选一份恢复。

export const BACKUP_TABLES = [
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
  'ling_messages',
  'state_events',
  'fragments',
  'body_records',
] as const;

export const BACKUP_KV_KEYS = [
  'timelog_categories_v1',
  'timelog_tags_v1',
  'timelog_logs_v1',
  'todo_categories_v1',
  'todo_items_v1',
  'todo_completions_v1',
  'schedule_template_versions_v1',
  'schedule_template_items_v1',
  'schedule_items_v1',
  'schedule_checks_v1',
  'schedule_diary_v1',
  'ximi_tab_layout',
  'ling_settings_v1',
  'ling_layers_v1',
  'ling_in_os_versions_v1',
  'notion_ideas_v1',
  'todo_cat_links_v1',
  'play_history_v1',
  'body_legacy_imported_v1',
] as const;

export interface BackupFile {
  app: 'ximi-os';
  version: 1;
  exportedAt: string;
  tables: Record<string, any[]>;
  kv: Record<string, string | null>;
}

export async function exportBackup(): Promise<{ json: string; counts: Record<string, number> }> {
  const tables: Record<string, any[]> = {};
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    tables[t] = await readTable(t);
    counts[t] = tables[t].length;
  }
  const kv: Record<string, string | null> = {};
  for (const k of BACKUP_KV_KEYS) kv[k] = await AsyncStorage.getItem(k);
  try {
    counts.time_logs = JSON.parse(kv.timelog_logs_v1 ?? '[]').length;
    counts.todo_items = JSON.parse(kv.todo_items_v1 ?? '[]').length;
  } catch {}
  const file: BackupFile = { app: 'ximi-os', version: 1, exportedAt: new Date().toISOString(), tables, kv };
  return { json: JSON.stringify(file), counts };
}

export function parseBackup(json: string): BackupFile {
  const data = JSON.parse(json);
  if (!data || data.app !== 'ximi-os' || typeof data.tables !== 'object') throw new Error('这不是西米OS 的备份');
  return data as BackupFile;
}

/** 用备份整个替换本地数据（恢复前会先把现在的数据也导出一份，返回给调用方留底） */
export async function importBackup(json: string): Promise<{ counts: Record<string, number>; previous: string }> {
  const file = parseBackup(json);
  const previous = (await exportBackup()).json;
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    const rows = Array.isArray(file.tables[t]) ? file.tables[t] : [];
    await replaceTable(t, rows);
    counts[t] = rows.length;
  }
  for (const k of BACKUP_KV_KEYS) {
    const v = file.kv?.[k];
    if (typeof v === 'string') await AsyncStorage.setItem(k, v);
  }
  if (previous.length < 1_500_000) await AsyncStorage.setItem('backup_before_restore_v1', previous);
  return { counts, previous };
}
