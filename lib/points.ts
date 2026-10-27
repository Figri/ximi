import { loadLingSettings } from './ling/settings';
import { loadCategories, loadLogs } from './timelogLocal';
import { dayDetail, dayKeyAt, dayNet, scoredLogs, summarizePoints, type PointsSummary, type ScoredLog } from './pointsCalc';

// 积分：读本地时间记录算出来（计算本身在 pointsCalc.ts）。只给时间页和 Notion 日记用，灵那边不读。

async function dayStartHour(): Promise<number> {
  try {
    return (await loadLingSettings()).dayStartHour;
  } catch {
    return 5;
  }
}

/** 今天的净分（时间页顶上「今日 +N」）；今天一条有分的都没有返回 null */
export async function fetchTodayPoints(now = new Date()): Promise<number | null> {
  const [logs, hour] = await Promise.all([loadLogs(), dayStartHour()]);
  return dayNet(scoredLogs(logs, hour), dayKeyAt(now, hour));
}

/** 积分统计页要的全部数字 */
export async function fetchPointsSummary(days: number, now = new Date()): Promise<PointsSummary> {
  const [logs, categories, hour] = await Promise.all([loadLogs(), loadCategories(), dayStartHour()]);
  return summarizePoints(logs, categories, now, days, hour);
}

/** 某一天有分的那几条（统计页明细） */
export async function fetchPointsDetail(dayKey: string): Promise<ScoredLog[]> {
  const [logs, hour] = await Promise.all([loadLogs(), dayStartHour()]);
  return dayDetail(logs, dayKey, hour);
}

/** Notion 日记「积分」：这一天的净分，没有分是 null */
export async function netPointsForDay(dayKey: string, hour: number): Promise<number | null> {
  return dayNet(scoredLogs(await loadLogs(), hour), dayKey);
}
