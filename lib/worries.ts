import { supabase } from './supabase';
import type { Worry, WorrySeverity, WorryStatus } from '../types';

export async function fetchWorries(): Promise<Worry[]> {
  const { data, error } = await supabase.from('worries').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addWorry(content: string, tags: string[], severity: WorrySeverity): Promise<Worry> {
  const { data, error } = await supabase
    .from('worries')
    .insert({ content, tags, severity })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateWorryStatus(id: string, status: WorryStatus): Promise<void> {
  const { error } = await supabase
    .from('worries')
    .update({ status, resolved_at: status === 'active' ? null : new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
