import AsyncStorage from '@react-native-async-storage/async-storage';

// 本地数据库：用法跟 supabase-js 的 from(table).select().eq()... 一样，数据存在手机本地
// （AsyncStorage）。原来直连 Supabase 的模块只要把 supabase 换成 db，查询代码一行不用改。
//
// 存储：每张表按 200 行一块分开存（ldb_v1_<表>_<块号>），外加一个 _meta 记块数。
// 只重写改动过的块，避免一张大表每次写入都整表重写，也避开安卓单个 key 的大小上限。
// 内存里的表是读写的真相来源，所有查询在内存里同步完成，持久化按表串行排队，
// 不会出现并发"读-改-写"互相覆盖。

type Row = Record<string, any>;
export type DbError = { message: string; code?: string };
export type DbResult<T = any> = { data: T; error: DbError | null };

const PREFIX = 'ldb_v1_';
const CHUNK_ROWS = 200;

interface TableState {
  chunks: Row[][];
  dirty: Set<number>;
}

const tables = new Map<string, TableState>();
const loading = new Map<string, Promise<TableState>>();
const writeChains = new Map<string, Promise<void>>();

/** 主键：大多数表是 id，settings 是 key */
const PRIMARY_KEY: Record<string, string> = { settings: 'key' };
/** 唯一约束：插入重复值时返回 23505，跟 Postgres 一致 */
const UNIQUE: Record<string, string[]> = { tags: ['name'], daily_summaries: ['date'] };
/** 级联删除：删父表一行，子表里引用它的行一起删 */
const CASCADE: Record<string, { table: string; column: string }[]> = {
  cards: [
    { table: 'actions', column: 'card_id' },
    { table: 'completions', column: 'card_id' },
    { table: 'card_links', column: 'from_card_id' },
    { table: 'card_links', column: 'to_card_id' },
    { table: 'collections', column: 'card_id' },
  ],
  actions: [{ table: 'completions', column: 'action_id' }],
  cats: [{ table: 'cat_events', column: 'cat_id' }],
  projects: [{ table: 'project_logs', column: 'project_id' }],
  folders: [
    { table: 'notes', column: 'folder_id' },
    { table: 'folders', column: 'parent_id' },
  ],
};

const NOW = '__now__';
/** 各表的列默认值，对应 supabase/schema.sql 和 migrations 里的 default */
const DEFAULTS: Record<string, Row> = {
  cards: {
    type: 'habit', tags: [], notes: null, time_of_day: 'anytime', emoji: null, archived: false,
    display_type: 'habit', priority: 'normal', due_date: null, created_at: NOW, updated_at: NOW,
  },
  actions: {
    is_primary: true, frequency_type: 'interval', interval_days: null, fixed_days: null, fixed_dates: null,
    suggested_interval: null, max_delay: null, linked_action_ids: null, requires_selection: false,
    active_hours_start: null, active_hours_end: null, created_at: NOW,
  },
  completions: { completed_at: NOW, notes: null, selected_cats: null, undone: false },
  card_links: { link_type: 'related' },
  collections: { content: null, url: null, image_url: null, source: 'manual' },
  cats: { gender: null, avatar_url: null, notes: null, created_at: NOW },
  cat_events: { description: null, value: null, created_at: NOW },
  timeline_entries: {
    end_time: null, category: null, description: null, app_name: null, image_url: null, source: 'manual',
    hp_change: null, mp_change: null, icon: null, created_at: NOW,
  },
  worries: { tags: [], severity: 'medium', status: 'active', created_at: NOW, resolved_at: null },
  daily_summaries: { created_at: NOW },
  messages: { model: null, image_url: null, created_at: NOW },
  tags: { emoji: null, sort_order: 0 },
  projects: {
    status: 'idea', description: null, linked_worry_ids: null, linked_card_ids: null, created_at: NOW, updated_at: NOW,
  },
  project_logs: { content: null, source: 'manual', created_at: NOW },
  folders: { parent_id: null, sort_order: 0, created_at: NOW },
  notes: { folder_id: null, title: '无标题', content: '', sort_order: 0, created_at: NOW, updated_at: NOW },
};

