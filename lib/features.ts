// 西米OS 功能注册表——唯一事实源。底栏、"其他"页、跳转逻辑全部读这份列表，
// 不允许任何地方另外写死一份功能名单。
//
// 新增功能 = 新增一个页面文件 + 在这里加一条，导航层（_layout.tsx / other/index.tsx）
// 零改动。
//
// key 一旦定下不能改——用户本地保存的底栏布局(AsyncStorage/Supabase)存的就是这些
// key，改 key 等于让已有用户的布局数据全部失效。

export interface Feature {
  key: string;
  label: string;
  icon: string;
  /** app/(tabs)/ 下对应的文件名——Tabs.Screen 的 name 用这个，不是 key（index.tsx 对应 'time' 这个 key，文件名是 'index'） */
  screenName: string;
  /** 这个功能在底栏时对应的顶层 tab 路由（expo-router 路径） */
  route: string;
  /** 从"其他"页点进来、且这个功能当前不在底栏时走的嵌套路由（栈在"其他"tab内部，返回会回到"其他"列表，底栏高亮不变） */
  otherRoute: string;
  /** 只有"其他"自己是 true——不可拖动、不可移除、永远在最右 */
  fixed: boolean;
}

export const FEATURES: Feature[] = [
  { key: 'time', label: '时间', icon: '🕐', screenName: 'index', route: '/', otherRoute: '/other/time', fixed: false },
  { key: 'todo', label: '事项', icon: '✅', screenName: 'todo', route: '/todo', otherRoute: '/other/todo', fixed: false },
  { key: 'checkin', label: '打卡', icon: '📌', screenName: 'checkin', route: '/checkin', otherRoute: '/other/checkin', fixed: false },
  { key: 'notes', label: '笔记', icon: '📁', screenName: 'notes', route: '/notes', otherRoute: '/other/notes', fixed: false },
  { key: 'chat', label: '灵', icon: '💜', screenName: 'chat', route: '/chat', otherRoute: '/other/chat', fixed: false },
  { key: 'record', label: '记录', icon: '📋', screenName: 'record', route: '/record', otherRoute: '/other/record', fixed: false },
  { key: 'data', label: '数据', icon: '📊', screenName: 'data', route: '/data', otherRoute: '/other/data', fixed: false },
  { key: 'schedule', label: '日程', icon: '🗓️', screenName: 'schedule', route: '/schedule', otherRoute: '/other/schedule', fixed: false },
  { key: 'other', label: '其他', icon: '⋯', screenName: 'other', route: '/other', otherRoute: '/other', fixed: true },
];

export const FEATURE_BY_KEY: Record<string, Feature> = Object.fromEntries(FEATURES.map((f) => [f.key, f]));

/** 默认展示在底栏的 3 个（key 必须跟上面注册表对得上） */
export const DEFAULT_LAYOUT: string[] = ['time', 'todo', 'chat'];

/** 除"其他"外，参与排布（可拖进/拖出底栏）的全部 key，固定的顺序用于兜底补位 */
export const ASSIGNABLE_KEYS: string[] = FEATURES.filter((f) => !f.fixed).map((f) => f.key);
