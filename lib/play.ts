import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './timelog';
import { loadCategories } from './timelogLocal';

// 娱乐出口（需求文档 §8.3）：开始玩之前定个出口，到点灵来叫你；可以再 10 分钟一次；
// 结束时自动记一段「玩」的时间块。进行中的那一局存在 play_session_v1。

export type PlayWhat = '游戏' | '短视频' | '聊天' | '其他';
export const PLAY_WHATS: PlayWhat[] = ['游戏', '短视频', '聊天', '其他'];
export const PLAY_DURATIONS: { label: string; minutes: number }[] = [
  { label: '一局', minutes: 20 },
  { label: '30 分钟', minutes: 30 },
  { label: '1 小时', minutes: 60 },
];

export interface PlaySession {
  id: string;
  what: PlayWhat;
  startedAt: string;
  endsAt: string;
  minutes: number;
  extended: boolean;
}

const K_SESSION = 'play_session_v1';
const K_LAST_END = 'play_last_end_v1';

export async function getPlaySession(): Promise<PlaySession | null> {
  try {
    const raw = await AsyncStorage.getItem(K_SESSION);
    return raw ? (JSON.parse(raw) as PlaySession) : null;
  } catch {
    return null;
  }
}

export async function startPlay(what: PlayWhat, minutes: number, now = new Date()): Promise<PlaySession> {
  const session: PlaySession = {
    id: `play-${now.getTime()}`,
    what,
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + minutes * 60000).toISOString(),
    minutes,
    extended: false,
  };
  await AsyncStorage.setItem(K_SESSION, JSON.stringify(session));
  return session;
}

/** 再 10 分钟：只能延一次 */
export async function extendPlay(): Promise<PlaySession | null> {
  const s = await getPlaySession();
  if (!s || s.extended) return s;
  const next: PlaySession = {
    ...s,
    extended: true,
    endsAt: new Date(new Date(s.endsAt).getTime() + 10 * 60000).toISOString(),
    minutes: s.minutes + 10,
  };
  await AsyncStorage.setItem(K_SESSION, JSON.stringify(next));
  return next;
}

/** 结束（到点或提前）：自动记一段「玩」的时间块 */
export async function endPlay(now = new Date()): Promise<{ loggedMinutes: number } | null> {
  const s = await getPlaySession();
  if (!s) return null;
  await AsyncStorage.removeItem(K_SESSION);
  const start = new Date(s.startedAt);
  const end = new Date(Math.min(now.getTime(), new Date(s.endsAt).getTime() + 60 * 60000));
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  await AsyncStorage.setItem(K_LAST_END, end.toISOString());
  if (minutes >= 1) {
    try {
      const cats = await loadCategories();
      const play = cats.find((c) => c.name.includes('玩') || c.name.includes('娱乐')) ?? null;
      await addLog({
        category_id: play?.id ?? null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        description: s.what,
        tag_ids: [],
      });
    } catch {}
  }
  return { loggedMinutes: Math.max(0, minutes) };
}

/** 刚结束不到 5 分钟又要开始：灵问一句要不要先歇两分钟（只问，不拦） */
export async function endedRecently(now = new Date()): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(K_LAST_END);
    if (!raw) return false;
    return now.getTime() - new Date(raw).getTime() < 5 * 60000;
  } catch {
    return false;
  }
}
