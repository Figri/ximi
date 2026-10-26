import type { ScheduleCheck, ScheduleCheckSource, ScheduleDiary, ScheduleItem, ScheduleSlot, ScheduleTemplateItem, ScheduleTemplateVersion } from '../types';
import {
  enqueueSync,
  genId,
  loadChecks,
  loadDiaries,
  loadItems,
  loadTemplateItems,
  loadTemplateVersions,
  saveChecks,
  saveDiaries,
  saveItems,
  saveTemplateItems,
  saveTemplateVersions,
} from './scheduleLocal';

export const SLOTS: ScheduleSlot[] = ['08', '10', '12', '14', '16', '18', '20', '22'];

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return toDateKey(dt);
}

export function todayDateKey(): string {
  return toDateKey(new Date());
}

// ---------------- 重复事项规则：'weekly:1,5' / 'monthly:7,22' ----------------
// 跟事项(todo)模块同一个星期约定：0=周日...6=周六(JS Date.getDay())，
// 保持这个app里"星期几怎么编号"这件事全局统一，不要两套。
function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function occursOnDate(item: ScheduleItem, dateKey: string): boolean {
  if (dateKey < item.date) return false; // anchor之前不存在
  if (!item.recurring_rule) return dateKey === item.date;
  const [type, rest] = item.recurring_rule.split(':');
  const days = (rest || '').split(',').filter(Boolean).map(Number);
  const d = parseDateKey(dateKey);
  if (type === 'weekly') return days.includes(d.getDay());
  if (type === 'monthly') return days.includes(d.getDate());
  return false;
}

// ---------------- 模板版本：取 effective_from<=date 的最新版本 ----------------
// 同一天改了好几次模板，几版都是「明天生效」：后存的那版算数（以前取的是第一版，后面几次改了等于白改）
function isNewerVersion(v: ScheduleTemplateVersion, than: ScheduleTemplateVersion): boolean {
  if (v.effective_from !== than.effective_from) return v.effective_from > than.effective_from;
  return (v.created_at ?? '') >= (than.created_at ?? '');
}

export function findVersionForDate(versions: ScheduleTemplateVersion[], dateKey: string): ScheduleTemplateVersion | null {
  const applicable = versions.filter((v) => v.effective_from <= dateKey);
  if (applicable.length === 0) return null;
  return applicable.reduce((best, v) => (isNewerVersion(v, best) ? v : best));
}

// ---------------- 某一天的渲染视图 ----------------
export interface ScheduleRow {
  key: string; // `${source}:${refId}`，列表key和勾选记录的定位key都用它
  source: ScheduleCheckSource;
  refId: string;
  title: string;
  slot: ScheduleSlot;
  shape: 'square' | 'circle'; // square=模板来的日常作息，circle=事项(重复/单个/当场补的)
  starred: boolean;
  done: boolean;
  sort: number;
}

export interface DayView {
  dateKey: string;
  diary: string;
  rowsBySlot: Record<ScheduleSlot, ScheduleRow[]>;
  hasTemplate: boolean;
}

export async function fetchDayView(dateKey: string): Promise<DayView> {
  const [versions, templateItems, items, checks, diaries] = await Promise.all([
    loadTemplateVersions(),
    loadTemplateItems(),
    loadItems(),
    loadChecks(),
    loadDiaries(),
  ]);

  const checkSet = new Set(checks.filter((c) => c.date === dateKey).map((c) => `${c.source}:${c.ref_id}`));
  const version = findVersionForDate(versions, dateKey);

  const rowsBySlot: Record<ScheduleSlot, ScheduleRow[]> = { allday: [], '08': [], '10': [], '12': [], '14': [], '16': [], '18': [], '20': [], '22': [] };

  if (version) {
    const vItems = templateItems.filter((t) => t.version_id === version.id).sort((a, b) => a.sort - b.sort);
    for (const t of vItems) {
      const row: ScheduleRow = {
        key: `template:${t.id}`,
        source: 'template',
        refId: t.id,
        title: t.title,
        slot: t.slot,
        shape: 'square',
        starred: false,
        done: checkSet.has(`template:${t.id}`),
        sort: t.sort,
      };
      (rowsBySlot[t.slot] ?? rowsBySlot.allday).push(row);
    }
  }

  const dueItems = items.filter((it) => occursOnDate(it, dateKey)).sort((a, b) => a.sort - b.sort);
  for (const it of dueItems) {
    const slot = it.slot ?? 'allday';
    const row: ScheduleRow = {
      key: `item:${it.id}`,
      source: 'item',
      refId: it.id,
      title: it.title,
      slot,
      shape: 'circle',
      starred: it.starred,
      done: checkSet.has(`item:${it.id}`),
      sort: it.sort,
    };
    (rowsBySlot[slot] ?? rowsBySlot.allday).push(row);
  }

  const diary = diaries.find((d) => d.date === dateKey)?.content ?? '';

  return { dateKey, diary, rowsBySlot, hasTemplate: !!version };
}

