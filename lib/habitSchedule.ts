import type { Action, Card, Completion } from '../types';
import { completionDay, dateOf } from './habitDays';

type Habit = { card: Card; action: Action; period?: boolean };
/** 按查看日期计算安排，未来的完成记录不会改变过去的安排。 */
export function habitSchedule(records: Completion[], hour = 5) {
  const history = new Map<string, string[]>();
  for (const r of records) {
    if (r.undone) continue;
    const days = history.get(r.action_id) ?? [];
    days.push(completionDay(r, hour)); history.set(r.action_id, days);
  }
  for (const [id, days] of history) history.set(id, [...new Set(days)].sort());
  return (it: Habit, day: string): boolean => {
    const days = history.get(it.action.id) ?? [];
    // 改了周期之后，已经记过的那一天仍然可以查看、编辑和取消。
    if (days.includes(day)) return true;
    if (it.period) return true;
    const a = it.action;
    if (a.frequency_type === 'fixed_day' && a.fixed_days?.length) return a.fixed_days.includes(dateOf(day).getDay() || 7);
    if (a.frequency_type === 'manual') return true;
    const interval = a.suggested_interval ?? a.interval_days ?? 1;
    if (interval <= 1 || !Number.isFinite(interval)) return true;
    const previous = days.filter(d => d < day).at(-1);
    if (!previous) return true;
    return (Date.parse(`${day}T12:00:00Z`) - Date.parse(`${previous}T12:00:00Z`)) / 86400000 >= interval;
  };
}
