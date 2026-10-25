import { db } from './localdb';

// 状态打点：和 Notion「🌡️ 西米状态日志」同一套词（D8=A：7 个词 + 内耗）。
// 点一下就存进本地 state_events 表；连上 Notion 后由同步模块补写进状态日志（来源 = OS）。

export const STATE_WORDS = ['烦躁', '难过', '焦虑', '疲惫', '平静', '开心', '低动力', '内耗'] as const;
export type StateWord = (typeof STATE_WORDS)[number];

/** 点了这些，灵会来「接住你」 */
export const CATCH_STATES = new Set<StateWord>(['烦躁', '难过', '焦虑', '疲惫', '低动力', '内耗']);

export type DayPeriod = '深夜' | '早晨' | '上午' | '下午' | '晚上';

/** 时段划分跟状态日志一致：深夜 0–6、早晨 6–9、上午 9–12、下午 12–18、晚上 18–24 */
export function periodOf(date: Date): DayPeriod {
  const h = date.getHours();
  if (h < 6) return '深夜';
  if (h < 9) return '早晨';
  if (h < 12) return '上午';
  if (h < 18) return '下午';
  return '晚上';
}

export interface StateEvent {
  id: string;
  at: string;
  state: StateWord;
  intensity: number | null;
  note: string | null;
  period: DayPeriod;
  /** 已经写进 Notion 状态日志的页面 id；没连 Notion 或还没写就是 null */
  notion_page_id: string | null;
  created_at: string;
}

export async function addStateEvent(state: StateWord, opts: { intensity?: number | null; note?: string | null; at?: Date } = {}): Promise<StateEvent> {
  const at = opts.at ?? new Date();
  const { data, error } = await db
    .from('state_events')
    .insert({
      at: at.toISOString(),
      state,
      intensity: opts.intensity ?? null,
      note: opts.note?.trim() || null,
      period: periodOf(at),
      notion_page_id: null,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as StateEvent;
}

export async function updateStateEvent(id: string, patch: Partial<Pick<StateEvent, 'intensity' | 'note' | 'notion_page_id'>>): Promise<void> {
  await db.from('state_events').update(patch).eq('id', id);
}

/** 撤销一次打点：删掉本地这行，返回删掉的那行（已经写进 Notion 的，由同步模块去 Notion 那边归档） */
export async function deleteStateEvent(id: string): Promise<StateEvent | null> {
  const { data } = await db.from('state_events').select('*').eq('id', id).maybeSingle();
  await db.from('state_events').delete().eq('id', id);
  return (data as StateEvent | null) ?? null;
}

export async function stateEventsBetween(start: Date, end: Date): Promise<StateEvent[]> {
  const { data } = await db
    .from('state_events')
    .select('*')
    .gte('at', start.toISOString())
    .lt('at', end.toISOString())
    .order('at', { ascending: true });
  return (data ?? []) as StateEvent[];
}

export async function unsyncedStateEvents(): Promise<StateEvent[]> {
  const { data } = await db.from('state_events').select('*').is('notion_page_id', null).order('at', { ascending: true });
  return (data ?? []) as StateEvent[];
}

/** 「焦虑 ×1 · 平静 ×2」这种汇总，给日记属性和灵的上下文用 */
export function summarizeStates(events: StateEvent[]): string {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.state, (counts.get(e.state) ?? 0) + 1);
  return [...counts.entries()].map(([s, n]) => `${s} ×${n}`).join(' · ');
}
