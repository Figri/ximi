// 今天页的卡片：顺序和显示隐藏她自己调（今天页右上角「调整」）。纯计算放这里（进了 npm test），存取在 todayLayout.ts。
// 翻到以前的日子：只看随心记、喝水、事项（那天的）；翻到以后的日子：只看事项。

export const TODAY_CARDS = [
  { key: 'ling', label: '灵的一句话', icon: '💜' },
  { key: 'fragments', label: '随心记', icon: '✍️' },
  { key: 'water', label: '喝水', icon: '💧' },
  { key: 'next', label: '项目的下一步', icon: '📌' },
  { key: 'agenda', label: '事项', icon: '✅' },
  { key: 'play', label: '娱乐出口', icon: '🎮' },
  { key: 'body', label: '身体', icon: '🌸' },
  { key: 'care', label: '该照顾的', icon: '🐱' },
] as const;

export type TodayCardKey = (typeof TODAY_CARDS)[number]['key'];

export interface TodayLayout {
  order: TodayCardKey[];
  hidden: TodayCardKey[];
}

const KEYS = TODAY_CARDS.map((c) => c.key) as TodayCardKey[];

export const DEFAULT_TODAY_LAYOUT: TodayLayout = { order: [...KEYS], hidden: [] };

function isKey(k: unknown): k is TodayCardKey {
  return typeof k === 'string' && (KEYS as string[]).includes(k);
}

/**
 * 存的东西不可信（旧版本、手改、以后加了新卡片）：不认识的丢掉、重复的去掉，
 * 存的里面没有的新卡片插回默认顺序里它前一张的后面（找不到就放最前）。
 */
export function normalizeLayout(raw: unknown): TodayLayout {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { order?: unknown; hidden?: unknown };
  const order: TodayCardKey[] = [];
  for (const k of Array.isArray(r.order) ? r.order : []) if (isKey(k) && !order.includes(k)) order.push(k);
  KEYS.forEach((k, i) => {
    if (order.includes(k)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const p = order.indexOf(KEYS[j]);
      if (p >= 0) {
        at = p + 1;
        break;
      }
    }
    order.splice(at, 0, k);
  });
  const hidden = (Array.isArray(r.hidden) ? r.hidden : []).filter(isKey).filter((k, i, a) => a.indexOf(k) === i);
  return { order, hidden };
}

export type DayKind = 'today' | 'past' | 'future';

const ON_PAST: TodayCardKey[] = ['fragments', 'water', 'agenda'];
const ON_FUTURE: TodayCardKey[] = ['agenda'];

/** 这一天要画哪些卡片、什么顺序（藏起来的不画） */
export function cardsForDay(layout: TodayLayout, kind: DayKind): TodayCardKey[] {
  const allowed = kind === 'today' ? null : kind === 'past' ? ON_PAST : ON_FUTURE;
  return layout.order.filter((k) => !layout.hidden.includes(k) && (!allowed || allowed.includes(k)));
}

/** 'YYYY-MM-DD' 比大小就是比日子 */
export function dayKindOf(dayKey: string, todayKey: string): DayKind {
  return dayKey === todayKey ? 'today' : dayKey < todayKey ? 'past' : 'future';
}
