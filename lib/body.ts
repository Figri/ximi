import { db } from './localdb';

// 身体（需求文档 §8.9）：体重、经期。经期默认私密：不进灵的提示词、不进主动消息，只存在手机里和你自己的备份里。
// 睡眠不用记，从「睡觉」时间块自动算（dayDigest），并写进 Notion 日记属性。

export type BodyKind = 'weight' | 'period';

export interface BodyRecord {
  id: string;
  kind: BodyKind;
  /** 'YYYY-MM-DD'：称重那天 / 经期第一天 */
  date: string;
  /** 经期最后一天，还没结束是 null */
  end_date: string | null;
  value: number | null;
  note: string | null;
  created_at: string;
}

const TABLE = 'body_records';

export async function listBody(kind: BodyKind): Promise<BodyRecord[]> {
  const { data } = await db.from(TABLE).select('*').eq('kind', kind).order('date', { ascending: false });
  return (data ?? []) as BodyRecord[];
}

export async function addWeight(date: string, value: number, note: string | null = null): Promise<BodyRecord> {
  const { data, error } = await db
    .from(TABLE)
    .insert({ kind: 'weight', date, end_date: null, value, note, created_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as BodyRecord;
}

export async function startPeriod(date: string): Promise<BodyRecord> {
  const { data, error } = await db
    .from(TABLE)
    .insert({ kind: 'period', date, end_date: null, value: null, note: null, created_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as BodyRecord;
}

export async function endPeriod(id: string, date: string): Promise<void> {
  await db.from(TABLE).update({ end_date: date }).eq('id', id);
}

export async function deleteBody(id: string): Promise<void> {
  await db.from(TABLE).delete().eq('id', id);
}

/** 两个日期之间差几天（含头不含尾） */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86400000);
}
