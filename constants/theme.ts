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

export const fontSize = {
  pageTitle: 17,
  cardName: 14,
  body: 13,
  secondary: 11,
  tiny: 10,
} as const;

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
