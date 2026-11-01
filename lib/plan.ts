import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { genId } from './timelogLocal';
import { daySlotsOf, HOURS_PER_DAY, isEmptyDay, normalizeDay, type DayTemplate, type DaySlots, type PlanSlot, type PlanTemplates, type TimeView, type WeekTemplate } from './planCalc';

export * from './planCalc';

// 剧本（时间页「周日程 / 对照」用）：每天每个整点一条——分类 + 一行字。
// 实际做了什么还是时间页原来那份记录（timelog_logs_v1），这里只存「打算」。
//
// 存法：整份放在内存里（zustand），改一次就把整份按顺序写回 AsyncStorage——写是串行排队的，
// 后一次一定落在前一次之后，不会出现两次「读-改-写」互相覆盖。

export const K_PLAN_DAYS = 'plan_days_v1';
export const K_PLAN_TEMPLATES = 'plan_templates_v1';
/** 时间页上次停在哪个视图（周日程 / 对照 / 细格），只存在手机上 */
export const K_TIME_VIEW = 'time_view_v1';


// ---------------- 读写 ----------------

const EMPTY_TEMPLATES: PlanTemplates = { days: [], weeks: [], defaultWeekId: null, autoFilled: [] };

/** 读一份 JSON；坏了（不是 JSON）不让页面出错：原样另存一份 `<key>_unreadable` 留底，这次当没有 */
async function readJson(key: string): Promise<any> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      if (!(await AsyncStorage.getItem(`${key}_unreadable`))) await AsyncStorage.setItem(`${key}_unreadable`, raw);
    } catch {}
    return null;
  }
}

function normalizeDays(v: any): Record<string, DaySlots> {
  const out: Record<string, DaySlots> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, slots] of Object.entries(v)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      const day = normalizeDay(slots);
      if (!isEmptyDay(day)) out[k] = day;
    }
  }
  return out;
}

function normalizeTemplates(v: any): PlanTemplates {
  if (!v || typeof v !== 'object') return { ...EMPTY_TEMPLATES };
  const days: DayTemplate[] = Array.isArray(v.days)
    ? v.days
        .filter((t: any) => t && typeof t.id === 'string')
        .map((t: any) => ({ id: t.id, name: String(t.name ?? '日模板'), slots: normalizeDay(t.slots), created_at: String(t.created_at ?? '') }))
    : [];
  const weeks: WeekTemplate[] = Array.isArray(v.weeks)
    ? v.weeks
        .filter((t: any) => t && typeof t.id === 'string')
        .map((t: any) => ({
          id: t.id,
          name: String(t.name ?? '周模板'),
          days: Array.from({ length: 7 }, (_, i) => normalizeDay(Array.isArray(t.days) ? t.days[i] : null)),
          created_at: String(t.created_at ?? ''),
        }))
    : [];
  const defaultWeekId = typeof v.defaultWeekId === 'string' && weeks.some((w) => w.id === v.defaultWeekId) ? v.defaultWeekId : null;
  const autoFilled = Array.isArray(v.autoFilled) ? v.autoFilled.filter((k: any) => typeof k === 'string') : [];
  return { days, weeks, defaultWeekId, autoFilled };
}

interface PlanStoreState {
  loaded: boolean;
  days: Record<string, DaySlots>;
  templates: PlanTemplates;
}

export const usePlanStore = create<PlanStoreState>(() => ({ loaded: false, days: {}, templates: { ...EMPTY_TEMPLATES } }));

let loadingPromise: Promise<void> | null = null;

/** 第一次用到时从手机里读出来；之后都读内存 */
export function ensurePlansLoaded(): Promise<void> {
  if (usePlanStore.getState().loaded) return Promise.resolve();
  if (!loadingPromise) {
    loadingPromise = (async () => {
      const [days, templates] = await Promise.all([readJson(K_PLAN_DAYS), readJson(K_PLAN_TEMPLATES)]);
      usePlanStore.setState({ loaded: true, days: normalizeDays(days), templates: normalizeTemplates(templates) });
    })().catch(() => {
      usePlanStore.setState({ loaded: true });
    });
  }
  return loadingPromise;
}

