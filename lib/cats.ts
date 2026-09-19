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
