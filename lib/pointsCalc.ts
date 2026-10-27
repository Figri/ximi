import type { TimeCategory, TimeLog } from '../types';

// 积分的纯计算（不读存储，方便单测）：时间记录上记的分怎么加总、算在哪一天。
// 一条记录的分算在它开始的那一天；一天从 dayStartHour 点算起（凌晨还没睡算前一天），跟今天页、灵同一个换日点。

export const MAX_POINTS = 999;

/** 存进记录前统一一下：整数、不为 0、绝对值不超过 999；不合规的当没有分 */
export function normalizePoints(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i === 0 || Math.abs(i) > MAX_POINTS) return null;
  return i;
}

/** +10 / -8 / 0 */
export function formatPoints(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 这一刻属于哪一天（和 lib/ling/settings 的 lingDayKey 同一个算法） */
export function dayKeyAt(date: Date, dayStartHour = 5): string {
  return keyOf(new Date(date.getTime() - dayStartHour * 3600 * 1000));
}

/** dayKey 往前 / 往后挪几天（按日历日，用中午算，避开夏令时之类的边界） */
export function shiftDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d + days, 12));
}

/** dayKey 所在那一周的周一（本周从周一算，跟日期条一样） */
export function mondayOf(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const weekday = new Date(y, m - 1, d, 12).getDay(); // 0=周日
  return shiftDayKey(dayKey, -((weekday + 6) % 7));
}

export interface ScoredLog {
  log: TimeLog;
  points: number;
  dayKey: string;
}

/** 有分的记录，带上它算在哪一天 */
export function scoredLogs(logs: TimeLog[], dayStartHour = 5): ScoredLog[] {
  const out: ScoredLog[] = [];
  for (const log of logs) {
    const points = normalizePoints(log.points);
    if (points == null) continue;
    out.push({ log, points, dayKey: dayKeyAt(new Date(log.start_time), dayStartHour) });
  }
  return out.sort((a, b) => new Date(a.log.start_time).getTime() - new Date(b.log.start_time).getTime());
}

/** 某一天的净分；这天一条有分的都没有返回 null */
export function dayNet(scored: ScoredLog[], dayKey: string): number | null {
  let has = false;
  let sum = 0;
  for (const s of scored) {
    if (s.dayKey !== dayKey) continue;
    has = true;
    sum += s.points;
  }
  return has ? sum : null;
}

export interface PointsDay {
  dayKey: string;
  net: number;
  has: boolean;
}

export interface CategoryPoints {
  categoryId: string | null;
  name: string;
  color: string;
  points: number;
}

export interface PointsSummary {
  todayKey: string;
  /** 今天的净分，今天还没有分时是 null（显示成灰的 0） */
  today: number | null;
  week: number;
  month: number;
  total: number;
  hasAny: boolean;
  /** 最近 N 天（含今天），从早到晚 */
  series: PointsDay[];
  /** 这 N 天里按分类加起来：加分一组、扣分一组，各自从多到少 */
  plus: CategoryPoints[];
  minus: CategoryPoints[];
  /** 这 N 天里分最高的一天；一条分都没有时是 null */
  best: PointsDay | null;
}

export function summarizePoints(
  logs: TimeLog[],
  categories: TimeCategory[],
  now: Date,
  days: number,
  dayStartHour = 5
): PointsSummary {
  const scored = scoredLogs(logs, dayStartHour);
  const todayKey = dayKeyAt(now, dayStartHour);
  const monday = mondayOf(todayKey);
  const sunday = shiftDayKey(monday, 6);
  const monthPrefix = todayKey.slice(0, 7);

  const byDay = new Map<string, number>();
  let total = 0;
  let week = 0;
  let month = 0;
  for (const s of scored) {
    byDay.set(s.dayKey, (byDay.get(s.dayKey) ?? 0) + s.points);
    total += s.points;
    if (s.dayKey >= monday && s.dayKey <= sunday) week += s.points;
    if (s.dayKey.startsWith(monthPrefix)) month += s.points;
  }

  const firstKey = shiftDayKey(todayKey, -(days - 1));
  const series: PointsDay[] = [];
  for (let i = 0; i < days; i++) {
    const k = shiftDayKey(firstKey, i);
    series.push({ dayKey: k, net: byDay.get(k) ?? 0, has: byDay.has(k) });
  }

  const catById = new Map(categories.map((c) => [c.id, c]));
  const byCat = new Map<string, CategoryPoints>();
  for (const s of scored) {
    if (s.dayKey < firstKey || s.dayKey > todayKey) continue;
    const key = s.log.category_id ?? '__none__';
    const cat = s.log.category_id ? catById.get(s.log.category_id) : undefined;
    const cur = byCat.get(key) ?? { categoryId: s.log.category_id, name: cat?.name ?? '未分类', color: cat?.color ?? '#A49BB8', points: 0 };
    cur.points += s.points;
    byCat.set(key, cur);
  }
  const cats = [...byCat.values()];
  const plus = cats.filter((c) => c.points > 0).sort((a, b) => b.points - a.points);
  const minus = cats.filter((c) => c.points < 0).sort((a, b) => a.points - b.points);

  let best: PointsDay | null = null;
  for (const d of series) {
    if (!d.has) continue;
    // 一样多的取近的那天
    if (!best || d.net >= best.net) best = d;
  }

  return {
    todayKey,
    today: byDay.has(todayKey) ? byDay.get(todayKey)! : null,
    week,
    month,
    total,
    hasAny: scored.length > 0,
    series,
    plus,
    minus,
    best,
  };
}

/** 某一天有分的那几条（明细用），从早到晚 */
export function dayDetail(logs: TimeLog[], dayKey: string, dayStartHour = 5): ScoredLog[] {
  return scoredLogs(logs, dayStartHour).filter((s) => s.dayKey === dayKey);
}
