import type { Completion } from '../types';

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function dateOf(key: string): Date {
  const [y,m,d] = key.split('-').map(Number);
  const result = new Date(y,m-1,d,12);
  if (dateKey(result) !== key) throw new Error('日期无效');
  return result;
}
export function shiftDay(key: string, days: number): string {
  const d = dateOf(key); d.setDate(d.getDate()+days); return dateKey(d);
}
export function completionDay(row: Completion, dayStartHour = 5): string {
  if (row.record_date) return row.record_date;
  const d = new Date(row.completed_at); d.setHours(d.getHours()-dayStartHour); return dateKey(d);
}
export function monthDays(month: string): (string | null)[] {
  const first = dateOf(`${month}-01`);
  const offset = (first.getDay()+6)%7;
  const count = new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
  return [...Array(offset).fill(null),...Array.from({length:count},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`)];
}
export function shiftMonth(month: string, delta: number): string {
  const d = dateOf(`${month}-01`); d.setMonth(d.getMonth()+delta); return dateKey(d).slice(0,7);
}

/** 周一开始；跨年也保持同一周连续七天。 */
export function weekDays(key: string): string[] {
  const d = dateOf(key);
  const monday = shiftDay(key, -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
}
