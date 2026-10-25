import type { Action, DecayResult, DecayStatus } from '../types';

const DAY_MS = 1000 * 60 * 60 * 24;

function formatTimeLeft(remainingDays: number): string {
  if (remainingDays < 0) {
    const overDays = Math.abs(remainingDays);
    return overDays < 1 ? `超${Math.round(overDays * 24)}h` : `超${Math.round(overDays)}天`;
  }
  return remainingDays < 1 ? `剩${Math.round(remainingDays * 24)}h` : `剩${Math.round(remainingDays)}天`;
}

/**
 * 核心衰减计算：从 100% 线性衰减到 0%，超过 maxDelay 记为红色。
 */
export function calculateDecay(
  lastCompletedAt: Date,
  suggestedIntervalDays: number,
  maxDelayDays: number
): DecayResult {
  const now = new Date();
  const elapsed = (now.getTime() - lastCompletedAt.getTime()) / DAY_MS;

  const percentage = Math.max(0, 100 - (elapsed / suggestedIntervalDays) * 100);

  let status: DecayStatus;
  if (elapsed > maxDelayDays) {
    status = 'red';
  } else if (percentage <= 20) {
    status = 'yellow';
  } else {
    status = 'green';
  }

  const remaining = suggestedIntervalDays - elapsed;

  return { percentage, status, timeLeft: formatTimeLeft(remaining) };
}

/** 下一个固定星期几发生的日期（1=周一 ... 7=周日，与 JS getDay() 的 0=周日 对齐转换） */
function nextFixedDayOccurrence(fixedDays: number[], from: Date): Date {
  const jsDayToOurs = (d: number) => (d === 0 ? 7 : d); // JS: 0=周日 -> 我们的 7
  const sorted = [...fixedDays].sort((a, b) => a - b);
  for (let addDays = 0; addDays <= 7; addDays++) {
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + addDays);
    const day = jsDayToOurs(candidate.getDay());
    if (sorted.includes(day)) return candidate;
  }
  return from;
}

/**
 * 根据 action 的频率设置和最近一次完成时间，计算展示用的衰减状态。
 * - interval: 使用 calculateDecay 连续衰减
 * - fixed_day: 按下一个固定星期几判断绿/黄，过期算红
 * - manual: 没有截止概念，始终绿色，timeLeft 显示"手动"
 */
export function getActionDecay(action: Action, lastCompletedAt: Date | null): DecayResult {
  if (action.frequency_type === 'manual') {
    return { percentage: 100, status: 'green', timeLeft: '手动' };
  }

  if (action.frequency_type === 'fixed_day' && action.fixed_days?.length) {
    const now = new Date();
    if (!lastCompletedAt) {
      return { percentage: 0, status: 'red', timeLeft: '待安排' };
    }
    const elapsedSinceLast = (now.getTime() - lastCompletedAt.getTime()) / DAY_MS;
    const next = nextFixedDayOccurrence(action.fixed_days, lastCompletedAt);
    const daysUntilNext = (next.getTime() - now.getTime()) / DAY_MS;
    const status: DecayStatus = elapsedSinceLast > 7 ? 'red' : daysUntilNext <= 1 ? 'yellow' : 'green';
    return {
      percentage: Math.max(0, 100 - elapsedSinceLast * 14.3),
      status,
      timeLeft: formatTimeLeft(daysUntilNext),
    };
  }

  // interval（默认）
  const suggestedInterval = action.suggested_interval ?? action.interval_days ?? 1;
  const maxDelay = action.max_delay ?? suggestedInterval * 1.5;

  if (!lastCompletedAt) {
    return { percentage: 0, status: 'red', timeLeft: '待完成' };
  }

  return calculateDecay(lastCompletedAt, suggestedInterval, maxDelay);
}

/** 是不是"今天"已经完成过了（日历日边界，不是按周期衰减算） */
export function isCompletedToday(lastCompletedAt: Date | null): boolean {
  if (!lastCompletedAt) return false;
  const now = new Date();
  return (
    lastCompletedAt.getFullYear() === now.getFullYear() &&
    lastCompletedAt.getMonth() === now.getMonth() &&
    lastCompletedAt.getDate() === now.getDate()
  );
}

const WEEKDAY_CN = ['', '一', '二', '三', '四', '五', '六', '日'];

/** 「每天」「每周一三五」「做完隔 3 天」：给人看的频率 */
export function describeFrequency(action: Action): string {
  if (action.frequency_type === 'manual') return '想做就做';
  if (action.frequency_type === 'fixed_day' && action.fixed_days?.length) {
    return `每周${[...action.fixed_days].sort((a, b) => a - b).map((d) => WEEKDAY_CN[d]).join('')}`;
  }
  const n = action.suggested_interval ?? action.interval_days ?? 1;
  const base = n <= 1 ? '每天' : `做完隔 ${n} 天`;
  return action.remind_at ? `${base} · 到日子 ${action.remind_at} 提醒` : base;
}

/** 格子底下那行小字：超几天 / 快到了 / 几天前做的 / 今天做了 */
export function habitSubLabel(action: Action, lastCompletedAt: Date | null, done: boolean, now = new Date()): string {
  if (done) return '今天做了';
  if (action.frequency_type === 'manual') {
    if (!lastCompletedAt) return '还没做过';
  } else {
    const d = getActionDecay(action, lastCompletedAt);
    if (d.status !== 'green') return lastCompletedAt ? d.timeLeft : '还没做过';
  }
  if (!lastCompletedAt) return '还没做过';
  const a = new Date(lastCompletedAt.getFullYear(), lastCompletedAt.getMonth(), lastCompletedAt.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const n = Math.round((b - a) / DAY_MS);
  return n <= 0 ? '今天做了' : n === 1 ? '昨天做的' : `${n} 天前做的`;
}

/**
 * 「到日子提醒我」：到日子那天的 HH:MM 提醒一次（那天没做也只提这一次，不催）。
 * - 做完隔 X 天：从上次做完那天往后数 X 天（周一该洗头拖到周三才洗，下次就从周三数）；还没做过的不提醒
 * - 每周几：下一个还没做的那天
 */
export function nextHabitReminder(action: Action, lastCompletedAt: Date | null, now = new Date()): Date | null {
  const t = action.remind_at;
  if (!t || !/^\d{1,2}:\d{2}$/.test(t) || action.frequency_type === 'manual') return null;
  const [h, m] = t.split(':').map(Number);
  const at = (y: number, mo: number, d: number) => new Date(y, mo, d, h, m, 0, 0);
  if (action.frequency_type === 'fixed_day' && action.fixed_days?.length) {
    for (let add = 0; add <= 7; add++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add);
      const dow = day.getDay() === 0 ? 7 : day.getDay();
      if (!action.fixed_days.includes(dow)) continue;
      if (
        lastCompletedAt &&
        lastCompletedAt.getFullYear() === day.getFullYear() &&
        lastCompletedAt.getMonth() === day.getMonth() &&
        lastCompletedAt.getDate() === day.getDate()
      ) {
        continue;
      }
      const when = at(day.getFullYear(), day.getMonth(), day.getDate());
      if (when.getTime() > now.getTime()) return when;
    }
    return null;
  }
  if (!lastCompletedAt) return null;
  const n = Math.max(1, Math.round(action.suggested_interval ?? action.interval_days ?? 1));
  const when = at(lastCompletedAt.getFullYear(), lastCompletedAt.getMonth(), lastCompletedAt.getDate() + n);
  return when.getTime() > now.getTime() ? when : null;
}
