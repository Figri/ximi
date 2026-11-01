// 剧本（时间页「周日程 / 对照」）里不碰存储的那部分：日期、周数、并块、颜色。
// 单独放一个文件，tests/logic.test.mjs 能直接拿来跑，不用拉上 AsyncStorage。

export const HOURS_PER_DAY = 24;

/** 一个钟头的剧本：c = 分类 id，d = 那行字（可以是空字符串） */
export interface PlanSlot {
  c: string;
  d: string;
}
/** 一天 24 个钟头，没排的是 null */
export type DaySlots = (PlanSlot | null)[];

export interface DayTemplate {
  id: string;
  name: string;
  slots: DaySlots;
  created_at: string;
}
export interface WeekTemplate {
  id: string;
  name: string;
  /** 周一到周日 */
  days: DaySlots[];
  created_at: string;
}
export interface PlanTemplates {
  days: DayTemplate[];
  weeks: WeekTemplate[];
  /** 默认周模板：新的一周还空着时自动用它填好 */
  defaultWeekId: string | null;
  /** 已经自动填过（或第一次看到时已经有剧本）的周，记的是那周周一的日期 key；这些周不再自动填 */
  autoFilled: string[];
}

export type TimeView = 'week' | 'compare' | 'fine';

// ---------------- 日期 ----------------

export function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateOfKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 这一天所在那周（周一到周日）的 7 个日期 key */
export function weekKeysOf(date: Date): string[] {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => dateKeyOf(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
}

/** ISO 周数：一年里第几周（周一开头，包含 1 月 4 日的那周是第 1 周） */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export const WEEKDAY_CN = ['一', '二', '三', '四', '五', '六', '日'];

/** 「周二 10/27」 */
export function dayLabel(key: string): string {
  const d = dateOfKey(key);
  return `周${WEEKDAY_CN[(d.getDay() + 6) % 7]} ${d.getMonth() + 1}/${d.getDate()}`;
}

// ---------------- 一天 24 格 ----------------

export function emptyDay(): DaySlots {
  return Array.from({ length: HOURS_PER_DAY }, () => null);
}

function cleanSlot(v: any): PlanSlot | null {
  if (!v || typeof v !== 'object' || typeof v.c !== 'string' || !v.c) return null;
  return { c: v.c, d: typeof v.d === 'string' ? v.d : '' };
}

export function normalizeDay(v: any): DaySlots {
  const out = emptyDay();
  if (Array.isArray(v)) for (let h = 0; h < HOURS_PER_DAY; h++) out[h] = cleanSlot(v[h]);
  return out;
}

export function isEmptyDay(slots: DaySlots | null | undefined): boolean {
  return !slots || slots.every((s) => s == null);
}

export function daySlotsOf(days: Record<string, DaySlots>, key: string): DaySlots {
  return days[key] ?? emptyDay();
}

export interface PlanBlock {
  start: number;
  end: number;
  slot: PlanSlot;
}

function sameSlot(a: PlanSlot | null, b: PlanSlot | null): boolean {
  if (!a || !b) return a === b;
  return a.c === b.c && a.d === b.d;
}

/** 连着几个钟头一样的剧本并成一块 */
export function mergeBlocks(slots: DaySlots): PlanBlock[] {
  const out: PlanBlock[] = [];
  let h = 0;
  while (h < HOURS_PER_DAY) {
    const s = slots[h];
    if (!s) {
      h++;
      continue;
    }
    let e = h + 1;
    while (e < HOURS_PER_DAY && sameSlot(slots[e], s)) e++;
    out.push({ start: h, end: e, slot: s });
    h = e;
  }
  return out;
}

/** 这几天这几个钟头如果全是同一条剧本，返回它（弹窗预先填好）；不一样或有空的返回 null */
export function uniformSlot(days: Record<string, DaySlots>, keys: string[], from: number, to: number): PlanSlot | null {
  let first: PlanSlot | null | undefined;
  for (const k of keys) {
    const slots = daySlotsOf(days, k);
    for (let h = from; h < to; h++) {
      const s = slots[h];
      if (!s) return null;
      if (first === undefined) first = s;
      else if (!sameSlot(first, s)) return null;
    }
  }
  return first ?? null;
}

// ---------------- 颜色 ----------------

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, other: [number, number, number], amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const out = rgb.map((v, i) => Math.round(v * (1 - amount) + other[i] * amount));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** 剧本的浅色底：分类色兑白 */
export function planTint(hex: string): string {
  return mix(hex, [255, 255, 255], 0.74);
}

/** 剧本的深色字：分类色兑黑 */
export function planInk(hex: string): string {
  return mix(hex, [0, 0, 0], 0.32);
}
