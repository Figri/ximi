// 西米OS 设计规范

export const colors = {
  background: '#F6F4F8',
  card: '#FFFFFF',

  textPrimary: '#3D3554',
  textSecondary: '#6B6180',
  textMuted: '#A49BB8',

  blue: '#C2D9E8',
  blueLight: '#EAF2F8',
  blueDark: '#6A9DBF',

  pink: '#E8C5CE',
  pinkLight: '#F6ECF0',
  pinkDark: '#C48293',

  purple: '#C4B5D8',
  purpleLight: '#EDE8F4',
  purpleDark: '#8E73B3',

  green: '#8CC9A0',
  greenDark: '#5DA87A',
  yellow: '#E8D07A',
  yellowDark: '#C4A830',
  red: '#D98A8A',
  redDark: '#C05858',
} as const;

export const statusColor = {
  green: colors.green,
  yellow: colors.yellow,
  red: colors.red,
} as const;

export const statusColorDark = {
  green: colors.greenDark,
  yellow: colors.yellowDark,
  red: colors.redDark,
} as const;

// 字号：「其他 → 字号」里能调（标准 / 大 / 特大）。App 一打开、页面还没加载时按存的档位把 fontSize 整套放大
// （见 lib/uiSettings.ts 和根布局），所以改了要重启一下才生效。
// 时间格子、日期条、底栏、月历这些布局卡死的地方用 fixedFontSize，不跟着放大。
// 写死数字的字号 / 行高，想跟着放大的用 fs() / lh()。
const BASE_FONT = {
  pageTitle: 17,
  cardName: 14,
  body: 13,
  secondary: 11,
  tiny: 10,
  /** 随心记这种要读的一段段字 */
  reading: 15,
};

export type FontSizes = { [K in keyof typeof BASE_FONT]: number };

export const fixedFontSize: Readonly<FontSizes> = Object.freeze({ ...BASE_FONT });
export const fontSize: FontSizes = { ...BASE_FONT };

export const FONT_SCALES = [
  { key: 'standard', label: '标准', scale: 1 },
  { key: 'large', label: '大', scale: 1.15 },
  { key: 'xlarge', label: '特大', scale: 1.3 },
] as const;
export type FontScaleKey = (typeof FONT_SCALES)[number]['key'];

let currentScale = 1;

function scaled(n: number): number {
  return Math.round(n * currentScale * 2) / 2;
}

/** 启动时调一次（页面模块加载之前）：把 fontSize 整套按档位放大 */
export function applyFontScale(scale: number): void {
  currentScale = scale > 0 ? scale : 1;
  for (const k of Object.keys(BASE_FONT) as (keyof FontSizes)[]) fontSize[k] = scaled(BASE_FONT[k]);
}

export function currentFontScale(): number {
  return currentScale;
}

/** 写死的字号跟着档位放大 */
export function fs(n: number): number {
  return scaled(n);
}

/** 写死的行高跟着档位放大（字大了行高不跟着，安卓上字会被切掉） */
export function lh(n: number): number {
  return Math.round(n * currentScale);
}

export const radius = {
  card: 14,
  widget: 10,
  button: 16,
  avatar: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;
