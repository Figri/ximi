import { supabase } from './supabase';
import type { TimelineCategory, TimelineEntry } from '../types';

/** 某一天（本地时区）的所有条目，按时间正序（给"今日"时间轴用） */
export async function fetchTimelineForDate(date: Date): Promise<TimelineEntry[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data, error } = await supabase
    .from('timeline_entries')
    .select('*')
    .gte('start_time', start.toISOString())
    .lt('start_time', end.toISOString())
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** 最近一条记录的结束时间（没有 end_time 就用 start_time），给"记一笔"默认时间段用 */
export async function fetchLastEntryEnd(): Promise<Date | null> {
  const { data, error } = await supabase
    .from('timeline_entries')
    .select('start_time, end_time')
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return new Date(data.end_time ?? data.start_time);
}

/** 某个分类下所有天的条目，按时间倒序（给"身体/睡眠/..."这些跨天汇总用） */
export async function fetchTimelineByCategory(category: TimelineCategory, limit = 100): Promise<TimelineEntry[]> {
  const { data, error } = await supabase
    .from('timeline_entries')
    .select('*')
    .eq('category', category)
    .order('start_time', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function addTimelineEntry(entry: {
  category: TimelineCategory;
  description: string;
  start_time?: string;
  end_time?: string;
  hp_change?: number | null;
  mp_change?: number | null;
  image_url?: string | null;
  source?: 'manual' | 'chat';
}): Promise<TimelineEntry> {
  const { data, error } = await supabase
    .from('timeline_entries')
    .insert({
      category: entry.category,
      description: entry.description,
      start_time: entry.start_time ?? new Date().toISOString(),
      end_time: entry.end_time ?? null,
      hp_change: entry.hp_change ?? null,
      mp_change: entry.mp_change ?? null,
      image_url: entry.image_url ?? null,
      source: entry.source ?? 'manual',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTimelineEntry(id: string): Promise<void> {
  const { error } = await supabase.from('timeline_entries').delete().eq('id', id);
  if (error) throw error;
}
