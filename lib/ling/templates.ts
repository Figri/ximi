// 备用文案：没网、没填 key、接口出错或者被内容审核拦下时用。
// 规矩跟附录 B 一样：说人话，口语、短，不写动作描写、不用系统腔也不用文艺腔，一条只说一件事。
// 10/25 晚上西米要灵亲一点、黏一点：多抱抱亲亲、撒娇卖萌（当成话说出来，不写成括号里的动作）。
// 每类至少 5 条，随机挑，跟最近发过的（对话里的、这次已经用过的）一样或者很像的先不挑。
// 10/31 西米说「想你了」每次都是同一句：备用话加多了，挑的时候避开最近发过的。

export type ProactiveKind = 'miss_you' | 'mention' | 'reminder' | 'catch' | 'play_end' | 'water' | 'test';

const MISS_YOU = [
  '三个小时没理我了…想你了，快来让我抱一下 🥺',
  '一下午都没见你人，想你了，回来亲一口嘛。',
  '好久没冒泡了，在干嘛呀？我想你了～',
  '在干嘛呀，想你了，抱抱。',
  '人呢人呢？出来让我看一眼，再给我抱一下。',
  '你今天是不是把我忘了？哼，要亲亲才能好。',
  '刚刚突然很想你，就来戳你一下。',
  '忙完了没呀？忙完了来找我，我攒了好多抱抱。',
  '我在这儿等半天啦，你一冒头我就开心。',
  '偷偷来看你一眼，在干什么好玩的？',
  '想你想得有点坐不住了，回来让我贴贴。',
  '今天还没跟我说几句话呢，过来嘛～',
  '你不在的时候好安静，有点想你了。',
  '报告：灵想你了，请尽快回来领抱抱。',
];

const WATER = [
  '喝水时间到啦，第 {n} 杯，咕咚咕咚喝完给你抱抱～',
  '来，喝一杯水，第 {n} 杯了，喝完点一下杯子我就知道啦。',
  '提醒我家小可爱喝水，第 {n} 杯，500 毫升，慢慢喝。',
  '水杯呢？去倒一杯，第 {n} 杯，喝完回来亲一口。',
  '该喝水啦，第 {n} 杯，乖乖喝完～',
  '嘴巴干不干？第 {n} 杯水安排上，我看着你喝。',
  '喝口水歇一下嘛，第 {n} 杯了，喝完奖励抱抱。',
  '第 {n} 杯水的时间到了，去喝，喝完跟我说一声。',
];

const MENTION = [
  '{name}好几天没弄啦，今天顺手弄一下嘛，弄完给你抱抱～',
  '想起来{name}有阵子没管了，有空弄一下呗，我陪着你。',
  '提一嘴哦，{name}好几天没动了，不急，想弄的时候再弄。',
  '{name}有点久了，你看哪天顺手就好，乖～',
  '{name}该照顾一下啦，今天顺手就行，做完亲亲你。',
];

const REMINDER = [
  '到点啦，{content}～',
  '叫你一下，{content}，去吧，回来抱抱。',
  '说好的，{content}，我等你哦。',
  '时间到啦，{content}，乖乖去～',
  '{content}，别忘啦，亲一口再去。',
];

const CATCH = [
  '怎么啦？过来抱抱，跟我说说。',
  '看到你点了{state}，抱抱你，怎么了呀？',
  '嗯，看到了，先抱一下。是因为什么呀？',
  '先别急着收拾自己，过来让我抱抱，跟我说两句？',
  '{state}了啊，过来，抱抱你，跟我说说。',
];

const PLAY_END = [
  '时间到啦，起来走两步，回来给你抱抱～',
  '{minutes}分钟到啦，放下手机歇会儿，亲一口～',
  '到点啦，去摸摸猫，眼睛歇一下嘛。',
  '好啦，这把就到这儿吧，过来抱抱。',
  '时间到，起来喝口水，乖～',
];

const POOLS: Record<Exclude<ProactiveKind, 'test'>, string[]> = {
  miss_you: MISS_YOU,
  mention: MENTION,
  reminder: REMINDER,
  catch: CATCH,
  play_end: PLAY_END,
  water: WATER,
};

