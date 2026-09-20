import type { TimelineCategory } from '../../types';

export type SidebarKey =
  | '今日'
  | '身体'
  | '睡眠'
  | '饮食'
  | '情绪'
  | '烦恼'
  | '计划'
  | '项目'
  | '收藏'
  | '梦'
  | '色色'
  | '日记';

export const SIDEBAR_ITEMS: { key: SidebarKey; emoji: string }[] = [
  { key: '今日', emoji: '📅' },
  { key: '身体', emoji: '🫀' },
  { key: '睡眠', emoji: '😴' },
  { key: '饮食', emoji: '🍽' },
  { key: '情绪', emoji: '💭' },
  { key: '烦恼', emoji: '😮‍💨' },
  { key: '计划', emoji: '📋' },
  { key: '项目', emoji: '🚀' },
  { key: '收藏', emoji: '⭐' },
  { key: '梦', emoji: '🌙' },
  { key: '色色', emoji: '💗' },
  { key: '日记', emoji: '📓' },
];

/** 除了"今日"/"烦恼"/"收藏"这几个特殊页面，其它都是某个 timeline 分类的跨天列表 */
export const SIDEBAR_TO_TIMELINE_CATEGORY: Partial<Record<SidebarKey, TimelineCategory>> = {
  身体: 'body',
  睡眠: 'sleep',
  饮食: 'eat',
  情绪: 'emotion',
  计划: 'plan',
  梦: 'dream',
  色色: 'intimate',
  日记: 'diary',
};

export const TIMELINE_CATEGORY_OPTIONS: { category: TimelineCategory; label: string; emoji: string }[] = [
  { category: 'body', label: '身体', emoji: '🫀' },
  { category: 'sleep', label: '睡眠', emoji: '😴' },
  { category: 'eat', label: '饮食', emoji: '🍽' },
  { category: 'emotion', label: '情绪', emoji: '💭' },
  { category: 'plan', label: '计划', emoji: '📋' },
  { category: 'dream', label: '梦', emoji: '🌙' },
  { category: 'intimate', label: '色色', emoji: '💗' },
  { category: 'diary', label: '日记', emoji: '📓' },
  { category: 'work', label: '工作', emoji: '💻' },
  { category: 'play', label: '玩', emoji: '🎮' },
  { category: 'cat', label: '猫', emoji: '🐱' },
  { category: 'exercise', label: '运动', emoji: '💪' },
  { category: 'other', label: '其他', emoji: '📝' },
];
