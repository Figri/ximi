import AsyncStorage from '@react-native-async-storage/async-storage';
import { cupsOnDay, type WaterEntry } from './waterPlan';

// 喝水：点一下杯子 = 喝了一杯（500ml），存喝的时间；提醒开关默认开（10、14、17、20 点由灵来叫）。
// 计算（哪天几杯、什么时候提醒）在 waterPlan.ts。

const K_LOG = 'water_log_v1';
const K_SETTINGS = 'water_settings_v1';
/** 只留最近这么多天，够周回顾用 */
const KEEP_DAYS = 120;

export interface WaterSettings {
  remind: boolean;
}

export async function loadWater(): Promise<WaterEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(K_LOG);
    const list = raw ? (JSON.parse(raw) as WaterEntry[]) : [];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.at === 'string') : [];
  } catch {
    return [];
  }
}

async function saveWater(list: WaterEntry[]): Promise<void> {
  const since = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
  await AsyncStorage.setItem(K_LOG, JSON.stringify(list.filter((e) => new Date(e.at).getTime() >= since)));
}

let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

export function addCup(at = new Date()): Promise<WaterEntry> {
  return locked(async () => {
    const entry: WaterEntry = { id: `${at.getTime()}-${Math.random().toString(36).slice(2, 7)}`, at: at.toISOString() };
    await saveWater([...(await loadWater()), entry]);
    return entry;
  });
}

export function removeCup(id: string): Promise<void> {
  return locked(async () => {
    await saveWater((await loadWater()).filter((e) => e.id !== id));
  });
}

export async function cupsToday(dayKey: string, dayStartHour: number): Promise<number> {
  return cupsOnDay(await loadWater(), dayKey, dayStartHour);
}

export async function loadWaterSettings(): Promise<WaterSettings> {
  try {
    const raw = await AsyncStorage.getItem(K_SETTINGS);
    return { remind: true, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { remind: true };
  }
}

export async function saveWaterSettings(s: WaterSettings): Promise<void> {
  await AsyncStorage.setItem(K_SETTINGS, JSON.stringify(s));
}
