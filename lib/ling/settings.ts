import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { DEFAULT_MODEL, type AIModel } from '../ai';
import { getSelectedModel, setSelectedModel } from '../aiSettings';

// 灵的设定：频率、免打扰、锁屏、今天别找我、大脑。全部存手机本地，改了立刻生效。

export type LockScreenMode = 'full' | 'hidden';

export interface LingSettings {
  /** 「想你了」每天最多几条（D4=A 默认 2） */
  missYouPerDay: number;
  /** 免打扰开始/结束，'HH:MM'，可以跨午夜 */
  quietStart: string;
  quietEnd: string;
  /** 锁屏显示：full=全文（D5=B 默认），hidden=只显示「灵」 */
  lockScreen: LockScreenMode;
  /** 今天别找我：存当天的日期 key，第二天自动失效 */
  pausedOn: string | null;
  /** 四种主动消息各自的开关 */
  enableMissYou: boolean;
  enableMention: boolean;
  enableCatch: boolean;
  /** 和灵的对话每月存进 Notion（可关） */
  archiveChatToNotion: boolean;
  /** 一天从几点算起（凌晨还没睡时还算前一天） */
  dayStartHour: number;
}

export const DEFAULT_LING_SETTINGS: LingSettings = {
  missYouPerDay: 2,
  quietStart: '00:30',
  quietEnd: '10:30',
  lockScreen: 'full',
  pausedOn: null,
  enableMissYou: true,
  enableMention: true,
  enableCatch: true,
  archiveChatToNotion: true,
  dayStartHour: 5,
};

const K_SETTINGS = 'ling_settings_v1';

export function isValidHHMM(s: string): boolean {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

function sanitize(raw: any): LingSettings {
  const s: LingSettings = { ...DEFAULT_LING_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  if (!isValidHHMM(s.quietStart)) s.quietStart = DEFAULT_LING_SETTINGS.quietStart;
  if (!isValidHHMM(s.quietEnd)) s.quietEnd = DEFAULT_LING_SETTINGS.quietEnd;
  s.missYouPerDay = Math.max(0, Math.min(3, Number(s.missYouPerDay) || 0));
  if (s.lockScreen !== 'full' && s.lockScreen !== 'hidden') s.lockScreen = 'full';
  s.dayStartHour = Math.max(0, Math.min(8, Number.isFinite(s.dayStartHour) ? s.dayStartHour : 5));
  return s;
}

interface LingSettingsState {
  settings: LingSettings;
  model: AIModel;
  loaded: boolean;
  load: () => Promise<LingSettings>;
  update: (patch: Partial<LingSettings>) => Promise<void>;
  setModel: (model: AIModel) => Promise<void>;
}

export const useLingSettings = create<LingSettingsState>((set, get) => ({
  settings: DEFAULT_LING_SETTINGS,
  model: DEFAULT_MODEL,
  loaded: false,

  load: async () => {
    let settings = DEFAULT_LING_SETTINGS;
    try {
      const raw = await AsyncStorage.getItem(K_SETTINGS);
      settings = sanitize(raw ? JSON.parse(raw) : null);
    } catch {}
    const model = (await getSelectedModel().catch(() => null)) ?? DEFAULT_MODEL;
    set({ settings, model, loaded: true });
    return settings;
  },

  update: async (patch) => {
    const next = sanitize({ ...get().settings, ...patch });
    set({ settings: next });
    await AsyncStorage.setItem(K_SETTINGS, JSON.stringify(next));
  },

  setModel: async (model) => {
    set({ model });
    await setSelectedModel(model);
  },
}));

export async function loadLingSettings(): Promise<LingSettings> {
  const st = useLingSettings.getState();
  if (st.loaded) return st.settings;
  return st.load();
}

// ---- 时间工具 ----

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 某个时刻是否落在免打扰时段（支持跨午夜，比如 00:30–10:30 或 23:00–08:00） */
export function isQuiet(date: Date, s: Pick<LingSettings, 'quietStart' | 'quietEnd'>): boolean {
  const start = minutesOf(s.quietStart);
  const end = minutesOf(s.quietEnd);
  const now = date.getHours() * 60 + date.getMinutes();
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** 从某个时刻往后，第一个不在免打扰里的时刻（就是它自己，或者免打扰结束那一刻） */
export function nextAllowed(date: Date, s: Pick<LingSettings, 'quietStart' | 'quietEnd'>): Date {
  if (!isQuiet(date, s)) return date;
  const end = minutesOf(s.quietEnd);
  const d = new Date(date);
  d.setSeconds(0, 0);
  d.setHours(Math.floor(end / 60), end % 60);
  if (d.getTime() <= date.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

/** 「今天」的日期 key：一天从 dayStartHour 点算起，凌晨还没睡时还算前一天 */
export function lingDayKey(date: Date, dayStartHour = DEFAULT_LING_SETTINGS.dayStartHour): string {
  const d = new Date(date.getTime() - dayStartHour * 3600 * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isPausedToday(s: LingSettings, now = new Date()): boolean {
  return !!s.pausedOn && s.pausedOn === lingDayKey(now, s.dayStartHour);
}
