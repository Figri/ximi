import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ASSIGNABLE_KEYS, DEFAULT_LAYOUT, FEATURE_BY_KEY } from './features';
import { enqueueSync } from './timelogSync';

const K_TAB_LAYOUT = 'ximi_tab_layout';
/** 2.0：「灵」要在底栏里（D1）。老布局里没有就把第三个换成灵，只做一次，之后随你拖 */
const K_LING_TAB_MIGRATED = 'ximi_tab_layout_ling_v1';
/** 2.0 第二期：底栏换成 今天 / 时间 / 灵（D1=A），只换一次，之后随你拖 */
const K_TODAY_TAB_MIGRATED = 'ximi_tab_layout_today_v1';

/** 坏数据兜底：读出来的东西不管多离谱，这个函数永远吐出一份合法的3个key。
 * 规则（文档4.「坏数据兜底」）：
 * - key 在注册表里找不到（功能被删了）→ 跳过
 * - 跳过之后不足3个 → 用默认列表里还没被选中的往后补满3个
 * - 读出来是空/解析失败 → 直接用默认
 */
function sanitizeLayout(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_LAYOUT];
  const valid = raw.filter((k): k is string => typeof k === 'string' && !!FEATURE_BY_KEY[k] && !FEATURE_BY_KEY[k].fixed);
  const deduped = Array.from(new Set(valid));
  if (deduped.length >= 3) return deduped.slice(0, 3);
  const pool = [...DEFAULT_LAYOUT, ...ASSIGNABLE_KEYS];
  for (const k of pool) {
    if (deduped.length >= 3) break;
    if (!deduped.includes(k)) deduped.push(k);
  }
  return deduped.slice(0, 3);
}

interface LayoutStoreState {
  /** 底栏当前展示的 3 个 key，顺序即底栏从左到右的顺序 */
  topKeys: string[];
  loaded: boolean;
  load: () => Promise<void>;
  /** 保存新布局：写本地 + 排队上云 + 立即更新内存（底栏跟着重渲染） */
  save: (topKeys: string[]) => Promise<void>;
}

export const useLayoutStore = create<LayoutStoreState>((set, get) => ({
  topKeys: [...DEFAULT_LAYOUT],
  loaded: false,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(K_TAB_LAYOUT);
      const parsed = raw ? JSON.parse(raw) : null;
      let keys = sanitizeLayout(parsed);
      if (!(await AsyncStorage.getItem(K_LING_TAB_MIGRATED))) {
        if (!keys.includes('chat')) {
          keys = [keys[0], keys[1], 'chat'];
          await AsyncStorage.setItem(K_TAB_LAYOUT, JSON.stringify(keys));
        }
        await AsyncStorage.setItem(K_LING_TAB_MIGRATED, '1');
      }
      if (!(await AsyncStorage.getItem(K_TODAY_TAB_MIGRATED))) {
        keys = [...DEFAULT_LAYOUT];
        await AsyncStorage.setItem(K_TAB_LAYOUT, JSON.stringify(keys));
        await AsyncStorage.setItem(K_TODAY_TAB_MIGRATED, '1');
      }
      set({ topKeys: keys, loaded: true });
    } catch {
      // 解析失败（存的根本不是合法JSON）—— 直接用默认，app 不能因为这个白屏
      set({ topKeys: [...DEFAULT_LAYOUT], loaded: true });
    }
  },

  save: async (topKeys) => {
    const clean = sanitizeLayout(topKeys);
    await AsyncStorage.setItem(K_TAB_LAYOUT, JSON.stringify(clean));
    set({ topKeys: clean });
    enqueueSync({ table: 'tab_layout', op: 'upsert', row: { id: 'main', keys: clean, updated_at: new Date().toISOString() } });
  },
}));

/** 打开某个功能：在底栏里就切过去，不在就从「其他」里推进去（返回回到「其他」） */
export function routeForFeature(key: string): string {
  const f = FEATURE_BY_KEY[key];
  if (!f) return '/';
  return useLayoutStore.getState().topKeys.includes(key) ? f.route : f.otherRoute;
}
