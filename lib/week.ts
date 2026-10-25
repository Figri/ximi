import { db } from './localdb';
import { buildDayDigest, dayWindow } from './dayDigest';
import { stateEventsBetween } from './states';
import { loadChecks } from './scheduleLocal';
import type { Action, Card } from '../types';

// 本周（需求文档 §8.7）：OS 只放数字——时间去了哪、例行做了几次、各种状态出现了几次。不打分、不算连续天数。
// 一周从周一算，一天从「一天从几点算起」那个点算。

export interface WeekSummary {
  days: string[];
  timeByCategory: { name: string; minutes: number; color: string }[];
  states: { state: string; count: number }[];
  routines: { name: string; count: number }[];
  todosDone: number;
  sleepAvg: number | null;
  sleepNights: number;
  fragments: number;
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 这一天所在那一周（周一到周日）的 7 个日期 key */
export function weekDays(dayKey: string): string[] {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const monday = new Date(y, m - 1, d - ((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => keyOf(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
}

export function shiftWeek(dayKey: string, weeks: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d + weeks * 7));
}

export async function buildWeek(dayKey: string, dayStartHour = 5): Promise<WeekSummary> {
  const days = weekDays(dayKey);
  const start = dayWindow(days[0], dayStartHour).start;
  const end = dayWindow(days[6], dayStartHour).end;

  const byCat = new Map<string, { name: string; minutes: number; color: string }>();
  let todosDone = 0;
  let fragments = 0;
  const sleeps: number[] = [];
  for (const k of days) {
    const dg = await buildDayDigest(k, dayStartHour);
    for (const c of dg.timeByCategory) {
      const cur = byCat.get(c.name) ?? { name: c.name, minutes: 0, color: c.color };
      cur.minutes += c.minutes;
      byCat.set(c.name, cur);
    }
    todosDone += dg.todosDone;
    if (dg.fragments) fragments += dg.fragments.split(' ｜ ').length;
    if (dg.sleepHours != null) sleeps.push(dg.sleepHours);
  }

  const events = await stateEventsBetween(start, end).catch(() => []);
  const stateCounts = new Map<string, number>();
  for (const e of events) stateCounts.set(e.state, (stateCounts.get(e.state) ?? 0) + 1);

  // 例行：习惯卡片照顾了几次 + 作息模板勾了几次（按名字合在一起数）
  const routineCounts = new Map<string, number>();
  try {
    const [{ data: comps }, { data: actions }, { data: cards }] = await Promise.all([
      db.from('completions').select('*').gte('completed_at', start.toISOString()).lt('completed_at', end.toISOString()),
      db.from('actions').select('*'),
      db.from('cards').select('*'),
    ]);
    const actionById = new Map(((actions ?? []) as Action[]).map((a) => [a.id, a]));
    const cardById = new Map(((cards ?? []) as Card[]).map((c) => [c.id, c]));
    for (const c of (comps ?? []) as { action_id: string; undone?: boolean }[]) {
      if (c.undone) continue;
      const a = actionById.get(c.action_id);
      const card = a ? cardById.get(a.card_id) : null;
      if (!card || card.display_type !== 'habit') continue;
      routineCounts.set(card.name, (routineCounts.get(card.name) ?? 0) + 1);
    }
  } catch {}
  try {
    const checks = await loadChecks();
    for (const c of checks) {
      if (c.source !== 'template' || !days.includes(c.date)) continue;
      routineCounts.set(c.title_snapshot, (routineCounts.get(c.title_snapshot) ?? 0) + 1);
    }
  } catch {}

  return {
    days,
    timeByCategory: [...byCat.values()].sort((a, b) => b.minutes - a.minutes),
    states: [...stateCounts.entries()].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count),
    routines: [...routineCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    todosDone,
    sleepAvg: sleeps.length ? Math.round((sleeps.reduce((s, h) => s + h, 0) / sleeps.length) * 10) / 10 : null,
    sleepNights: sleeps.length,
    fragments,
  };
}
