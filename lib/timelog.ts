import type { TimeCategory, TimeLog, TimeTag } from '../types';
import { genId, loadCategories, loadLogs, loadTags, saveCategories, saveLogs, saveTags } from './timelogLocal';
import { enqueueSync } from './timelogSync';

export const DEFAULT_CATEGORIES = [
  { name: '做饭', color: '#8B7BA8', sort_order: 1 },
  { name: '吃饭', color: '#8B5E2B', sort_order: 2 },
  { name: '玩', color: '#A78BCE', sort_order: 3 },
  { name: '睡觉', color: '#5CB88A', sort_order: 4 },
  { name: '运动', color: '#F5B841', sort_order: 5 },
  { name: '家务', color: '#E86F52', sort_order: 6 },
  { name: '项目', color: '#2E6DB4', sort_order: 7 },
  { name: '探索', color: '#3E3A7A', sort_order: 8 },
  { name: '社交', color: '#1FA69A', sort_order: 9 },
  { name: '色色', color: '#E8D96F', sort_order: 10 },
  { name: '收纳', color: '#8B5A2B', sort_order: 11 },
  { name: 'ai', color: '#7A857D', sort_order: 12 },
];

export const DEFAULT_TAGS = [
  { name: '状态很差', color: '#1E6B3A', sort_order: 1 },
  { name: '内耗中', color: '#3A1E4A', sort_order: 2 },
  { name: '状态比较好', color: '#6B5A1E', sort_order: 3 },
  { name: '状态很好', color: '#8B6F5A', sort_order: 4 },
  { name: '平静', color: '#B5654A', sort_order: 5 },
  { name: '崩溃', color: '#7A6B2B', sort_order: 6 },
];

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function overlapsRange(log: TimeLog, start: Date, end: Date): boolean {
  return new Date(log.start_time).getTime() < end.getTime() && new Date(log.end_time).getTime() > start.getTime();
}

// ---------------- time_logs（本地优先，写操作排队后台上传） ----------------

export async function fetchLogsForDate(date: Date): Promise<TimeLog[]> {
  const { start, end } = dayRange(date);
  const all = await loadLogs();
  return all
    .filter((log) => overlapsRange(log, start, end))
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
}

export async function fetchLastLogEnd(): Promise<Date | null> {
  const all = await loadLogs();
  if (all.length === 0) return null;
  const latest = all.reduce((best, log) =>
    new Date(log.end_time).getTime() > new Date(best.end_time).getTime() ? log : best
  );
  return new Date(latest.end_time);
}

export async function addLog(entry: {
  category_id: string | null;
  start_time: string;
  end_time: string;
  description?: string | null;
  tag_ids?: string[];
  source?: 'manual' | 'chat';
}): Promise<TimeLog> {
  const all = await loadLogs();
  const newLog: TimeLog = {
    id: genId(),
    category_id: entry.category_id,
    start_time: entry.start_time,
    end_time: entry.end_time,
    description: entry.description ?? null,
    tag_ids: entry.tag_ids ?? [],
    source: entry.source ?? 'manual',
    created_at: new Date().toISOString(),
  };
  await saveLogs([...all, newLog]);
  enqueueSync({ table: 'time_logs', op: 'upsert', row: newLog });
  return newLog;
}

export async function updateLog(
  id: string,
  patch: Partial<Pick<TimeLog, 'category_id' | 'start_time' | 'end_time' | 'description' | 'tag_ids'>>
): Promise<void> {
  const all = await loadLogs();
  let updated: TimeLog | null = null;
  const next = all.map((l) => {
    if (l.id !== id) return l;
    updated = { ...l, ...patch };
    return updated;
  });
  await saveLogs(next);
  if (updated) enqueueSync({ table: 'time_logs', op: 'upsert', row: updated });
}

export async function deleteLog(id: string): Promise<void> {
  const all = await loadLogs();
  await saveLogs(all.filter((l) => l.id !== id));
  enqueueSync({ table: 'time_logs', op: 'delete', row: { id } });
}

/**
 * 甘特图选区模式：把一段段连续的时间区间(runs)填成某个分类，同时按规则处理
 * 跟已有记录(existingLogs)的重叠——完全覆盖的删掉，部分重叠的截断，选区被
 * 一条更长的旧记录整个包住的话把旧记录拆成两段。
 */
