import { db } from './localdb';

// 今日碎片：当天的一句话记录（＋ 里写的、判断不出是什么的也存这里）。晚上写进 Notion 日记的「今日碎片」。

export interface Fragment {
  id: string;
  at: string;
  text: string;
  created_at: string;
}

export async function addFragment(text: string, at = new Date()): Promise<Fragment> {
  const { data, error } = await db
    .from('fragments')
    .insert({ at: at.toISOString(), text: text.trim(), created_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Fragment;
}

export async function deleteFragment(id: string): Promise<void> {
  await db.from('fragments').delete().eq('id', id);
}

export async function fragmentsBetween(start: Date, end: Date): Promise<Fragment[]> {
  const { data } = await db
    .from('fragments')
    .select('*')
    .gte('at', start.toISOString())
    .lt('at', end.toISOString())
    .order('at', { ascending: true });
  return (data ?? []) as Fragment[];
}
