import type { ScheduleCheckSource, ScheduleSlot, TodoItem } from '../types';
import { fetchDayView, SLOTS, setChecked } from './schedule';
import { fetchItemsForDate, formatRepeatLabel, isDoneOnDate, parseDateKey, setItemDone } from './todo';
import { loadCompletions as loadTodoCompletions, loadItems as loadTodoItems } from './todoLocal';

// 今天页「作息和事项」（需求文档 §8.1 T-2、§8.5）：
// 日程的作息模板（例行）、日程事项、事项模块里今天要做的、以前没做完的一次性事项（顺延，灰字，不标红）
// 合成一张按时段排的单子。今天页上勾选、长按事项改；作息和日程事项在日程页排，新的用右下角 ＋。

export type AgendaKind = 'routine' | 'item' | 'todo';

export interface AgendaRow {
  key: string;
  kind: AgendaKind;
  title: string;
  slot: ScheduleSlot;
  done: boolean;
  starred: boolean;
  /** 事项设了提醒时间：'HH:MM' */
  time: string | null;
  /** 顺延的一次性事项：原来是哪天（'M/D'） */
  carriedFrom: string | null;
  /** 重复事项：每天 / 每周一三 / 每月 5 号 */
  repeatLabel: string | null;
  source?: ScheduleCheckSource;
  refId?: string;
  todo?: TodoItem;
}

export const SLOT_LABEL: Record<ScheduleSlot, string> = {
  allday: '全天',
  '08': '8 点',
  '10': '10 点',
  '12': '12 点',
  '14': '14 点',
  '16': '16 点',
  '18': '18 点',
  '20': '20 点',
  '22': '22 点',
};

/** 提醒时间落在哪个时段：时段从 8 点起每 2 小时一格，凌晨的算进 22 点那格（还是这一天的尾巴） */
export function slotForTime(hhmm: string | null, dayStartHour = 5): ScheduleSlot {
  if (!hhmm) return 'allday';
  const h = Number(hhmm.split(':')[0]);
  if (!Number.isFinite(h)) return 'allday';
  if (h < dayStartHour) return '22';
  let slot: ScheduleSlot = '08';
  for (const s of SLOTS) if (h >= Number(s)) slot = s;
  return slot;
}

function md(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${m}/${d}`;
}

export async function loadAgenda(dayKey: string, opts: { includeCarried?: boolean; dayStartHour?: number } = {}): Promise<Record<ScheduleSlot, AgendaRow[]>> {
  const out: Record<ScheduleSlot, AgendaRow[]> = { allday: [], '08': [], '10': [], '12': [], '14': [], '16': [], '18': [], '20': [], '22': [] };
  const view = await fetchDayView(dayKey);
  for (const [slot, rows] of Object.entries(view.rowsBySlot) as [ScheduleSlot, typeof view.rowsBySlot.allday][]) {
    for (const r of rows) {
      out[slot].push({
        key: r.key,
        kind: r.source === 'template' ? 'routine' : 'item',
        title: r.title,
        slot,
        done: r.done,
        starred: r.starred,
        time: null,
        carriedFrom: null,
        repeatLabel: null,
        source: r.source,
        refId: r.refId,
      });
    }
  }

  const [todos, completions] = await Promise.all([fetchItemsForDate(parseDateKey(dayKey)), loadTodoCompletions()]);
  for (const t of todos) {
    const slot = t.reminder_enabled ? slotForTime(t.reminder_time, opts.dayStartHour) : 'allday';
    out[slot].push({
      key: `todo:${t.id}`,
      kind: 'todo',
      title: t.content,
      slot,
      done: isDoneOnDate(t, dayKey, completions),
      starred: t.important,
      time: t.reminder_enabled ? t.reminder_time : null,
      carriedFrom: null,
      repeatLabel: formatRepeatLabel(t),
      todo: t,
    });
  }

  if (opts.includeCarried) {
    const all = await loadTodoItems();
    const carried = all
      .filter((t) => t.repeat_type === 'none' && !t.done && t.date < dayKey)
      .sort((a, b) => a.date.localeCompare(b.date));
    for (const t of carried) {
      out.allday.push({
        key: `todo:${t.id}`,
        kind: 'todo',
        title: t.content,
        slot: 'allday',
        done: false,
        starred: t.important,
        time: null,
        carriedFrom: md(t.date),
        repeatLabel: null,
        todo: t,
      });
    }
  }

  // 同一格里：有时间的按时间排，星标的往前，其余保持原来的顺序
  for (const slot of Object.keys(out) as ScheduleSlot[]) {
    out[slot] = out[slot]
      .map((r, i) => ({ r, i }))
      .sort((a, b) => (a.r.time ?? '99').localeCompare(b.r.time ?? '99') || Number(b.r.starred) - Number(a.r.starred) || a.i - b.i)
      .map((x) => x.r);
  }
  return out;
}

/** 勾 / 取消勾：作息和日程事项记在日程的勾选表，事项模块的记在它自己的完成记录 */
export async function setAgendaDone(row: AgendaRow, dayKey: string, done: boolean): Promise<void> {
  if (row.kind === 'todo' && row.todo) {
    // 顺延来的一次性事项：做完就是做完了，记在它自己身上
    await setItemDone(row.todo, dayKey, done);
    return;
  }
  if (row.source && row.refId) await setChecked(dayKey, row.source, row.refId, row.title, done);
}

export function agendaCount(rows: Record<ScheduleSlot, AgendaRow[]>): { total: number; done: number } {
  const all = Object.values(rows).flat();
  return { total: all.length, done: all.filter((r) => r.done).length };
}
