import type { TodoCompletion, TodoItem, TodoRepeatType } from '../types';
import { loadCompletions, loadItems, saveCompletions, saveItems } from './todoLocal';
import { genId } from './timelogLocal';
import { enqueueSync } from './timelogSync';

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * 这条事项在某一天要不要出现。date字段是起算点，起算点之前不出现；
 * daily从起算点起每天出现；weekly看repeat_weekdays是否包含这天星期几；
 * monthly看repeat_day_of_month(0表示"最后一天"，按当月实际天数算)。
 */
export function occursOnDate(item: TodoItem, date: Date): boolean {
  const anchor = parseDateKey(item.date);
  const d = startOfDay(date);
  if (d.getTime() < anchor.getTime()) return false;
  switch (item.repeat_type) {
    case 'none':
      return d.getTime() === anchor.getTime();
    case 'daily':
      return true;
    case 'weekly':
      return (item.repeat_weekdays ?? []).includes(d.getDay());
    case 'monthly': {
      const target =
        item.repeat_day_of_month === 0
          ? lastDayOfMonth(d.getFullYear(), d.getMonth())
          : (item.repeat_day_of_month ?? anchor.getDate());
      return d.getDate() === target;
    }
    default:
      return false;
  }
}

/**
 * 不重复事项看done字段本身；重复事项看todo_completions里有没有
 * (todo_id, 这一天)这条记录——没有就是未完成，不用写任何"到点自动重置"逻辑，
 * 第二天自然是未完成，因为查的是那一天有没有记录。
 */
export function isDoneOnDate(item: TodoItem, dateKey: string, completions: TodoCompletion[]): boolean {
  if (item.repeat_type === 'none') return item.done;
  return completions.some((c) => c.todo_id === item.id && c.date === dateKey);
}

const WEEKDAY_CHARS = ['日', '一', '二', '三', '四', '五', '六']; // index = JS Date.getDay()
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 中文习惯从周一开始念

export function formatRepeatLabel(item: TodoItem): string | null {
  switch (item.repeat_type) {
    case 'daily':
      return '每天';
    case 'weekly': {
      const days = item.repeat_weekdays ?? [];
      if (days.length === 0) return '每周';
      const ordered = WEEKDAY_DISPLAY_ORDER.filter((d) => days.includes(d));
      return `每周${ordered.map((d) => WEEKDAY_CHARS[d]).join('')}`;
    }
    case 'monthly':
      return item.repeat_day_of_month === 0 ? '每月最后一天' : `每月${item.repeat_day_of_month ?? ''}号`;
    default:
      return null;
  }
}

// ---------------- todo_items（本地优先） ----------------

