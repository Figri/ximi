import AsyncStorage from '@react-native-async-storage/async-storage';
import { osCloud } from './osCloud';
import { compareAndSetRow, readTable, uuid } from './localdb';
import { exportBackup } from './backup';
import { lingDayKey, loadLingSettings } from './ling/settings';
import { useDataBus } from './dataBus';
import { fingerprint, type CloudRecord, type RecordKind, type SyncItem } from './osSyncTypes';

const META = 'os_sync_meta_v1';
const BINDING = 'os_sync_owner_v1';
export const SYNC_RESTORE_BLOCK = 'os_sync_restore_block_v1';
interface Base { item: SyncItem; version: number }
interface Pending { item: SyncItem; version: number; operation: string }
interface Meta {
  owner: string; base: Record<string, Base>; pending: Pending | null;
  incoming?: { kind: 'fragment' | 'review'; record: CloudRecord };
  cursor: Record<RecordKind, number>; lastSuccess?: string; error?: string;
}
const keyOf = (r: Pick<SyncItem, 'kind' | 'id'>) => `${r.kind}:${r.id}`;
export async function syncStatus(): Promise<{ lastSuccess?: string; error?: string; connected: boolean }> {
  const raw = await AsyncStorage.getItem(META);
  const m: Meta | null = raw ? JSON.parse(raw) : null;
  return { lastSuccess: m?.lastSuccess, error: m?.error, connected: !!(await AsyncStorage.getItem(BINDING)) };
}
async function save(m: Meta) { await AsyncStorage.setItem(META, JSON.stringify(m)); }

async function readForSync(table: string) {
  // The legacy DB deliberately tolerates unreadable chunks for the UI. Sync must
  // fail closed instead of interpreting a corrupt chunk as deleted cloud data.
  const raw = await AsyncStorage.getItem(`ldb_v1_${table}_meta`);
  if (raw) {
    const count = JSON.parse(raw)?.chunks;
    if (!Number.isInteger(count) || count < 0) throw new Error(`${table} 存储异常，已暂停同步`);
    for (let i = 0; i < count; i++) {
      const chunk = await AsyncStorage.getItem(`ldb_v1_${table}_${i}`);
      if (!chunk || !Array.isArray(JSON.parse(chunk))) throw new Error(`${table} 存储异常，已暂停同步`);
    }
  }
  return readTable(table);
}

async function collect(): Promise<SyncItem[]> {
  const { dayStartHour } = await loadLingSettings();
  const date = (row: any) => {
    if (row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) return row.date;
    const at = row.at ?? row.completed_at ?? row.start_time;
    return at && Number.isFinite(Date.parse(at)) ? lingDayKey(new Date(at), dayStartHour) : null;
  };
  const items: SyncItem[] = [];
  items.push({ kind: 'context', id: 'recording_preferences', date: null, deleted: false,
    payload: { id: 'recording_preferences', collection: 'recording_preferences', row: { dayStartHour, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } } });
  for (const [table, kind] of [['fragments', 'fragment'], ['os_reviews', 'review']] as const) {
    for (const row of await readForSync(table)) items.push({ kind, id: row.id, date: date(row), payload: row, deleted: false });
  }
  // Context stays read-only in ChatGPT during phase 1. No secrets/settings/chat logs.
  for (const table of ['cards', 'actions', 'completions', 'state_events']) {
    for (const row of await readForSync(table)) items.push({ kind: 'context', id: `${table}:${row.id}`, date: date(row), payload: { id: `${table}:${row.id}`, collection: table, row }, deleted: false });
  }
  for (const storage of ['timelog_logs_v1', 'timelog_categories_v1', 'timelog_tags_v1', 'todo_items_v1', 'todo_completions_v1']) {
    const raw = await AsyncStorage.getItem(storage);
    const rows = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(rows)) throw new Error(`${storage} 数据异常，已暂停同步`);
    for (const row of rows) items.push({ kind: 'context', id: `${storage}:${row.id}`, date: date(row), payload: { id: `${storage}:${row.id}`, collection: storage, row }, deleted: false });
  }
  return items;
}

async function pushPending(m: Meta) {
  const p = m.pending!;
  const { kind, id, date, payload, deleted } = p.item;
  const { data, error } = await osCloud().rpc('ximi_write_record', {
    p_kind: kind, p_id: id, p_date: date, p_payload: payload, p_deleted: deleted,
    p_expected_version: p.version, p_operation_id: p.operation, p_source: 'os',
  });
  if (error) throw new Error(error.message);
  if (!data.ok) {
    // Keep both copies. Do not advance the baseline or a download cursor.
    await AsyncStorage.setItem('os_sync_conflict_v1', JSON.stringify({ local: p.item, remote: data.current }));
    m.pending = null;
    await save(m);
    throw new Error(`「${kind}:${id}」有版本冲突，两份内容已保留，同步已暂停`);
  }
  m.base[keyOf(p.item)] = { item: p.item, version: data.record.version };
  m.pending = null;
  await save(m);
}

