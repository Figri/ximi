import { db } from './localdb';
import type { StateWord } from './states';

// 今日碎片：当天的一句话记录（＋ 里写的、判断不出是什么的也存这里）。晚上写进 Notion 日记的「今日碎片」。
// 随心记里带表情的那条：text 就是整行「😢 今天好累」，另外记着是哪个表情、记进状态日志的是哪一行（删的时候一起删）。

export interface Fragment {
  id: string;
  at: string;
  text: string;
  created_at: string;
  face?: string | null;
  state?: StateWord | null;
  state_event_id?: string | null;
}

export type FragmentMood = Pick<Fragment, 'face' | 'state' | 'state_event_id'>;

export async function addFragment(text: string, at = new Date(), mood?: FragmentMood): Promise<Fragment> {
  const { data, error } = await db
    .from('fragments')
    .insert({
      at: at.toISOString(),
      text: text.trim(),
      created_at: new Date().toISOString(),
      ...(mood ? { face: mood.face ?? null, state: mood.state ?? null, state_event_id: mood.state_event_id ?? null } : {}),
    })
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