export async function applySelectionFill(
  runs: { start: Date; end: Date }[],
  categoryId: string,
  description: string | null,
  existingLogs: TimeLog[]
): Promise<void> {
  let remaining = [...existingLogs];
  for (const run of runs) {
    const rs = run.start.getTime();
    const re = run.end.getTime();
    const next: TimeLog[] = [];
    for (const log of remaining) {
      const ls = new Date(log.start_time).getTime();
      const le = new Date(log.end_time).getTime();
      if (le <= rs || ls >= re) {
        next.push(log);
        continue;
      }
      if (ls >= rs && le <= re) {
        await deleteLog(log.id);
        continue;
      }
      if (ls < rs && le > re) {
        // 选区被这条旧记录整个包住：拆成前后两段
        await updateLog(log.id, { end_time: run.start.toISOString() });
        const tail = await addLog({
          category_id: log.category_id,
          start_time: run.end.toISOString(),
          end_time: log.end_time,
          description: log.description,
          tag_ids: log.tag_ids,
        });
        next.push({ ...log, end_time: run.start.toISOString() });
        next.push(tail);
        continue;
      }
      if (ls < rs) {
        await updateLog(log.id, { end_time: run.start.toISOString() });
        next.push({ ...log, end_time: run.start.toISOString() });
        continue;
      }
      await updateLog(log.id, { start_time: run.end.toISOString() });
      next.push({ ...log, start_time: run.end.toISOString() });
    }
    const inserted = await addLog({
      category_id: categoryId,
      start_time: run.start.toISOString(),
      end_time: run.end.toISOString(),
      description,
      tag_ids: [],
    });
    next.push(inserted);
    remaining = next;
  }
}

