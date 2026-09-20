import { supabase } from './supabase';
import type { Cat, CatEvent, CatEventType } from '../types';

export async function fetchCat(id: string): Promise<Cat | null> {
  const { data, error } = await supabase.from('cats').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchCatEvents(catId: string): Promise<CatEvent[]> {
  const { data, error } = await supabase
    .from('cat_events')
    .select('*')
    .eq('cat_id', catId)
    .order('event_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addCatEvent(
  catId: string,
  event: { event_type: CatEventType; description?: string | null; value?: number | null; event_date: string }
): Promise<CatEvent> {
  const { data, error } = await supabase
    .from('cat_events')
    .insert({ cat_id: catId, ...event })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCatEvent(id: string): Promise<void> {
  const { error } = await supabase.from('cat_events').delete().eq('id', id);
  if (error) throw error;
}

/** 每只猫最近一次称重记录，catId -> {value, date} */
export async function fetchLastCatWeights(catIds: string[]): Promise<Record<string, { value: number; date: string }>> {
  if (catIds.length === 0) return {};
  const { data, error } = await supabase
    .from('cat_events')
    .select('cat_id, value, event_date')
    .in('cat_id', catIds)
    .eq('event_type', '体重')
    .not('value', 'is', null)
    .order('event_date', { ascending: false });
  if (error) throw error;

  const result: Record<string, { value: number; date: string }> = {};
  for (const row of data ?? []) {
    if (!result[row.cat_id]) result[row.cat_id] = { value: row.value, date: row.event_date };
  }
  return result;
}
