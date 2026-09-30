import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TodoCategory, TodoCompletion, TodoItem } from '../types';
import { genId } from './timelogLocal';
import { enqueueSync } from './timelogSync';

const K_CATEGORIES = 'todo_categories_v1';
const K_ITEMS = 'todo_items_v1';
const K_COMPLETIONS = 'todo_completions_v1';

export const DEFAULT_TODO_CATEGORIES = [
  { name: '生活', color: '#5CB88A', sort_order: 1 },
  { name: '工作', color: '#2E6DB4', sort_order: 2 },
  { name: '学习', color: '#8B7BA8', sort_order: 3 },
  { name: '猫', color: '#F5B841', sort_order: 4 },
  { name: '其他', color: '#7A857D', sort_order: 5 },
];

// ---------- 分类 ----------
export async function loadCategories(): Promise<TodoCategory[]> {
  const raw = await AsyncStorage.getItem(K_CATEGORIES);
  if (raw) return JSON.parse(raw);
  const seeded: TodoCategory[] = DEFAULT_TODO_CATEGORIES.map((c, i) => ({
    id: genId(),
    name: c.name,
    color: c.color,
    sort_order: c.sort_order ?? i,
    archived: false,
    created_at: new Date().toISOString(),
  }));
  await AsyncStorage.setItem(K_CATEGORIES, JSON.stringify(seeded));
  // 必须逐个await：并发触发多个enqueueSync会对同一个队列key做并发的读-改-写，
  // 后写的会把先写的覆盖掉——这是这个项目反复踩过的坑，这里照旧绕开
  for (const c of seeded) await enqueueSync({ table: 'todo_categories', op: 'upsert', row: c });
  return seeded;
}
export async function saveCategories(list: TodoCategory[]): Promise<void> {
  await AsyncStorage.setItem(K_CATEGORIES, JSON.stringify(list));
}

// ---------- 事项（无默认值，空数组起步） ----------
export async function loadItems(): Promise<TodoItem[]> {
  const raw = await AsyncStorage.getItem(K_ITEMS);
  return raw ? JSON.parse(raw) : [];
}
export async function saveItems(list: TodoItem[]): Promise<void> {
  await AsyncStorage.setItem(K_ITEMS, JSON.stringify(list));
}

// ---------- 重复事项按天完成记录 ----------
export async function loadCompletions(): Promise<TodoCompletion[]> {
  const raw = await AsyncStorage.getItem(K_COMPLETIONS);
  return raw ? JSON.parse(raw) : [];
}
export async function saveCompletions(list: TodoCompletion[]): Promise<void> {
  await AsyncStorage.setItem(K_COMPLETIONS, JSON.stringify(list));
}