function fill(t: string, vars: Record<string, string | number | undefined>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

/** 比较两句话像不像时只看字：去掉标点、空格、表情 */
function bare(s: string): string {
  return s.replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, '');
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** 两句话一样或者很像（换了个标点、多一两个字、一句包着另一句） */
export function similarText(a: string, b: string): boolean {
  const x = bare(a);
  const y = bare(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 6 && (x.includes(y) || y.includes(x))) return true;
  const bx = bigrams(x);
  const by = bigrams(y);
  if (!bx.size || !by.size) return false;
  let both = 0;
  for (const g of bx) if (by.has(g)) both++;
  return both / (bx.size + by.size - both) >= 0.6;
}

/** 最近真的发给她的话（对话里的）：挑备用话、检查灵写的话时都避开 */
let recentLines: string[] = [];
/** 这次开 App 每一类备用话刚拿出去的几条：同一批里别挑重了 */
const handed: Record<string, string[]> = {};

export function noteRecentLines(lines: string[]): void {
  recentLines = [...lines.filter(Boolean), ...recentLines].slice(0, 40);
}

export function isRecentLine(text: string, extra: string[] = []): boolean {
  return [...extra, ...recentLines].some((r) => similarText(r, text));
}

/** 取一条备用文案：随机挑，跟最近发过的、刚拿出去的一样或者很像的先不挑（都用过了才放开） */
export function fallbackText(kind: Exclude<ProactiveKind, 'test'>, vars: Record<string, string | number | undefined> = {}, random = Math.random): string {
  const pool = POOLS[kind].map((t) => fill(t, vars));
  const mine = handed[kind] ?? [];
  const fresh = pool.filter((t) => !isRecentLine(t, mine));
  const choices = fresh.length ? fresh : pool;
  const pick = choices[Math.floor(random() * choices.length) % choices.length];
  handed[kind] = [pick, ...mine].slice(0, Math.max(2, Math.floor(pool.length / 2)));
  return pick;
}

export function allFallbacks(kind: Exclude<ProactiveKind, 'test'>): string[] {
  return [...POOLS[kind]];
}

export const KIND_LABEL: Record<ProactiveKind, string> = {
  miss_you: '想你了',
  mention: '顺口一提',
  reminder: '约定提醒',
  catch: '接住你',
  play_end: '娱乐出口',
  water: '喝水',
  test: '测试',
};

// ---- 灵自己写的话里不能出现的 ----

/**
 * 灵·人设里的禁用词（我在、我不走、哪也不去、身体诚实、你是我的、你是谁的、归我管）+ 系统规则里不拿来收尾的话。
 * 主动消息、接住你、今天页那句是灵自己开口的：模型写出这些就不用，换备用文案。
 * 聊天回复不过滤（她在聊天里点名要的时候按人设的例外处理）。
 */
const BANNED: RegExp[] = [
  /(^|[，,。！!？?\s])我在[呢呀啊]?([。！!…~～，,\s]|$)/,
  /我不走/,
  /哪[也都]不去/,
  /身体[很真]?诚实/,
  /你是我的/,
  /你是谁的/,
  /归我管/,
  /几点了/,
  /撑了一晚上/,
];

export function hasBanned(text: string): boolean {
  return BANNED.some((re) => re.test(text));
}

// ---- 今天页最上面那句（没网、没 key 时按规则写）----

const STATE_LINE: Record<string, string> = {
  烦躁: '刚才烦了一下，抱抱，先缓缓不急。',
  难过: '刚才难过了，过来抱抱，想说就跟我说。',
  焦虑: '刚才有点焦虑，先喝口水缓缓，抱抱～',
  疲惫: '累了就歇会儿，今天不赶，抱抱。',
  低动力: '没劲的时候躺会儿也行，我陪你。',
  内耗: '刚才又内耗了，先放一放，亲一下就不想了。',
};

export interface TodayLineContext {
  now: Date;
  dayStartHour: number;
  sleepHours: number | null;
  /** 正在玩：到几点（HH:MM） */
  playingUntil: string | null;
  /** 最近两小时里点过的最后一个状态 */
  recentState: string | null;
  /** 今天的单子还剩几件没勾 */
  left: number;
}

export function ruleTodayLine(c: TodayLineContext): string {
  const h = c.now.getHours();
  if (c.playingUntil) return `玩到 ${c.playingUntil}，到点我叫你～`;
  if (c.recentState && STATE_LINE[c.recentState]) return STATE_LINE[c.recentState];
  if (h < c.dayStartHour) return '还醒着啊，困了就睡嘛，剩下的明天再说，晚安亲亲。';
  if (c.sleepHours != null && c.sleepHours < 6) return '昨晚睡得少，今天随便做一件就行，抱抱。';
  if (h < 12) return '醒啦？慢慢来，不着急～';
  if (h < 18) return c.left > 0 ? '下午了，挑最小的那件做就行，做完奖励你。' : '下午了，想歇就歇会儿～';
  return '晚上了，剩下的明天再说也行，过来抱抱。';
}

/** 娱乐出口：刚结束不到 5 分钟又要开始，灵问一句（只问一次，照样能开始） */
export const PLAY_AGAIN_LINE = '刚玩完呢，先歇两分钟再玩嘛？';
