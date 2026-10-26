import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ScheduleCheck, ScheduleDiary, ScheduleItem, ScheduleTemplateItem, ScheduleTemplateVersion } from '../types';
import { readList } from './timelogLocal';
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
  return (await readList<ScheduleTemplateVersion>(K_TEMPLATE_VERSIONS)) ?? [];
}
export async function saveTemplateVersions(list: ScheduleTemplateVersion[]): Promise<void> {
  await AsyncStorage.setItem(K_TEMPLATE_VERSIONS, JSON.stringify(list));
}

export async function loadTemplateItems(): Promise<ScheduleTemplateItem[]> {
  return (await readList<ScheduleTemplateItem>(K_TEMPLATE_ITEMS)) ?? [];
}
export async function saveTemplateItems(list: ScheduleTemplateItem[]): Promise<void> {
  await AsyncStorage.setItem(K_TEMPLATE_ITEMS, JSON.stringify(list));
}

export async function loadItems(): Promise<ScheduleItem[]> {
  return (await readList<ScheduleItem>(K_ITEMS)) ?? [];
}
export async function saveItems(list: ScheduleItem[]): Promise<void> {
  await AsyncStorage.setItem(K_ITEMS, JSON.stringify(list));
}

export async function loadChecks(): Promise<ScheduleCheck[]> {
  return (await readList<ScheduleCheck>(K_CHECKS)) ?? [];
}
export async function saveChecks(list: ScheduleCheck[]): Promise<void> {
  await AsyncStorage.setItem(K_CHECKS, JSON.stringify(list));
}

export async function loadDiaries(): Promise<ScheduleDiary[]> {
  return (await readList<ScheduleDiary>(K_DIARY)) ?? [];
}
export async function saveDiaries(list: ScheduleDiary[]): Promise<void> {
  await AsyncStorage.setItem(K_DIARY, JSON.stringify(list));
}

export { enqueueSync };