export function uuid(): string {
  // RFC4122 v4，不依赖原生模块
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function pkOf(table: string): string {
  return PRIMARY_KEY[table] ?? 'id';
}

async function loadTable(name: string): Promise<TableState> {
  const cached = tables.get(name);
  if (cached) return cached;
  let p = loading.get(name);
  if (!p) {
    p = (async () => {
      let chunks: Row[][] = [];
      try {
        const metaRaw = await AsyncStorage.getItem(`${PREFIX}${name}_meta`);
        const count = metaRaw ? Number(JSON.parse(metaRaw)?.chunks ?? 0) : 0;
        if (count > 0) {
          const keys = Array.from({ length: count }, (_, i) => `${PREFIX}${name}_${i}`);
          const values = await AsyncStorage.getMany(keys);
          chunks = keys.map((k) => {
            const raw = values[k];
            try {
              const parsed = raw ? JSON.parse(raw) : [];
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          });
        }
      } catch {
        chunks = [];
      }
      const st: TableState = { chunks, dirty: new Set() };
      tables.set(name, st);
      return st;
    })();
    loading.set(name, p);
  }
  return p;
}

function allRows(st: TableState): Row[] {
  const out: Row[] = [];
  for (const c of st.chunks) for (const r of c) out.push(r);
  return out;
}

/** 把当前内存状态里改动过的块写回存储；按表串行，后一次写一定落在前一次之后 */
function persist(name: string, st: TableState): Promise<void> {
  const prev = writeChains.get(name) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      if (st.dirty.size === 0) return;
      const entries: Record<string, string> = {};
      for (const i of st.dirty) entries[`${PREFIX}${name}_${i}`] = JSON.stringify(st.chunks[i] ?? []);
      st.dirty.clear();
      entries[`${PREFIX}${name}_meta`] = JSON.stringify({ chunks: st.chunks.length });
      await AsyncStorage.setMany(entries);
    });
  writeChains.set(name, next);
  return next;
}

function appendRow(st: TableState, row: Row) {
  let last = st.chunks.length - 1;
  if (last < 0 || st.chunks[last].length >= CHUNK_ROWS) {
    st.chunks.push([]);
    last = st.chunks.length - 1;
  }
  st.chunks[last].push(row);
  st.dirty.add(last);
}

function locate(st: TableState, pred: (r: Row) => boolean): { chunk: number; index: number }[] {
  const hits: { chunk: number; index: number }[] = [];
  st.chunks.forEach((c, ci) => c.forEach((r, ri) => pred(r) && hits.push({ chunk: ci, index: ri })));
  return hits;
}

function withDefaults(table: string, row: Row): Row {
  const now = new Date().toISOString();
  const defaults = DEFAULTS[table] ?? {};
  const out: Row = {};
  for (const [k, v] of Object.entries(defaults)) out[k] = v === NOW ? now : Array.isArray(v) ? [...v] : v;
  Object.assign(out, row);
  const pk = pkOf(table);
  if (pk === 'id' && (out.id == null || out.id === '')) out.id = uuid();
  return out;
}

// ---- 比较与过滤 ----

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function cmp(a: any, b: any): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const sa = String(a);
  const sb = String(b);
  // Supabase 返回 "+00:00" 结尾、JS 生成 "Z" 结尾，两种时间戳格式混在一起时按真实时间比
  if (ISO_RE.test(sa) && ISO_RE.test(sb)) {
    const ta = Date.parse(sa);
    const tb = Date.parse(sb);
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  }
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function same(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return cmp(a, b) === 0;
}

