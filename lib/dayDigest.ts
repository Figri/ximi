import { loadCategories, loadLogs } from './timelogLocal';
import { loadCompletions as loadTodoCompletions, loadItems as loadTodoItems } from './todoLocal';
import { fetchDayView } from './schedule';
import { stateEventsBetween, summarizeStates } from './states';
import { fragmentsBetween } from './fragments';

// 一天的数字摘要：给 Notion 日记属性、灵的上下文、本周视图用。
// 「一天」从 dayStartHour 点算到第二天同一时间（凌晨还没睡算前一天）。

export interface DayDigest {
  dayKey: string;
  sleepHours: number | null;
  sleepStart: string | null;
  sleepEnd: string | null;
  states: string;
  timeSplit: string;
  timeByCategory: { name: string; minutes: number; color: string }[];
  routines: string;
  todosDone: number;
  fragments: string;
  hasData: boolean;
}

export function dayWindow(dayKey: string, dayStartHour = 5): { start: Date; end: Date } {
  const [y, m, d] = dayKey.split('-').map(Number);
  const start = new Date(y, m - 1, d, dayStartHour, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, dayStartHour, 0, 0, 0);
  return { start, end };
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = min / 60;
  return Number.isInteger(Math.round(h * 2) / 2) && Math.round(h * 2) % 2 === 0 ? `${Math.round(h)}h` : `${(Math.round(h * 2) / 2).toFixed(1)}h`;
}

export async function buildDayDigest(dayKey: string, dayStartHour = 5): Promise<DayDigest> {
  const { start, end } = dayWindow(dayKey, dayStartHour);
  const [logs, cats] = await Promise.all([loadLogs(), loadCategories()]);
  const catById = new Map(cats.map((c) => [c.id, c]));

  // 睡眠：「睡觉」分类、在这天 0 点到 16 点之间醒来的那几段
  const [y, m, d] = dayKey.split('-').map(Number);
  const morningStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const morningEnd = new Date(y, m - 1, d, 16, 0, 0, 0).getTime();
  const sleeps = logs.filter((l) => {
    const name = catById.get(l.category_id ?? '')?.name ?? '';
    const endT = new Date(l.end_time).getTime();
    return name.includes('睡') && endT >= morningStart && endT <= morningEnd;
  });
  let sleepHours: number | null = null;
  let sleepStart: string | null = null;
  let sleepEnd: string | null = null;
  if (sleeps.length) {
    const total = sleeps.reduce((s, l) => s + (new Date(l.end_time).getTime() - new Date(l.start_time).getTime()), 0);
    sleepHours = Math.round((total / 3600000) * 10) / 10;
    sleepStart = hhmm(new Date(Math.min(...sleeps.map((l) => new Date(l.start_time).getTime()))));
    sleepEnd = hhmm(new Date(Math.max(...sleeps.map((l) => new Date(l.end_time).getTime()))));
  }

  // 时间分布：这一天窗口里的时间块按分类加总
  const byCat = new Map<string, { name: string; minutes: number; color: string }>();
  for (const l of logs) {
    const s = Math.max(new Date(l.start_time).getTime(), start.getTime());
    const e = Math.min(new Date(l.end_time).getTime(), end.getTime());
    if (e <= s) continue;
    const cat = catById.get(l.category_id ?? '');
    const name = cat?.name ?? '其他';
    const cur = byCat.get(name) ?? { name, minutes: 0, color: cat?.color ?? '#A49BB8' };
    cur.minutes += (e - s) / 60000;
    byCat.set(name, cur);
  }
  const timeByCategory = [...byCat.values()].sort((a, b) => b.minutes - a.minutes);
  const timeSplit = timeByCategory
    .slice(0, 6)
    .map((c) => `${c.name} ${formatMinutes(c.minutes)}`)
    .join(' · ');

  // 例行：作息模板那几行做了几个
  let routines = '';
  try {
    const view = await fetchDayView(dayKey);
    const rows = Object.values(view.rowsBySlot).flat().filter((r) => r.source === 'template');
    if (rows.length) routines = `${rows.filter((r) => r.done).length} / ${rows.length}`;
  } catch {}

  // 事项：这一天做完了几件
  let todosDone = 0;
  try {
    const [items, comps] = await Promise.all([loadTodoItems(), loadTodoCompletions()]);
    for (const it of items) {
      if (it.repeat_type === 'none') {
        if (it.done && it.completed_at) {
          const t = new Date(it.completed_at).getTime();
          if (t >= start.getTime() && t < end.getTime()) todosDone++;
        }
      }
    }
    todosDone += comps.filter((c) => c.date === dayKey).length;
  } catch {}

  const events = await stateEventsBetween(start, end).catch(() => []);
  const frags = await fragmentsBetween(start, end).catch(() => []);
  const fragments = frags.map((f) => `${hhmm(new Date(f.at))} ${f.text}`).join(' ｜ ');

  const digest: DayDigest = {
    dayKey,
    sleepHours,
    sleepStart,
    sleepEnd,
    states: summarizeStates(events),
    timeSplit,
    timeByCategory,
    routines,
    todosDone,
    fragments,
    hasData: false,
  };
  digest.hasData = !!(sleepHours || digest.states || timeSplit || routines || todosDone || fragments);
  return digest;
}
