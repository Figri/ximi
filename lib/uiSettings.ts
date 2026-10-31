import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyFontScale, FONT_SCALES, type FontScaleKey } from '../constants/theme';

// 界面设置：现在只有字号。存在 ui_settings_v1，根布局在渲染页面之前读一次、放大字号（所以改了要重启生效）。

const K_UI = 'ui_settings_v1';

export interface UiSettings {
  fontScale: FontScaleKey;
}

export async function loadUiSettings(): Promise<UiSettings> {
  try {
    const raw = await AsyncStorage.getItem(K_UI);
    const s = raw ? JSON.parse(raw) : {};
    return { fontScale: FONT_SCALES.some((f) => f.key === s.fontScale) ? s.fontScale : 'standard' };
  } catch {
    return { fontScale: 'standard' };
  }
}

export async function saveUiSettings(s: UiSettings): Promise<void> {
  await AsyncStorage.setItem(K_UI, JSON.stringify(s));
}

/** 只在根布局启动时用：读存的档位并放大，返回用的是哪档 */
export async function applyStoredFontScale(): Promise<FontScaleKey> {
  const { fontScale } = await loadUiSettings();
  applyFontScale(FONT_SCALES.find((f) => f.key === fontScale)?.scale ?? 1);
  return fontScale;
}

/** 根布局把页面挂上以后才 resolve：启动时要跳页面（点通知冷启动进对话）的等它，免得页面还没挂上就跳 */
let markReady: () => void = () => {};
export const uiReady = new Promise<void>((resolve) => {
  markReady = resolve;
});
export function setUiReady(): void {
  markReady();
}
