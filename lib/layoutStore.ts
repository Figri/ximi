import { create } from 'zustand';
import { DEFAULT_LAYOUT, FEATURE_BY_KEY } from './features';

interface LayoutStoreState {
  topKeys: string[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (topKeys: string[]) => Promise<void>;
}
// 五个固定 Tab；旧的自定义布局保留在存储中，不改动任何功能数据。
export const useLayoutStore = create<LayoutStoreState>((set) => ({
  topKeys: [...DEFAULT_LAYOUT], loaded: false,
  load: async () => { set({ topKeys: [...DEFAULT_LAYOUT], loaded: true }); },
  save: async () => { set({ topKeys: [...DEFAULT_LAYOUT] }); },
}));
export function routeForFeature(key: string): string {
  const f = FEATURE_BY_KEY[key];
  if (!f) return '/';
  if (useLayoutStore.getState().topKeys.includes(key)) return f.route;
  return `/page/${key}`;
}
