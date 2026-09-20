import { supabase } from './supabase';

const MEMORY_KEY = 'ai_memory';

/** 西米想让AI一直记住的事情（人设/习惯/偏好……），存在 settings 表里，每次聊天都会带上 */
export async function fetchMemory(): Promise<string> {
  const { data, error } = await supabase.from('settings').select('value').eq('key', MEMORY_KEY).maybeSingle();
  if (error) throw error;
  return typeof data?.value === 'string' ? data.value : '';
}

export async function saveMemory(text: string): Promise<void> {
  const { error } = await supabase.from('settings').upsert({ key: MEMORY_KEY, value: text }, { onConflict: 'key' });
  if (error) throw error;
}
