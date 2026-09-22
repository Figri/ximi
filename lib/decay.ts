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

/**
 * 打卡tab习惯图标今天要不要显示。
 * - manual: 一直显示
 * - fixed_day: 只在设定的星期几显示，超过7天没做也显示（避免彻底藏起来忘掉）
 * - interval（含"每天"=interval 1、"每X天一次"）: 距上次完成 >= 间隔天数才显示，今天已完成也显示（这样点完能立刻看到打勾状态）
 */
export function shouldShowHabitToday(action: Action, lastCompletedAt: Date | null): boolean {
  if (action.frequency_type === 'manual') return true;

  const now = new Date();

  if (action.frequency_type === 'fixed_day' && action.fixed_days?.length) {
    const jsDayToOurs = (d: number) => (d === 0 ? 7 : d);
    const isTodayFixed = action.fixed_days.includes(jsDayToOurs(now.getDay()));
    if (isTodayFixed) return true;
    if (!lastCompletedAt) return true;
    const elapsed = (now.getTime() - lastCompletedAt.getTime()) / DAY_MS;
    return elapsed > 7;
  }

  // interval（默认，覆盖"每天"和"每X天一次"）
  if (isCompletedToday(lastCompletedAt)) return true;
  if (!lastCompletedAt) return true;
  const interval = action.suggested_interval ?? action.interval_days ?? 1;
  const elapsed = (now.getTime() - lastCompletedAt.getTime()) / DAY_MS;
  return elapsed >= interval;
}

/** 是不是"今天"已经完成过了（打卡圆形图标用，日历日边界，不是按周期衰减算） */
export function isCompletedToday(lastCompletedAt: Date | null): boolean {
  if (!lastCompletedAt) return false;
  const now = new Date();
  return (
    lastCompletedAt.getFullYear() === now.getFullYear() &&
    lastCompletedAt.getMonth() === now.getMonth() &&
    lastCompletedAt.getDate() === now.getDate()
  );
}

export const statusRank: Record<DecayStatus, number> = { red: 0, yellow: 1, green: 2 };

/** 卡片列表排序：红 → 黄 → 绿，同状态内按最紧迫排序 */
export function sortByUrgency<T extends { status: DecayStatus; percentage: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const rankDiff = statusRank[a.status] - statusRank[b.status];
    if (rankDiff !== 0) return rankDiff;
    return a.percentage - b.percentage;
  });
}
