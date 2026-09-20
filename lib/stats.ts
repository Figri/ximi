import { supabase } from './supabase';
import type { DailySummary } from '../types';

export { fetchProjects } from './projects';

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 最近 N 天，每天完成了多少次动作（不含撤销的） */
export async function fetchCompletionCountsByDay(days: number): Promise<{ date: string; count: number }[]> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('completions')
    .select('completed_at')
    .eq('undone', false)
    .gte('completed_at', since.toISOString());
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const key = toDateKey(new Date(row.completed_at));
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const result: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = toDateKey(d);
    result.push({ date: key, count: counts[key] ?? 0 });
  }
  return result;
}

/** 最近 N 天的每日总结（有 hp/mp 的），按日期升序 */
export async function fetchRecentDailySummaries(days: number): Promise<DailySummary[]> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));

  const { data, error } = await supabase
    .from('daily_summaries')
    .select('*')
    .gte('date', toDateKey(since))
    .order('date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** 体重曲线：从"身体"分类的时间轴记录里解析"体重: 62.5kg"这种格式 */
export async function fetchWeightSeries(limit = 30): Promise<{ date: string; weight: number }[]> {
  const { data, error } = await supabase
    .from('timeline_entries')
    .select('start_time, description')
    .eq('category', 'body')
    .order('start_time', { ascending: false })
    .limit(200);
  if (error) throw error;

  const points: { date: string; weight: number }[] = [];
  for (const row of data ?? []) {
    const match = row.description?.match(/体重[:：]?\s*([\d.]+)/);
    if (match) {
      points.push({ date: toDateKey(new Date(row.start_time)), weight: parseFloat(match[1]) });
    }
  }
  return points.reverse().slice(-limit);
}
