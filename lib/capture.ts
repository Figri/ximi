import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog, deleteLog } from './timelog';
import { loadCategories } from './timelogLocal';
import { addItem as addTodo, deleteItem as deleteTodo } from './todo';
import { createCard, deleteCard, fetchCats } from './cards';
import { addFragment, deleteFragment } from './fragments';
import { addStateEvent, STATE_WORDS, type StateWord } from './states';
import { queueIdea, removeIdea, removeStateEvent } from './notion/sync';
import { loadLingSettings } from './ling/settings';
import { dateKeyOf, describeParsed, parseCapture, type CaptureKind, type ParsedCapture, type ParseContext } from './captureParse';

// 右下角 ＋ 记下的一句话：按规则归到对的地方（captureParse.ts），存好，结果显示成小标签；
// 点标签能改成别的（先删掉刚存的，再按新的存），所以每次都留着「存在哪、id 是什么」。

export type CaptureTable = 'time_logs' | 'todo_items' | 'cards' | 'state_events' | 'notion_ideas' | 'fragments';

export interface SavedCapture {
  kind: CaptureKind;
  label: string;
  parsed: ParsedCapture;
  ref: { table: CaptureTable; id: string };
}

const K_DRAFT = 'capture_draft_v1';
const K_TODO_CATS = 'todo_cat_links_v1';

export async function captureContext(now = new Date()): Promise<ParseContext> {
  const [settings, cats, categories] = await Promise.all([
    loadLingSettings(),
    fetchCats().catch(() => []),
    loadCategories().catch(() => []),
  ]);
  return {
    now,
    dayStartHour: settings.dayStartHour,
    catNames: cats.map((c) => c.name),
    categoryNames: categories.filter((c) => !c.archived).map((c) => c.name),
    stateWords: STATE_WORDS,
  };
}

export async function analyze(text: string, now = new Date()): Promise<{ parsed: ParsedCapture; label: string }> {
  const ctx = await captureContext(now);
  const parsed = parseCapture(text, ctx);
  return { parsed, label: describeParsed(parsed, now, ctx.dayStartHour) };
}

/** 事项提到了哪只猫：先记在本地，猫咪页（第四期）按这个把事项挂到猫身上 */
async function linkTodoCats(todoId: string, catNames: string[]): Promise<void> {
  if (!catNames.length) return;
  const cats = await fetchCats().catch(() => []);
  const ids = cats.filter((c) => catNames.includes(c.name)).map((c) => c.id);
  if (!ids.length) return;
  try {
    const raw = await AsyncStorage.getItem(K_TODO_CATS);
    const map: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    map[todoId] = ids;
    await AsyncStorage.setItem(K_TODO_CATS, JSON.stringify(map));
  } catch {}
}

export async function saveParsed(p: ParsedCapture, now = new Date()): Promise<SavedCapture> {
  const settings = await loadLingSettings();
  const label = describeParsed(p, now, settings.dayStartHour);
  const done = (table: CaptureTable, id: string): SavedCapture => ({ kind: p.kind, label, parsed: p, ref: { table, id } });
  switch (p.kind) {
    case 'timeblock': {
      const cats = await loadCategories();
      const cat = p.categoryName ? cats.find((c) => c.name === p.categoryName) : null;
      const log = await addLog({ category_id: cat?.id ?? null, start_time: p.start!.toISOString(), end_time: p.end!.toISOString(), description: p.text || null, tag_ids: [] });
      return done('time_logs', log.id);
    }
    case 'todo': {
      const item = await addTodo({ content: p.text, date: p.date ?? dateKeyOf(now), reminder_enabled: !!p.time, reminder_time: p.time ?? null });
      await linkTodoCats(item.id, p.cats);
      return done('todo_items', item.id);
    }
    case 'routine': {
      const r = p.repeat!;
      if (r.type === 'interval') {
        // 每隔 N 天的事：跟「该照顾的」那些例行一样，按红黄绿提醒，到时候由灵顺口一提
        const card = await createCard({ name: p.text, type: 'habit', tags: [], notes: null, display_type: 'habit', time_of_day: 'anytime', emoji: null }, [
          { name: p.text, is_primary: true, frequency_type: 'interval', interval_days: r.days, fixed_days: null, suggested_interval: r.days, max_delay: Math.ceil(r.days * 1.5), requires_selection: false },
        ]);
        return done('cards', card.id);
      }
      const item = await addTodo({
        content: p.text,
        date: p.date ?? dateKeyOf(now),
        repeat_type: r.type,
        repeat_weekdays: r.type === 'weekly' ? r.days : null,
        repeat_day_of_month: r.type === 'monthly' ? r.day : null,
        reminder_enabled: !!p.time,
        reminder_time: p.time ?? null,
      });
      await linkTodoCats(item.id, p.cats);
      return done('todo_items', item.id);
    }
    case 'state': {
      const ev = await addStateEvent(p.state as StateWord, { note: p.raw });
      return done('state_events', ev.id);
    }
    case 'idea': {
      const idea = await queueIdea(p.text);
      return done('notion_ideas', idea.id);
    }
    default: {
      const f = await addFragment(p.text || p.raw, p.at ?? now);
      return done('fragments', f.id);
    }
  }
}

/** 撤销 / 改成别的之前，把刚存的那条删掉 */
export async function removeSaved(saved: SavedCapture): Promise<void> {
  const { table, id } = saved.ref;
  switch (table) {
    case 'time_logs':
      return deleteLog(id);
    case 'todo_items':
      return deleteTodo(id);
    case 'cards':
      return deleteCard(id);
    case 'state_events':
      return removeStateEvent(id);
    case 'notion_ideas':
      return removeIdea(id);
    case 'fragments':
      return deleteFragment(id);
  }
}

/** 标签上能改成哪几种：认出来的那种 + 事项 / 碎片 / 想法池 */
export function alternativesFor(p: ParsedCapture): CaptureKind[] {
  const list: CaptureKind[] = [];
  if (p.start && p.end) list.push('timeblock');
  if (p.repeat) list.push('routine');
  if (p.state) list.push('state');
  list.push('todo', 'fragment', 'idea');
  return Array.from(new Set(list));
}

export const KIND_NAME: Record<CaptureKind, string> = {
  timeblock: '时间块',
  todo: '事项',
  routine: '例行',
  state: '状态',
  idea: '想法池',
  fragment: '碎片',
};

/** 改成另一种：先删掉刚存的，再用原话按新的那种存 */
export async function convertSaved(saved: SavedCapture, to: CaptureKind, now = new Date()): Promise<SavedCapture> {
  await removeSaved(saved);
  const p = saved.parsed;
  const settings = await loadLingSettings();
  const today = dateKeyOf(new Date(now.getTime() - settings.dayStartHour * 3600 * 1000));
  const next: ParsedCapture = { ...p, kind: to };
  if (to === 'todo') {
    next.date = p.date ?? today;
    next.time = p.time ?? null;
    next.text = p.kind === 'state' || p.kind === 'idea' ? p.raw : p.text;
  } else if (to === 'fragment' || to === 'idea') {
    next.text = p.kind === 'idea' ? p.text : p.raw;
  }
  return saveParsed(next, now);
}

// ---- 草稿：没写完就关掉，下次打开还在 ----

export async function loadDraft(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(K_DRAFT)) ?? '';
  } catch {
    return '';
  }
}

export async function saveDraft(text: string): Promise<void> {
  try {
    if (text.trim()) await AsyncStorage.setItem(K_DRAFT, text);
    else await AsyncStorage.removeItem(K_DRAFT);
  } catch {}
}
