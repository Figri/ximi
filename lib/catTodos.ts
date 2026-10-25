import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadItems as loadTodoItems } from './todoLocal';
import { addItem as addTodo } from './todo';

// 事项和猫的关联（＋ 里提到猫的名字、猫的页面里填了「下次」日期）存在 todo_cat_links_v1：{ 事项 id: [猫 id] }

const K_LINKS = 'todo_cat_links_v1';

export interface CatTodo {
  id: string;
  content: string;
  date: string;
  done: boolean;
}

async function readLinks(): Promise<Record<string, string[]>> {
  try {
    const raw = await AsyncStorage.getItem(K_LINKS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function linkTodoToCats(todoId: string, catIds: string[]): Promise<void> {
  if (!catIds.length) return;
  const map = await readLinks();
  map[todoId] = Array.from(new Set([...(map[todoId] ?? []), ...catIds]));
  await AsyncStorage.setItem(K_LINKS, JSON.stringify(map));
}

/** 每只猫关联的事项（按日期排，删掉了的事项自动跳过） */
export async function catTodos(): Promise<Record<string, CatTodo[]>> {
  const [map, items] = await Promise.all([readLinks(), loadTodoItems()]);
  const byId = new Map(items.map((t) => [t.id, t]));
  const out: Record<string, CatTodo[]> = {};
  for (const [todoId, catIds] of Object.entries(map)) {
    const t = byId.get(todoId);
    if (!t) continue;
    for (const catId of catIds) (out[catId] = out[catId] ?? []).push({ id: t.id, content: t.content, date: t.date, done: t.repeat_type === 'none' && t.done });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** 猫的页面里填了「下次」：在那天建一条事项（到时候今天页能看到），并挂到这只猫身上 */
export async function scheduleNextForCat(catId: string, catName: string, what: string, date: string): Promise<void> {
  const item = await addTodo({ content: `${catName} ${what}`, date });
  await linkTodoToCats(item.id, [catId]);
}

/** 「11/28」「11月28日」「2026-11-28」→ YYYY-MM-DD；认不出返回 null */
export function parseNextDate(input: string, today = new Date()): string | null {
  const s = input.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y = today.getFullYear();
  let mo: number;
  let d: number;
  if (m) {
    y = Number(m[1]);
    mo = Number(m[2]);
    d = Number(m[3]);
  } else {
    m = s.match(/^(\d{1,2})\s*[/月.]\s*(\d{1,2})\s*[日号]?$/);
    if (!m) return null;
    mo = Number(m[1]);
    d = Number(m[2]);
    // 只写了月日、又比今天早：是明年的
    if (new Date(y, mo - 1, d).getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) y += 1;
  }
  const dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