async function applyIncoming(m: Meta) {
  const { kind, record: r } = m.incoming!;
  const item: SyncItem = { kind, id: r.id, date: r.record_date, payload: r.payload, deleted: r.deleted };
  const base = m.base[keyOf(item)];
  const expected = base && !base.item.deleted ? base.item.payload : null;
  const applied = await compareAndSetRow(kind === 'fragment' ? 'fragments' : 'os_reviews', r.id, expected, r.deleted ? null : r.payload);
  if (!applied) throw new Error('同步期间本地记录发生变化，已保留本地修改，同步已暂停');
  m.base[keyOf(item)] = { item, version: r.version };
  m.cursor[kind] = r.revision;
  delete m.incoming;
  await save(m);
}

let running: Promise<void> | null = null;
export function syncOs(): Promise<void> {
  if (running) return running;
  running = run().finally(() => { running = null; });
  return running;
}
async function run() {
  // A restored old snapshot must never be interpreted as a new user edit.
  if (await AsyncStorage.getItem(SYNC_RESTORE_BLOCK)) throw new Error('恢复备份后云同步已暂停，需先核对云端与本地数据');
  const cloud = osCloud();
  const { data: { user }, error } = await cloud.auth.getUser();
  if (error || !user) throw new Error('请先登录西米OS云端账号');
  const owner = await AsyncStorage.getItem(BINDING);
  if (!owner) throw new Error('请先在云端连接页开启同步');
  if (owner !== user.id) throw new Error('此设备数据绑定了另一个账号，已阻止上传');
  const raw = await AsyncStorage.getItem(META);
  const m: Meta = raw ? JSON.parse(raw) : { owner, base: {}, pending: null, cursor: { fragment: 0, review: 0, context: 0 } };
  if (m.owner !== owner) throw new Error('同步账号不匹配');
  try {
    if (await AsyncStorage.getItem('os_sync_conflict_v1')) throw new Error('存在未解决的版本冲突，两份内容已保留，同步已暂停');
    if (m.incoming) await applyIncoming(m);
    if (m.pending) await pushPending(m);
    const local = await collect();
    const current = new Map(local.map((r) => [keyOf(r), r]));
    // Missing rows become tombstones only after a successful previous upload.
    for (const [key, b] of Object.entries(m.base)) {
      if (!current.has(key) && !b.item.deleted) local.push({ ...b.item, deleted: true });
    }
    for (const item of local) {
      const base = m.base[keyOf(item)];
      if (base && fingerprint(base.item) === fingerprint(item)) continue;
      m.pending = { item, version: base?.version ?? 0, operation: uuid() };
      await save(m); // durable outbox BEFORE sending; retries reuse the same operation ID
      await pushPending(m);
    }
    for (const kind of ['fragment', 'review'] as const) {
      for (;;) {
        const { data, error: readError } = await cloud.rpc('ximi_read_records', { p_kind: kind, p_after: m.cursor[kind], p_limit: 100 });
        if (readError) throw new Error(readError.message);
        const records = data as CloudRecord[];
        for (const r of records) {
          // Durable inbox closes the crash window between applying a cloud row
          // and recording its baseline. Replays happen before collecting uploads.
          m.incoming = { kind, record: r };
          await save(m);
          await applyIncoming(m);
        }
        if (records.length < 100) break;
      }
    }
    m.lastSuccess = new Date().toISOString();
    delete m.error;
    await save(m);
    useDataBus.getState().bump();
  } catch (e) {
    m.error = e instanceof Error ? e.message : String(e);
    await save(m);
    throw e;
  }
}

export async function enableOsSync(): Promise<void> {
  const { data: { user }, error } = await osCloud().auth.getUser();
  if (error || !user) throw new Error('请先登录');
  const owner = await AsyncStorage.getItem(BINDING);
  if (owner && owner !== user.id) throw new Error('此设备数据已绑定其他账号');
  if (!owner) {
    // Local safety copy, never placed in the public repository or sent to Notion.
    const { json } = await exportBackup();
    await AsyncStorage.setItem('os_before_cloud_v1', json);
    await AsyncStorage.setItem(BINDING, user.id);
  }
  await syncOs();
}
export async function syncOsIfEnabled(): Promise<void> {
  if (await AsyncStorage.getItem(BINDING)) await syncOs();
}
