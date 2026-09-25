import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TimeCategory, TimeTag, TimeLog } from '../types';
import { DEFAULT_CATEGORIES, DEFAULT_TAGS } from './timelog';
import { enqueueSync } from './timelogSync';

const K_CATEGORIES = 'timelog_categories_v1';
const K_TAGS = 'timelog_tags_v1';
const K_LOGS = 'timelog_logs_v1';

/**
 * 生成标准 UUID v4 格式的本地 id——不能用 'loc_xxx' 这种自定义前缀，
 * 因为 Supabase 那边 id 列是 uuid 类型，后台同步 upsert 时非法格式的
 * id 会被 Postgres 直接拒绝（400），导致本地新建的数据永远同步不上去。
 */
export function genId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------- 分类 ----------
export async function loadCategories(): Promise<TimeCategory[]> {
  const raw = await AsyncStorage.getItem(K_CATEGORIES);
  if (raw) return JSON.parse(raw);
  const seeded: TimeCategory[] = DEFAULT_CATEGORIES.map((c, i) => ({
    id: genId(),
    name: c.name,
    color: c.color,
    parent_id: null,
    default_description: null,
    sort_order: c.sort_order ?? i,
    archived: false,
    created_at: new Date().toISOString(),
  }));
  await AsyncStorage.setItem(K_CATEGORIES, JSON.stringify(seeded));
  // 默认分类只在本机播种，不推到后台的话，之后任何引用它的 time_logs
  // 在同步时都会因为 category_id 外键找不到对应行而被 Postgres 拒绝（409）。
  // 必须逐个await：并发触发多个enqueueSync会对同一个队列key做并发的
  // 读-改-写，后写的会把先写的覆盖掉，导致大部分种子分类实际上没排进队列。
  for (const c of seeded) await enqueueSync({ table: 'time_categories', op: 'upsert', row: c });
  return seeded;
}
export async function saveCategories(list: TimeCategory[]): Promise<void> {
  await AsyncStorage.setItem(K_CATEGORIES, JSON.stringify(list));
}

// ---------- 标签（同结构，用 K_TAGS + DEFAULT_TAGS）----------
export async function loadTags(): Promise<TimeTag[]> {
  const raw = await AsyncStorage.getItem(K_TAGS);
  if (raw) return JSON.parse(raw);
  const seeded: TimeTag[] = DEFAULT_TAGS.map((t, i) => ({
    id: genId(),
    name: t.name,
    color: t.color,
    sort_order: t.sort_order ?? i,
    archived: false,
    created_at: new Date().toISOString(),
  }));
  await AsyncStorage.setItem(K_TAGS, JSON.stringify(seeded));
  for (const t of seeded) await enqueueSync({ table: 'time_tags', op: 'upsert', row: t });
  return seeded;
}
export async function saveTags(list: TimeTag[]): Promise<void> {
  await AsyncStorage.setItem(K_TAGS, JSON.stringify(list));
}

// ---------- 时间记录（无默认值，空数组起步）----------
export async function loadLogs(): Promise<TimeLog[]> {
  const raw = await AsyncStorage.getItem(K_LOGS);
  return raw ? JSON.parse(raw) : [];
}
export async function saveLogs(list: TimeLog[]): Promise<void> {
  await AsyncStorage.setItem(K_LOGS, JSON.stringify(list));
}