export function formatLogDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}时`;
  return `${h}时${m}分`;
}

// ---------------- time_categories（本地优先） ----------------

export async function fetchCategories(): Promise<TimeCategory[]> {
  const all = await loadCategories();
  return all
    .filter((c) => !c.archived)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

export async function addCategory(cat: {
  name: string;
  color: string;
  parent_id?: string | null;
  default_description?: string | null;
}): Promise<TimeCategory> {
  const all = await loadCategories();
  const newCat: TimeCategory = {
    id: genId(),
    name: cat.name,
    color: cat.color,
    parent_id: cat.parent_id ?? null,
    default_description: cat.default_description ?? null,
    sort_order: all.length,
    archived: false,
    created_at: new Date().toISOString(),
  };
  await saveCategories([...all, newCat]);
  enqueueSync({ table: 'time_categories', op: 'upsert', row: newCat });
  return newCat;
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<TimeCategory, 'name' | 'color' | 'default_description' | 'sort_order'>>
): Promise<void> {
  const all = await loadCategories();
  let updated: TimeCategory | null = null;
  const next = all.map((c) => {
    if (c.id !== id) return c;
    updated = { ...c, ...patch };
    return updated;
  });
  await saveCategories(next);
  if (updated) enqueueSync({ table: 'time_categories', op: 'upsert', row: updated });
}

export async function archiveCategory(id: string): Promise<void> {
  const all = await loadCategories();
  let updated: TimeCategory | null = null;
  const next = all.map((c) => {
    if (c.id !== id) return c;
    updated = { ...c, archived: true };
    return updated;
  });
  await saveCategories(next);
  if (updated) enqueueSync({ table: 'time_categories', op: 'upsert', row: updated });
}

// ---------------- time_tags（本地优先） ----------------

export async function fetchTags(): Promise<TimeTag[]> {
  const all = await loadTags();
  return all
    .filter((t) => !t.archived)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

export async function addTag(tag: { name: string; color: string }): Promise<TimeTag> {
  const all = await loadTags();
  const newTag: TimeTag = {
    id: genId(),
    name: tag.name,
    color: tag.color,
    sort_order: all.length,
    archived: false,
    created_at: new Date().toISOString(),
  };
  await saveTags([...all, newTag]);
  enqueueSync({ table: 'time_tags', op: 'upsert', row: newTag });
  return newTag;
}

export async function updateTag(id: string, patch: Partial<Pick<TimeTag, 'name' | 'color' | 'sort_order'>>): Promise<void> {
  const all = await loadTags();
  let updated: TimeTag | null = null;
  const next = all.map((t) => {
    if (t.id !== id) return t;
    updated = { ...t, ...patch };
    return updated;
  });
  await saveTags(next);
  if (updated) enqueueSync({ table: 'time_tags', op: 'upsert', row: updated });
}

export async function archiveTag(id: string): Promise<void> {
  const all = await loadTags();
  let updated: TimeTag | null = null;
  const next = all.map((t) => {
    if (t.id !== id) return t;
    updated = { ...t, archived: true };
    return updated;
  });
  await saveTags(next);
  if (updated) enqueueSync({ table: 'time_tags', op: 'upsert', row: updated });
}

// ---------------- 统计（读本地 logs + categories） ----------------

function overlapMinutes(logStart: Date, logEnd: Date, rangeStart: Date, rangeEnd: Date): number {
  const s = Math.max(logStart.getTime(), rangeStart.getTime());
  const e = Math.min(logEnd.getTime(), rangeEnd.getTime());
  return Math.max(0, (e - s) / 60000);
}

async function fetchLogsOverlapping(start: Date, end: Date): Promise<TimeLog[]> {
  const all = await loadLogs();
  return all
    .filter((log) => overlapsRange(log, start, end))
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
}

export interface RangeStats {
  byCategory: { category_id: string | null; minutes: number }[];
  byTag: { tag_id: string; minutes: number; count: number }[];
  totalMinutes: number;
}

/** 跨天统计：每个一级分类累计时长 + 每个情绪标签出现次数/时长 */
export async function fetchRangeStats(start: Date, end: Date): Promise<RangeStats> {
  const logs = await fetchLogsOverlapping(start, end);
  const byCategory: Record<string, number> = {};
  const byTag: Record<string, { minutes: number; count: number }> = {};
  let totalMinutes = 0;

  for (const log of logs) {
    const minutes = overlapMinutes(new Date(log.start_time), new Date(log.end_time), start, end);
    totalMinutes += minutes;
    const key = log.category_id ?? '__none__';
    byCategory[key] = (byCategory[key] ?? 0) + minutes;
    for (const tagId of log.tag_ids ?? []) {
      if (!byTag[tagId]) byTag[tagId] = { minutes: 0, count: 0 };
      byTag[tagId].minutes += minutes;
      byTag[tagId].count += 1;
    }
  }

  return {
    byCategory: Object.entries(byCategory).map(([category_id, minutes]) => ({
      category_id: category_id === '__none__' ? null : category_id,
      minutes,
    })),
    byTag: Object.entries(byTag).map(([tag_id, v]) => ({ tag_id, ...v })),
    totalMinutes,
  };
}

/** 某天各分类总时长，饼图用 */
export async function fetchDayStats(date: Date): Promise<RangeStats> {
  const { start, end } = dayRange(date);
  return fetchRangeStats(start, end);
}

/** 月历每天的主导分类（时长最长的那个）id+颜色，格子底色用 */
export async function fetchMonthStats(year: number, month: number): Promise<Record<string, { category_id: string; color: string }>> {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  const [logs, categories] = await Promise.all([fetchLogsOverlapping(start, end), fetchCategories()]);
  const colorById: Record<string, string> = {};
  for (const c of categories) colorById[c.id] = c.color;

  const byDay: Record<string, Record<string, number>> = {};
  for (const log of logs) {
    if (!log.category_id) continue;
    const logStart = new Date(log.start_time);
    const logEnd = new Date(log.end_time);
    // 按天切片累加（一条记录可能跨天，虽然一般不会）
    let cursor = new Date(Math.max(logStart.getTime(), start.getTime()));
    const clampEnd = new Date(Math.min(logEnd.getTime(), end.getTime()));
    while (cursor < clampEnd) {
      const dayStart = new Date(cursor);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const sliceEnd = new Date(Math.min(dayEnd.getTime(), clampEnd.getTime()));
      const minutes = overlapMinutes(logStart, logEnd, dayStart, dayEnd);
      const key = toDateKey(dayStart);
      byDay[key] = byDay[key] ?? {};
      byDay[key][log.category_id] = (byDay[key][log.category_id] ?? 0) + minutes;
      cursor = sliceEnd;
    }
  }

  const result: Record<string, { category_id: string; color: string }> = {};
  for (const [day, cats] of Object.entries(byDay)) {
    let bestId: string | null = null;
    let bestMinutes = -1;
    for (const [catId, minutes] of Object.entries(cats)) {
      if (minutes > bestMinutes) {
        bestMinutes = minutes;
        bestId = catId;
      }
    }
    if (bestId) result[day] = { category_id: bestId, color: colorById[bestId] ?? '#A49BB8' };
  }
  return result;
}

/** 某天记录条数（日期条下面的小数字用） */
export async function fetchLogCountsForRange(dates: Date[]): Promise<Record<string, number>> {
  if (dates.length === 0) return {};
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const { start } = dayRange(sorted[0]);
  const { end } = dayRange(sorted[sorted.length - 1]);
  const logs = await fetchLogsOverlapping(start, end);
  const counts: Record<string, number> = {};
  for (const log of logs) {
    const key = toDateKey(new Date(log.start_time));
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