// ---------------- 勾选 ----------------
export async function setChecked(
  dateKey: string,
  source: ScheduleCheckSource,
  refId: string,
  titleSnapshot: string,
  checked: boolean
): Promise<void> {
  const all = await loadChecks();
  const idx = all.findIndex((c) => c.date === dateKey && c.source === source && c.ref_id === refId);
  if (checked) {
    if (idx >= 0) return; // 已经有了，不重复写
    const row: ScheduleCheck = { id: genId(), date: dateKey, source, ref_id: refId, title_snapshot: titleSnapshot, done_at: new Date().toISOString() };
    await saveChecks([...all, row]);
    enqueueSync({ table: 'schedule_check', op: 'upsert', row });
  } else {
    if (idx < 0) return;
    const row = all[idx];
    await saveChecks(all.filter((_, i) => i !== idx));
    enqueueSync({ table: 'schedule_check', op: 'delete', row: { id: row.id } });
  }
}

// ---------------- 事项 CRUD ----------------
export async function addItem(entry: {
  date: string;
  slot: ScheduleSlot | null;
  title: string;
  starred?: boolean;
  recurring_rule?: string | null;
  remind_at?: string | null;
}): Promise<ScheduleItem> {
  const all = await loadItems();
  const sameSlot = all.filter((i) => (i.slot ?? 'allday') === (entry.slot ?? 'allday'));
  const row: ScheduleItem = {
    id: genId(),
    date: entry.date,
    slot: entry.slot,
    title: entry.title,
    starred: entry.starred ?? false,
    remind_at: entry.remind_at ?? null,
    recurring_rule: entry.recurring_rule ?? null,
    sort: sameSlot.length,
    created_at: new Date().toISOString(),
  };
  await saveItems([...all, row]);
  enqueueSync({ table: 'schedule_item', op: 'upsert', row });
  return row;
}

export async function updateItem(id: string, patch: Partial<Pick<ScheduleItem, 'title' | 'slot' | 'starred' | 'recurring_rule' | 'remind_at' | 'sort'>>): Promise<ScheduleItem | null> {
  const all = await loadItems();
  const idx = all.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const updated = { ...all[idx], ...patch };
  const next = [...all];
  next[idx] = updated;
  await saveItems(next);
  enqueueSync({ table: 'schedule_item', op: 'upsert', row: updated });
  return updated;
}

export async function deleteItem(id: string): Promise<void> {
  const all = await loadItems();
  await saveItems(all.filter((i) => i.id !== id));
  enqueueSync({ table: 'schedule_item', op: 'delete', row: { id } });
}

// ---------------- 日记 ----------------
export async function setDiary(dateKey: string, content: string): Promise<void> {
  const all = await loadDiaries();
  const idx = all.findIndex((d) => d.date === dateKey);
  const row: ScheduleDiary = { date: dateKey, content };
  const next = idx >= 0 ? all.map((d, i) => (i === idx ? row : d)) : [...all, row];
  await saveDiaries(next);
  enqueueSync({ table: 'schedule_diary', op: 'upsert', row });
}

// ---------------- 模板（设置页用） ----------------
export async function fetchLatestTemplateItems(): Promise<ScheduleTemplateItem[]> {
  const [versions, templateItems] = await Promise.all([loadTemplateVersions(), loadTemplateItems()]);
  if (versions.length === 0) return [];
  const latest = versions.reduce((best, v) => (isNewerVersion(v, best) ? v : best));
  return templateItems.filter((t) => t.version_id === latest.id).sort((a, b) => a.sort - b.sort);
}

/** 保存模板 = 新建一个 effective_from=明天 的版本，不覆盖旧版本——历史版本永久保留 */
export async function saveNewTemplateVersion(items: { slot: ScheduleSlot; title: string }[]): Promise<void> {
  const versions = await loadTemplateVersions();
  const templateItems = await loadTemplateItems();
  const versionId = genId();
  const version: ScheduleTemplateVersion = { id: versionId, effective_from: addDays(todayDateKey(), 1), created_at: new Date().toISOString() };
  const newItems: ScheduleTemplateItem[] = items.map((it, i) => ({ id: genId(), version_id: versionId, slot: it.slot, title: it.title, sort: i }));

  await saveTemplateVersions([...versions, version]);
  await saveTemplateItems([...templateItems, ...newItems]);
  enqueueSync({ table: 'schedule_template_version', op: 'upsert', row: version });
  for (const it of newItems) enqueueSync({ table: 'schedule_template_item', op: 'upsert', row: it });
}

// ---------------- 月历标记：这个月每天有没有事项/记录/星标 ----------------
export interface MonthMark {
  dateKey: string;
  starred: boolean;
}
export async function fetchMonthMarks(year: number, month0: number): Promise<MonthMark[]> {
  const [items, checks] = await Promise.all([loadItems(), loadChecks()]);
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const marks: MonthMark[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = toDateKey(new Date(year, month0, d));
    const dueItems = items.filter((it) => occursOnDate(it, dateKey));
    const hasAnyRecord = dueItems.length > 0 || checks.some((c) => c.date === dateKey);
    if (!hasAnyRecord) continue;
    const starred = dueItems.some((it) => it.starred);
    marks.push({ dateKey, starred });
  }
  return marks;
}