/** 备份恢复以后：丢掉内存里的，下次重新从手机里读 */
export function resetPlanCache(): void {
  loadingPromise = null;
  usePlanStore.setState({ loaded: false, days: {}, templates: { ...EMPTY_TEMPLATES } });
}

let writeChain: Promise<void> = Promise.resolve();
function persist(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  writeChain = writeChain.catch(() => {}).then(() => AsyncStorage.setItem(key, json));
  return writeChain;
}

/** 撤销用：记下这几天现在的样子（没排的记成 null） */
export function snapshotDays(keys: string[]): Record<string, DaySlots | null> {
  const days = usePlanStore.getState().days;
  const snap: Record<string, DaySlots | null> = {};
  for (const k of keys) snap[k] = days[k] ? days[k].map((s) => (s ? { ...s } : null)) : null;
  return snap;
}

/** 整天整天地写：null 或全空 = 这天不留 */
export async function writeDays(patch: Record<string, DaySlots | null>): Promise<void> {
  await ensurePlansLoaded();
  const next = { ...usePlanStore.getState().days };
  for (const [k, slots] of Object.entries(patch)) {
    const day = slots ? normalizeDay(slots) : null;
    if (!day || isEmptyDay(day)) delete next[k];
    else next[k] = day;
  }
  usePlanStore.setState({ days: next });
  await persist(K_PLAN_DAYS, next);
}

/** 把这几天的 [from, to) 钟头都写成 slot；slot = null 就是清掉 */
export async function setRange(keys: string[], from: number, to: number, slot: PlanSlot | null): Promise<void> {
  await ensurePlansLoaded();
  const days = usePlanStore.getState().days;
  const patch: Record<string, DaySlots> = {};
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(HOURS_PER_DAY, Math.max(from, to));
  for (const k of keys) {
    const day = daySlotsOf(days, k).slice();
    for (let h = lo; h < hi; h++) day[h] = slot ? { c: slot.c, d: slot.d.trim() } : null;
    patch[k] = day;
  }
  await writeDays(patch);
}

// ---------------- 模板 ----------------

async function writeTemplates(next: PlanTemplates): Promise<void> {
  usePlanStore.setState({ templates: next });
  await persist(K_PLAN_TEMPLATES, next);
}

export async function saveDayTemplate(name: string, slots: DaySlots): Promise<DayTemplate> {
  await ensurePlansLoaded();
  const t: DayTemplate = { id: genId(), name: name.trim() || '日模板', slots: normalizeDay(slots), created_at: new Date().toISOString() };
  const cur = usePlanStore.getState().templates;
  await writeTemplates({ ...cur, days: [...cur.days, t] });
  return t;
}

export async function saveWeekTemplate(name: string, weekKeys: string[]): Promise<WeekTemplate> {
  await ensurePlansLoaded();
  const days = usePlanStore.getState().days;
  const t: WeekTemplate = {
    id: genId(),
    name: name.trim() || '周模板',
    days: weekKeys.slice(0, 7).map((k) => normalizeDay(daySlotsOf(days, k))),
    created_at: new Date().toISOString(),
  };
  const cur = usePlanStore.getState().templates;
  await writeTemplates({ ...cur, weeks: [...cur.weeks, t] });
  return t;
}

export async function renameTemplate(kind: 'day' | 'week', id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  const cur = usePlanStore.getState().templates;
  if (kind === 'day') await writeTemplates({ ...cur, days: cur.days.map((t) => (t.id === id ? { ...t, name: clean } : t)) });
  else await writeTemplates({ ...cur, weeks: cur.weeks.map((t) => (t.id === id ? { ...t, name: clean } : t)) });
}