export async function fetchItemsForDate(date: Date): Promise<TodoItem[]> {
  const all = await loadItems();
  return all
    .filter((item) => occursOnDate(item, date))
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

/** 给周视图/月历用：一批日期各自当天的事项列表，key是'YYYY-MM-DD' */
export async function fetchItemsForDateRange(dates: Date[]): Promise<Record<string, TodoItem[]>> {
  const all = await loadItems();
  const result: Record<string, TodoItem[]> = {};
  for (const date of dates) {
    const key = toDateKey(date);
    result[key] = all
      .filter((item) => occursOnDate(item, date))
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  }
  return result;
}

/** 月历日期条下面的小数字/小点用：每天有几条事项 */
export async function fetchItemCountsForRange(dates: Date[]): Promise<Record<string, number>> {
  const byDate = await fetchItemsForDateRange(dates);
  const counts: Record<string, number> = {};
  for (const [key, items] of Object.entries(byDate)) counts[key] = items.length;
  return counts;
}

export async function fetchCompletionsForRange(dates: Date[]): Promise<TodoCompletion[]> {
  if (dates.length === 0) return [];
  const keys = new Set(dates.map(toDateKey));
  const all = await loadCompletions();
  return all.filter((c) => keys.has(c.date));
}

export async function addItem(entry: {
  content: string;
  category_id?: string | null;
  important?: boolean;
  date: string;
  repeat_type?: TodoRepeatType;
  repeat_weekdays?: number[] | null;
  repeat_day_of_month?: number | null;
  reminder_enabled?: boolean;
  reminder_time?: string | null;
}): Promise<TodoItem> {
  const all = await loadItems();
  const newItem: TodoItem = {
    id: genId(),
    content: entry.content,
    category_id: entry.category_id ?? null,
    important: entry.important ?? false,
    date: entry.date,
    repeat_type: entry.repeat_type ?? 'none',
    repeat_weekdays: entry.repeat_weekdays ?? null,
    repeat_day_of_month: entry.repeat_day_of_month ?? null,
    reminder_enabled: entry.reminder_enabled ?? false,
    reminder_time: entry.reminder_time ?? null,
    done: false,
    completed_at: null,
    sort_order: all.length,
    created_at: new Date().toISOString(),
  };
  await saveItems([...all, newItem]);
  enqueueSync({ table: 'todo_items', op: 'upsert', row: newItem });
  return newItem;
}

export async function updateItem(id: string, patch: Partial<Omit<TodoItem, 'id' | 'created_at'>>): Promise<void> {
  const all = await loadItems();
  let updated: TodoItem | null = null;
  const next = all.map((item) => {
    if (item.id !== id) return item;
    updated = { ...item, ...patch };
    return updated;
  });
  await saveItems(next);
  if (updated) enqueueSync({ table: 'todo_items', op: 'upsert', row: updated });
}

export async function deleteItem(id: string): Promise<void> {
  const all = await loadItems();
  await saveItems(all.filter((item) => item.id !== id));
  enqueueSync({ table: 'todo_items', op: 'delete', row: { id } });
  // todo_completions外键是on delete cascade，数据库那边会跟着级联删掉，
  // 这里只需要清一下本地缓存，不用逐条enqueueSync delete
  const completions = await loadCompletions();
  const remaining = completions.filter((c) => c.todo_id !== id);
  if (remaining.length !== completions.length) await saveCompletions(remaining);
}

/** 完成/撤销：不重复事项直接改done字段；重复事项操作todo_completions这一天的记录 */
export async function setItemDone(item: TodoItem, dateKey: string, done: boolean): Promise<void> {
  if (item.repeat_type === 'none') {
    await updateItem(item.id, { done, completed_at: done ? new Date().toISOString() : null });
    return;
  }
  const completions = await loadCompletions();
  if (done) {
    if (completions.some((c) => c.todo_id === item.id && c.date === dateKey)) return; // 已经有了，幂等
    const newCompletion: TodoCompletion = {
      id: genId(),
      todo_id: item.id,
      date: dateKey,
      created_at: new Date().toISOString(),
    };
    await saveCompletions([...completions, newCompletion]);
    enqueueSync({ table: 'todo_completions', op: 'upsert', row: newCompletion });
  } else {
    const existing = completions.find((c) => c.todo_id === item.id && c.date === dateKey);
    if (!existing) return;
    await saveCompletions(completions.filter((c) => c.id !== existing.id));
    enqueueSync({ table: 'todo_completions', op: 'delete', row: { id: existing.id } });
  }
}

/**
 * 算出这条事项从from这一刻起下一次该提醒的具体时间点，给提醒推送调度用。
 * 纯JS日期计算，逐天扫描occursOnDate直到命中（最多看400天，覆盖"每月最后一天"
 * 这类需要跨年才能验证周期性的边界情况），命中后再套上reminder_time的时分。
 */
export function nextTodoOccurrence(item: TodoItem, from: Date): Date | null {
  if (!item.reminder_enabled || !item.reminder_time) return null;
  const parts = item.reminder_time.split(':').map(Number);
  const hh = parts[0] ?? 0;
  const mm = parts[1] ?? 0;
  const anchor = parseDateKey(item.date);
  let cursor = new Date(Math.max(startOfDay(from).getTime(), anchor.getTime()));
  for (let i = 0; i < 400; i++) {
    if (occursOnDate(item, cursor)) {
      const candidate = new Date(cursor);
      candidate.setHours(hh, mm, 0, 0);
      if (candidate.getTime() >= from.getTime()) return candidate;
    }
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

export { toDateKey, parseDateKey };
