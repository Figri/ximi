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

export const statusRank: Record<DecayStatus, number> = { red: 0, yellow: 1, green: 2 };

/** 卡片列表排序：红 → 黄 → 绿，同状态内按最紧迫排序 */
export function sortByUrgency<T extends { status: DecayStatus; percentage: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const rankDiff = statusRank[a.status] - statusRank[b.status];
    if (rankDiff !== 0) return rankDiff;
    return a.percentage - b.percentage;
  });
}
