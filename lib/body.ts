import AsyncStorage from '@react-native-async-storage/async-storage';
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

/**
 * 体重输入：「52.3」「52.3kg」「52,3」「104.6斤」都认，斤折成公斤；不像体重（不在 min~max 之间）返回 null。
 * 今天页的记体重、身体页、猫的体重都用这一个，免得各认各的（以前写「104斤」会被当成 104 公斤）。
 */
export function parseKg(raw: string, min: number, max: number): number | null {
  const s = raw.trim();
  if (!s) return null;
  const jin = s.includes('斤') && !s.includes('公斤');
  const v = Number(s.replace(/kg|公斤|斤/gi, '').replace(',', '.').trim()) / (jin ? 2 : 1);
  if (!Number.isFinite(v) || v <= min || v >= max) return null;
  return Math.round(v * 100) / 100;
}

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

/** 点经期结束；date 传 null = 撤销「结束了」，回到还没结束 */
export async function endPeriod(id: string, date: string | null): Promise<void> {
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

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 最近一次体重 */
export async function latestWeight(): Promise<BodyRecord | null> {
  const list = await listBody('weight');
  return list[0] ?? null;
}

/** 现在是不是在经期里：最近一次没点结束、而且开始不到 14 天的（再久多半是忘了点结束，不算） */
export function ongoingPeriod(periods: BodyRecord[], todayKey: string): BodyRecord | null {
  const last = periods[0];
  if (!last || last.end_date) return null;
  const n = daysBetween(last.date, todayKey);
  return n >= 0 && n < 14 ? last : null;
}

// ---- 旧版「打卡 → 工具箱」里记的体重和生理期，一次性搬进来 ----
// 旧体重存在时间轴（分类 body，「体重 52.5kg」）；旧生理期存在设置表 period_history（开始 / 结束事件）。
// 记下搬过哪些（来源 id / 开始日期），旧数据晚一点才从云端搬到手机上也能补进来，删掉的也不会再冒出来。

const K_IMPORTED = 'body_legacy_imported_v1';

export async function importLegacyBody(): Promise<number> {
  let done: string[] = [];
  try {
    const raw = await AsyncStorage.getItem(K_IMPORTED);
    done = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {}
  const seen = new Set(done);
  let added = 0;

  const { data: tl } = await db.from('timeline_entries').select('*').eq('category', 'body');
  for (const row of (tl ?? []) as { id: string; start_time: string; description: string | null }[]) {
    const key = `tl:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const m = row.description?.match(/体重[:：]?\s*([\d.]+)/);
    const kg = m ? parseFloat(m[1]) : NaN;
    if (!(kg > 10 && kg < 300) || !row.start_time) continue;
    await db.from(TABLE).insert({ kind: 'weight', date: keyOf(new Date(row.start_time)), end_date: null, value: kg, note: null, created_at: row.start_time });
    added++;
  }

  const { data: setting } = await db.from('settings').select('value').eq('key', 'period_history').maybeSingle();
  const events = Array.isArray(setting?.value) ? (setting!.value as { type: string; date: string }[]) : [];
  const sorted = events.filter((e) => e && (e.type === 'start' || e.type === 'end') && e.date).sort((a, b) => a.date.localeCompare(b.date));
  const pairs: { start: string; end: string | null }[] = [];
  for (const e of sorted) {
    const k = keyOf(new Date(e.date));
    if (e.type === 'start') pairs.push({ start: k, end: null });
    else if (pairs.length && !pairs[pairs.length - 1].end) pairs[pairs.length - 1].end = k;
  }
  for (const p of pairs) {
    const key = `period:${p.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await db.from(TABLE).insert({ kind: 'period', date: p.start, end_date: p.end, value: null, note: null, created_at: new Date().toISOString() });
    added++;
  }

  if (seen.size !== done.length) await AsyncStorage.setItem(K_IMPORTED, JSON.stringify([...seen])).catch(() => {});
  return added;
}
