import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ScheduleCheck, ScheduleDiary, ScheduleItem, ScheduleTemplateItem, ScheduleTemplateVersion } from '../types';
import { enqueueSync } from './timelogSync';

export { genId } from './timelogLocal';

const K_TEMPLATE_VERSIONS = 'schedule_template_versions_v1';
const K_TEMPLATE_ITEMS = 'schedule_template_items_v1';
const K_ITEMS = 'schedule_items_v1';
const K_CHECKS = 'schedule_checks_v1';
const K_DIARY = 'schedule_diary_v1';

// 本地优先，整份JSON blob读写——跟timelogLocal.ts/todoLocal.ts同一套路子，
// 保持这个仓库里"本地缓存+后台排队同步"的架构一致，不另起一套。

export async function loadTemplateVersions(): Promise<ScheduleTemplateVersion[]> {
  const raw = await AsyncStorage.getItem(K_TEMPLATE_VERSIONS);
  return raw ? JSON.parse(raw) : [];
}
export async function saveTemplateVersions(list: ScheduleTemplateVersion[]): Promise<void> {
  await AsyncStorage.setItem(K_TEMPLATE_VERSIONS, JSON.stringify(list));
}

export async function loadTemplateItems(): Promise<ScheduleTemplateItem[]> {
  const raw = await AsyncStorage.getItem(K_TEMPLATE_ITEMS);
  return raw ? JSON.parse(raw) : [];
}
export async function saveTemplateItems(list: ScheduleTemplateItem[]): Promise<void> {
  await AsyncStorage.setItem(K_TEMPLATE_ITEMS, JSON.stringify(list));
}

export async function loadItems(): Promise<ScheduleItem[]> {
  const raw = await AsyncStorage.getItem(K_ITEMS);
  return raw ? JSON.parse(raw) : [];
}
export async function saveItems(list: ScheduleItem[]): Promise<void> {
  await AsyncStorage.setItem(K_ITEMS, JSON.stringify(list));
}

export async function loadChecks(): Promise<ScheduleCheck[]> {
  const raw = await AsyncStorage.getItem(K_CHECKS);
  return raw ? JSON.parse(raw) : [];
}
export async function saveChecks(list: ScheduleCheck[]): Promise<void> {
  await AsyncStorage.setItem(K_CHECKS, JSON.stringify(list));
}

export async function loadDiaries(): Promise<ScheduleDiary[]> {
  const raw = await AsyncStorage.getItem(K_DIARY);
  return raw ? JSON.parse(raw) : [];
}
export async function saveDiaries(list: ScheduleDiary[]): Promise<void> {
  await AsyncStorage.setItem(K_DIARY, JSON.stringify(list));
}

export { enqueueSync };