function ilike(value: any, pattern: string): boolean {
  if (value == null) return false;
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${esc}$`, 'i').test(String(value));
}

/** 解析 PostgREST 的 or 语法：'title.ilike.%猫%,content.ilike.%猫%' */
function parseOr(expr: string): (r: Row) => boolean {
  const parts = expr.split(',').map((s) => s.trim()).filter(Boolean);
  const preds = parts.map((p) => {
    const m = p.match(/^([^.]+)\.(eq|neq|ilike|like|gt|gte|lt|lte|is)\.(.*)$/);
    if (!m) return () => false;
    const [, col, op, raw] = m;
    const val = raw === 'null' ? null : raw;
    switch (op) {
      case 'eq': return (r: Row) => same(r[col], val);
      case 'neq': return (r: Row) => !same(r[col], val);
      case 'ilike':
      case 'like': return (r: Row) => ilike(r[col], String(val));
      case 'gt': return (r: Row) => cmp(r[col], val) > 0;
      case 'gte': return (r: Row) => cmp(r[col], val) >= 0;
      case 'lt': return (r: Row) => cmp(r[col], val) < 0;
      case 'lte': return (r: Row) => cmp(r[col], val) <= 0;
      case 'is': return (r: Row) => (val === null ? r[col] == null : same(r[col], val));
      default: return () => false;
    }
  });
  return (r) => preds.some((f) => f(r));
}

/** 顶层逗号拆分，括号里的逗号不拆：'*, card:cards(name, created_at)' */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function project(table: string, rows: Row[], cols: string): Promise<Row[]> {
  const parts = splitTop(cols || '*');
  const plain = parts.filter((p) => !p.includes('('));
  const embeds = parts
    .filter((p) => p.includes('('))
    .map((p) => {
      const m = p.match(/^(?:(\w+):)?(\w+)\((.*)\)$/);
      if (!m) return null;
      const [, alias, foreign, inner] = m;
      return { alias: alias ?? foreign, foreign, inner };
    })
    .filter((e): e is { alias: string; foreign: string; inner: string } => !!e);

  const embedRows: Record<string, Row[]> = {};
  for (const e of embeds) embedRows[e.foreign] = allRows(await loadTable(e.foreign));

  return rows.map((r) => {
    let out: Row;
    if (plain.includes('*') || plain.length === 0) out = { ...r };
    else {
      out = {};
      for (const c of plain) out[c] = r[c] ?? null;
    }
    for (const e of embeds) {
      const fkCandidates = [`${e.alias}_id`, `${e.foreign.replace(/s$/, '')}_id`];
      const fk = fkCandidates.find((k) => k in r);
      const target = fk ? embedRows[e.foreign].find((x) => same(x.id, r[fk])) : undefined;
      if (!target) out[e.alias] = null;
      else if (e.inner.trim() === '*') out[e.alias] = { ...target };
      else {
        const picked: Row = {};
        for (const c of e.inner.split(',').map((x) => x.trim())) picked[c] = target[c] ?? null;
        out[e.alias] = picked;
      }
    }
    return out;
  });
}

// ---- 查询构造器 ----

type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

class LocalQuery<T = any> implements PromiseLike<DbResult<T>> {
  private op: Op = 'select';
  private cols = '*';
  private returning = false;
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleMode: 'single' | 'maybe' | null = null;
  private payload: any = null;
  private conflict: string | null = null;

  constructor(private table: string) {}

  select(cols = '*'): this {
    if (this.op === 'select') this.cols = cols;
    else {
      this.returning = true;
      this.cols = cols;
    }
    return this;
  }
  insert(rows: Row | Row[]): this {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  update(patch: Row): this {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete(): this {
    this.op = 'delete';
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }): this {
    this.op = 'upsert';
    this.payload = rows;
    this.conflict = opts?.onConflict ?? null;
    return this;
  }
  eq(col: string, v: any): this {
    this.filters.push((r) => same(r[col], v));
    return this;
  }
  neq(col: string, v: any): this {
    this.filters.push((r) => !same(r[col], v));
    return this;
  }
  in(col: string, values: any[]): this {
    this.filters.push((r) => values.some((v) => same(r[col], v)));
    return this;
  }
  gt(col: string, v: any): this {
    this.filters.push((r) => r[col] != null && cmp(r[col], v) > 0);
    return this;
  }
  gte(col: string, v: any): this {
    this.filters.push((r) => r[col] != null && cmp(r[col], v) >= 0);
    return this;
  }
  lt(col: string, v: any): this {
    this.filters.push((r) => r[col] != null && cmp(r[col], v) < 0);
    return this;
  }
  lte(col: string, v: any): this {
    this.filters.push((r) => r[col] != null && cmp(r[col], v) <= 0);
    return this;
  }
  is(col: string, v: null | boolean): this {
    this.filters.push((r) => (v === null ? r[col] == null : r[col] === v));
    return this;
  }
  not(col: string, op: string, v: any): this {
    if (op === 'is') this.filters.push((r) => (v === null ? r[col] != null : r[col] !== v));
    else if (op === 'eq') this.filters.push((r) => !same(r[col], v));
    return this;
  }
  ilike(col: string, pattern: string): this {
    this.filters.push((r) => ilike(r[col], pattern));
    return this;
  }
  or(expr: string): this {
    this.filters.push(parseOr(expr));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number): this {
    this.lim = n;
    return this;
  }
  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  maybeSingle(): this {
    this.singleMode = 'maybe';
    return this;
  }
  single(): this {
    this.singleMode = 'single';
    return this;
  }

  then<R1 = DbResult<T>, R2 = never>(
    onfulfilled?: ((value: DbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null
  ): Promise<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private matches(r: Row): boolean {
    return this.filters.every((f) => f(r));
  }

  private shape(rows: Row[]): DbResult<any> {
    if (this.singleMode === 'single') {
      if (rows.length !== 1) {
        return { data: null, error: { message: `需要 1 行，实际 ${rows.length} 行`, code: 'PGRST116' } };
      }
      return { data: rows[0], error: null };
    }
    if (this.singleMode === 'maybe') {
      if (rows.length > 1) return { data: null, error: { message: '多于 1 行', code: 'PGRST116' } };
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  private async execute(): Promise<DbResult<any>> {
    try {
      const st = await loadTable(this.table);
      switch (this.op) {
        case 'select': {
          let rows = allRows(st).filter((r) => this.matches(r));
          if (this.orders.length) {
            rows = [...rows].sort((a, b) => {
              for (const o of this.orders) {
                const c = cmp(a[o.col], b[o.col]);
                if (c !== 0) return o.asc ? c : -c;
              }
              return 0;
            });
          }
          if (this.rangeFrom != null && this.rangeTo != null) rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
          if (this.lim != null) rows = rows.slice(0, this.lim);
          return this.shape(await project(this.table, rows, this.cols));
        }
        case 'insert': {
          const input: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
          const existing = allRows(st);
          const prepared = input.map((r) => withDefaults(this.table, r));
          for (const cols of UNIQUE[this.table] ?? []) {
            for (const r of prepared) {
              if (existing.some((x) => same(x[cols], r[cols]))) {
                return { data: null, error: { message: `${this.table}.${cols} 重复`, code: '23505' } };
              }
            }
          }
          const pk = pkOf(this.table);
          for (const r of prepared) {
            if (existing.some((x) => same(x[pk], r[pk]))) {
              return { data: null, error: { message: `${this.table} 主键重复`, code: '23505' } };
            }
          }
          for (const r of prepared) appendRow(st, r);
          await persist(this.table, st);
          if (!this.returning) return { data: null, error: null };
          return this.shape(await project(this.table, prepared.map((r) => ({ ...r })), this.cols));
        }
        case 'update': {
          const hits = locate(st, (r) => this.matches(r));
          const updated: Row[] = [];
          for (const h of hits) {
            const next = { ...st.chunks[h.chunk][h.index], ...this.payload };
            st.chunks[h.chunk][h.index] = next;
            st.dirty.add(h.chunk);
            updated.push(next);
          }
          await persist(this.table, st);
          if (!this.returning) return { data: null, error: null };
          return this.shape(await project(this.table, updated.map((r) => ({ ...r })), this.cols));
        }
        case 'delete': {
          const removed: Row[] = [];
          for (let ci = 0; ci < st.chunks.length; ci++) {
            const keep: Row[] = [];
            for (const r of st.chunks[ci]) (this.matches(r) ? removed : keep).push(r);
            if (keep.length !== st.chunks[ci].length) {
              st.chunks[ci] = keep;
              st.dirty.add(ci);
            }
          }
          await persist(this.table, st);
          await cascadeDelete(this.table, removed);
          if (!this.returning) return { data: null, error: null };
          return this.shape(removed);
        }
        case 'upsert': {
          const input: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
          const keyCols = (this.conflict ?? pkOf(this.table)).split(',').map((s) => s.trim());
          const result: Row[] = [];
          for (const r of input) {
            const hits = locate(st, (x) => keyCols.every((k) => r[k] !== undefined && same(x[k], r[k])));
            if (hits.length) {
              const h = hits[0];
              const next = { ...st.chunks[h.chunk][h.index], ...r };
              st.chunks[h.chunk][h.index] = next;
              st.dirty.add(h.chunk);
              result.push(next);
            } else {
              const row = withDefaults(this.table, r);
              appendRow(st, row);
              result.push(row);
            }
          }
          await persist(this.table, st);
          if (!this.returning) return { data: null, error: null };
          return this.shape(await project(this.table, result.map((x) => ({ ...x })), this.cols));
        }
      }
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  }
}

async function cascadeDelete(table: string, removed: Row[]): Promise<void> {
  const children = CASCADE[table];
  if (!children || removed.length === 0) return;
  const ids = removed.map((r) => r.id).filter((x) => x != null);
  for (const child of children) {
    await new LocalQuery(child.table).delete().in(child.column, ids);
  }
}

export interface LocalDb {
  from<T = any>(table: string): LocalQuery<T>;
}

export const db: LocalDb = {
  from: (table: string) => new LocalQuery(table) as any,
};

// ---- 给迁移、备份、恢复用的整表读写 ----

export async function readTable(table: string): Promise<Row[]> {
  return allRows(await loadTable(table)).map((r) => ({ ...r }));
}

/** 按主键合并写入：已有的行用新值覆盖，没有的追加。返回新增+更新的行数 */
export async function mergeRows(table: string, rows: Row[]): Promise<number> {
  if (rows.length === 0) return 0;
  const st = await loadTable(table);
  const pk = pkOf(table);
  const index = new Map<string, { chunk: number; index: number }>();
  st.chunks.forEach((c, ci) => c.forEach((r, ri) => index.set(String(r[pk]), { chunk: ci, index: ri })));
  for (const r of rows) {
    const key = String(r[pk]);
    const hit = index.get(key);
    if (hit) {
      st.chunks[hit.chunk][hit.index] = { ...st.chunks[hit.chunk][hit.index], ...r };
      st.dirty.add(hit.chunk);
    } else {
      appendRow(st, { ...r });
      const last = st.chunks.length - 1;
      index.set(key, { chunk: last, index: st.chunks[last].length - 1 });
    }
  }
  await persist(table, st);
  return rows.length;
}

/** 整表替换（恢复备份用） */
export async function replaceTable(table: string, rows: Row[]): Promise<void> {
  const st = await loadTable(table);
  const oldCount = st.chunks.length;
  st.chunks = [];
  for (const r of rows) appendRow(st, { ...r });
  for (let i = 0; i < st.chunks.length; i++) st.dirty.add(i);
  await persist(table, st);
  // 新表比旧表少块（或者清空）时，dirty 里没有东西能触发写 meta，这里显式写一次，再删多出来的旧块
  await AsyncStorage.setItem(`${PREFIX}${table}_meta`, JSON.stringify({ chunks: st.chunks.length }));
  if (oldCount > st.chunks.length) {
    const stale = Array.from({ length: oldCount - st.chunks.length }, (_, i) => `${PREFIX}${table}_${st.chunks.length + i}`);
    await AsyncStorage.removeMany(stale);
  }
}

/** 测试用：清掉内存缓存，下一次查询重新从存储读 */
export function resetLocalDbCache(): void {
  tables.clear();
  loading.clear();
  writeChains.clear();
}
