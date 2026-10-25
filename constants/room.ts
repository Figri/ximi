import { colors } from './theme';

// 「灵」的窗口、灵的设定、密码盘用的颜色。2.0 一开始是深色（像进了另一个房间），
// 西米 10/25 说默认用白天模式、跟整体协调，所以现在跟其他页面同一套浅色，只是灵的气泡和强调色带点紫。
export const room = {
  /** 页面底色 */
  bg: colors.background,
  /** 卡片、弹层、输入框 */
  surface: colors.card,
  /** 白卡片里再嵌一层的底色（输入框、分段选择、示范句子） */
  inset: '#F1ECF7',
  ink: colors.textPrimary,
  ink2: colors.textSecondary,
  ink3: colors.textMuted,
  accent: colors.purpleDark,
  /** 我说的话的气泡 */
  me: '#E6DCF3',
  /** 灵说的话的气泡 */
  ling: colors.card,
  line: '#E4DEEC',
  danger: colors.redDark,
} as const;
