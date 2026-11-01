import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_TODAY_LAYOUT, normalizeLayout, type TodayLayout } from './todayCards';

// 今天页卡片的顺序和显示隐藏，存在本机（备份文件里也带）。

const K_LAYOUT = 'today_layout_v1';

export async function loadTodayLayout(): Promise<TodayLayout> {
  try {
    const raw = await AsyncStorage.getItem(K_LAYOUT);
    return raw ? normalizeLayout(JSON.parse(raw)) : { ...DEFAULT_TODAY_LAYOUT, order: [...DEFAULT_TODAY_LAYOUT.order] };
  } catch {
    return { ...DEFAULT_TODAY_LAYOUT, order: [...DEFAULT_TODAY_LAYOUT.order] };
  }
}

export async function saveTodayLayout(layout: TodayLayout): Promise<void> {
  await AsyncStorage.setItem(K_LAYOUT, JSON.stringify(normalizeLayout(layout)));
}