export async function deleteTemplate(kind: 'day' | 'week', id: string): Promise<void> {
  const cur = usePlanStore.getState().templates;
  if (kind === 'day') await writeTemplates({ ...cur, days: cur.days.filter((t) => t.id !== id) });
  else
    await writeTemplates({
      ...cur,
      weeks: cur.weeks.filter((t) => t.id !== id),
      defaultWeekId: cur.defaultWeekId === id ? null : cur.defaultWeekId,
    });
}

/** 设成默认（再设一次同一个 = 取消默认） */
export async function toggleDefaultWeek(id: string): Promise<void> {
  const cur = usePlanStore.getState().templates;
  await writeTemplates({ ...cur, defaultWeekId: cur.defaultWeekId === id ? null : id });
}

/** 把日模板整个套到这几天上（原来的换掉）。返回套之前的样子，撤销用 */
export async function applyDayTemplate(id: string, keys: string[]): Promise<Record<string, DaySlots | null> | null> {
  await ensurePlansLoaded();
  const t = usePlanStore.getState().templates.days.find((x) => x.id === id);
  if (!t || keys.length === 0) return null;
  const before = snapshotDays(keys);
  const patch: Record<string, DaySlots> = {};
  for (const k of keys) patch[k] = t.slots.map((s) => (s ? { ...s } : null));
  await writeDays(patch);
  return before;
}

/** 把周模板整个套到这周（周一到周日）上。返回套之前的样子，撤销用 */
export async function applyWeekTemplate(id: string, weekKeys: string[]): Promise<Record<string, DaySlots | null> | null> {
  await ensurePlansLoaded();
  const t = usePlanStore.getState().templates.weeks.find((x) => x.id === id);
  if (!t) return null;
  const before = snapshotDays(weekKeys);
  const patch: Record<string, DaySlots> = {};
  weekKeys.slice(0, 7).forEach((k, i) => {
    patch[k] = t.days[i].map((s) => (s ? { ...s } : null));
  });
  await writeDays(patch);
  return before;
}

/**
 * 第一次看到一周时：这周还没过完、一格剧本都没有、又设了默认周模板，就用它填好。
 * 填过的、第一次看到时已经有剧本的周都记下来，以后不再自动填（清空了也不会又冒出来）；过去的周不碰。
 * 返回填之前的样子和模板名（给「已用 X 填好 · 撤销」用），没填返回 null。
 */
export async function ensureDefaultForWeek(
  weekKeys: string[],
  todayKey: string
): Promise<{ before: Record<string, DaySlots | null>; name: string } | null> {
  await ensurePlansLoaded();
  const monday = weekKeys[0];
  const sunday = weekKeys[6];
  if (!monday || !sunday || sunday < todayKey) return null;
  const { templates, days } = usePlanStore.getState();
  if (templates.autoFilled.includes(monday)) return null;
  const hasAny = weekKeys.some((k) => !isEmptyDay(days[k]));
  if (hasAny) {
    await writeTemplates({ ...templates, autoFilled: [...templates.autoFilled, monday] });
    return null;
  }
  const def = templates.weeks.find((w) => w.id === templates.defaultWeekId);
  if (!def) return null;
  const before = await applyWeekTemplate(def.id, weekKeys);
  const cur = usePlanStore.getState().templates;
  await writeTemplates({ ...cur, autoFilled: [...cur.autoFilled, monday] });
  return before ? { before, name: def.name } : null;
}

// ---------------- 视图 ----------------

export async function loadTimeView(): Promise<TimeView> {
  try {
    const v = await AsyncStorage.getItem(K_TIME_VIEW);
    if (v === 'week' || v === 'compare' || v === 'fine') return v;
  } catch {}
  return 'fine';
}

export async function saveTimeView(v: TimeView): Promise<void> {
  try {
    await AsyncStorage.setItem(K_TIME_VIEW, v);
  } catch {}
}
