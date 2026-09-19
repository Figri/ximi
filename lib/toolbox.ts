import { supabase } from './supabase';

// ---- 体重 ----

export async function logWeight(kg: number): Promise<void> {
  const { error } = await supabase.from('timeline_entries').insert({
    start_time: new Date().toISOString(),
    category: 'body',
    description: `体重 ${kg}kg`,
    source: 'manual',
  });
  if (error) throw error;
}

export async function fetchLastWeight(): Promise<{ kg: number; date: string } | null> {
  const { data, error } = await supabase
    .from('timeline_entries')
    .select('description, start_time')
    .eq('category', 'body')
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const match = data.description?.match(/([\d.]+)kg/);
  if (!match) return null;
  return { kg: Number(match[1]), date: data.start_time };
}

// ---- 运动 ----

export async function logExercise(parts: string[]): Promise<void> {
  const { error } = await supabase.from('timeline_entries').insert({
    start_time: new Date().toISOString(),
    category: 'exercise',
    description: parts.join('、'),
    source: 'manual',
  });
  if (error) throw error;
}

// ---- 生理期 ----
// 存在 settings 表里，key 固定为 'period_history'，value 是事件数组。

export type PeriodEventType = 'start' | 'end';

export interface PeriodEvent {
  type: PeriodEventType;
  date: string; // ISO
}

const PERIOD_SETTINGS_KEY = 'period_history';

export async function fetchPeriodHistory(): Promise<PeriodEvent[]> {
  const { data, error } = await supabase.from('settings').select('value').eq('key', PERIOD_SETTINGS_KEY).maybeSingle();
  if (error) throw error;
  const value = data?.value;
  return Array.isArray(value) ? (value as PeriodEvent[]) : [];
}

export async function addPeriodEvent(type: PeriodEventType): Promise<PeriodEvent[]> {
  const history = await fetchPeriodHistory();
  const next = [...history, { type, date: new Date().toISOString() }];
  const { error } = await supabase.from('settings').upsert({ key: PERIOD_SETTINGS_KEY, value: next });
  if (error) throw error;
  return next;
}

/** 简单预测：拿最近几次"开始"事件算平均周期天数，推出下一次开始日期。没有足够历史就返回 null。 */
export function predictNextPeriod(history: PeriodEvent[]): { nextStart: Date; avgCycleDays: number } | null {
  const starts = history.filter((e) => e.type === 'start').map((e) => new Date(e.date));
  if (starts.length < 2) return null;

  starts.sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    gaps.push((starts[i].getTime() - starts[i - 1].getTime()) / (1000 * 60 * 60 * 24));
  }
  const avgCycleDays = Math.round(gaps.reduce((sum, g) => sum + g, 0) / gaps.length);
  const lastStart = starts[starts.length - 1];
  const nextStart = new Date(lastStart.getTime() + avgCycleDays * 24 * 60 * 60 * 1000);
  return { nextStart, avgCycleDays };
}
