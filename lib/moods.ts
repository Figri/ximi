import type { StateWord } from './states';

// 随心记里的表情：点表情按钮弹出这 12 个。每个对应状态日志里的一个词（状态日志的词不变，还是那 9 个），
// 几个意思相近的归到同一个词：🥰 幸福 → 开心、😭 想哭 → 难过、😡 生气 → 烦躁。

export interface MoodFace {
  face: string;
  /** 弹窗里表情下面那两个字，也是只记表情时那一行写的字 */
  label: string;
  /** 记进状态日志的词 */
  state: StateWord;
}

export const MOOD_FACES: MoodFace[] = [
  { face: '😊', label: '开心', state: '开心' },
  { face: '🥰', label: '幸福', state: '开心' },
  { face: '😌', label: '平静', state: '平静' },
  { face: '😐', label: '一般', state: '一般' },
  { face: '😢', label: '难过', state: '难过' },
  { face: '😭', label: '想哭', state: '难过' },
  { face: '😤', label: '烦躁', state: '烦躁' },
  { face: '😡', label: '生气', state: '烦躁' },
  { face: '😰', label: '焦虑', state: '焦虑' },
  { face: '😩', label: '疲惫', state: '疲惫' },
  { face: '😑', label: '低动力', state: '低动力' },
  { face: '🌀', label: '内耗', state: '内耗' },
];

/** 随心记里记下的那一行：只有表情是「😢 难过」，表情 + 话是「😢 今天好累」 */
export function moodLine(mood: MoodFace, text: string): string {
  const t = text.trim();
  return `${mood.face} ${t || mood.label}`;
}

/** 状态日志那一行的「事件」、灵知道你说了什么：写了话就是这段话；只点了表情、而且字和词不一样（想哭 → 难过）就是那两个字 */
export function moodNote(mood: MoodFace, text: string): string | null {
  const t = text.trim();
  if (t) return t;
  return mood.label !== mood.state ? mood.label : null;
}
