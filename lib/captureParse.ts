// 右下角 ＋ 的一句话怎么归类（需求文档 §8.2 C-2、C-4）：纯规则、离线、不碰存储，方便单独测。
// 顺序：时间段 → 例行（每天/每周X/每隔N天/每月N号）→ 想法池 → 状态 → 带日期或时间的事项 → 像要做的事 → 碎片。
// 判断不了的一律存成碎片，永远不丢。

export type CaptureKind = 'timeblock' | 'todo' | 'routine' | 'state' | 'idea' | 'fragment';

export type RepeatRule =
  | { type: 'daily' }
  | { type: 'weekly'; days: number[] } // 0=周日…6=周六，跟事项模块一致
  | { type: 'monthly'; day: number } // 0 = 每月最后一天
  | { type: 'interval'; days: number };

export interface ParsedCapture {
  kind: CaptureKind;
  /** 原话 */
  raw: string;
  /** 去掉日期、时间、重复这些词以后剩下的内容 */
  text: string;
  start?: Date;
  end?: Date;
  /** 事项 / 例行的日期（YYYY-MM-DD） */
  date?: string;
  /** 'HH:MM' */
  time?: string | null;
  repeat?: RepeatRule;
  state?: string;
  /** 提到了哪些猫（名字） */
  cats: string[];
  /** 时间块：从分类名里认出来的分类 */
  categoryName?: string | null;
  /** 碎片：说的是过去某个钟点的事（12:40 麻辣烫） */
  at?: Date;
}

export interface ParseContext {
  now: Date;
  /** 「今天」从几点算起 */
  dayStartHour: number;
  catNames: string[];
  categoryNames: string[];
  stateWords: readonly string[];
}

const CN_NUM: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const WEEKDAY_CHAR: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

/** 状态词的口语说法：只认很短的一句，比如「好累」「有点焦虑」 */
const STATE_SYNONYMS: Record<string, string> = {
  累: '疲惫',
  困: '疲惫',
  好累: '疲惫',
  烦: '烦躁',
  烦死了: '烦躁',
  难受: '难过',
  伤心: '难过',
  想哭: '难过',
  慌: '焦虑',
  紧张: '焦虑',
  没劲: '低动力',
  不想动: '低动力',
  高兴: '开心',
  还行: '平静',
};

const TODO_VERBS = /^(买|交|取|寄|还|洗|换|约|订|预约|打电话|给|带|去|做|写|修|收|拿|退|充|缴|续|改|回|发|问|找|搬|扔|倒|铲|喂|剪|整理|收拾|准备|记得|别忘了?)/;
const IDEA_PREFIX = /^(想做|想学|想搞|想写|想开|想拍|想画|想试试?|有个想法[:：，,]?|有个点子[:：，,]?|点子[:：]|想法[:：]|灵感[:：]?|idea[:：]?)/i;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function cnToNumber(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  if (s === '十') return 10;
  if (s.length === 2 && s[0] === '十') return 10 + (CN_NUM[s[1]] ?? NaN);
  if (s.length === 2 && s[1] === '十') return (CN_NUM[s[0]] ?? NaN) * 10;
  if (s.length === 3 && s[1] === '十') return (CN_NUM[s[0]] ?? NaN) * 10 + (CN_NUM[s[2]] ?? NaN);
  if (s.length === 1 && s in CN_NUM) return CN_NUM[s];
  return null;
}

function normalize(input: string): string {
  return input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ':')
    .replace(/[～〜]/g, '~')
    .replace(/[—–－]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function clean(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/^[\s,，。、:：;；\-~]+|[\s,，、:：;；\-~]+$/g, '')
    .trim();
}

/** 「今天」这一天的 0 点（凌晨还没到换日点时算前一天） */
function lingDay(now: Date, dayStartHour: number): Date {
  const d = new Date(now.getTime() - dayStartHour * 3600 * 1000);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * 上午/下午/晚上 + 几点 → 24 小时制。
 * 「3点开会」这种没说上下午、又是 1–6 点的，按下午算（凌晨几点一般会说凌晨）；写成 14:00 / 01:00 的按字面。
 */
function toHour(prefix: string | undefined, h: number, guessPm = true): number {
  if (prefix && /下午|晚上|傍晚|今晚|明晚/.test(prefix) && h < 12) return h + 12;
  if (prefix && /中午/.test(prefix) && h < 6) return h + 12;
  if (prefix && /凌晨|早上|早晨|上午|今早|明早/.test(prefix)) return h === 12 ? 0 : h;
  if (!prefix && guessPm && h >= 1 && h <= 6) return h + 12;
  return h;
}

const PREFIX = '(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|今晚|明晚|今早|明早)?';
const HOUR_TOKEN = '(\\d{1,2}|[零一二两三四五六七八九十]{1,3})';

interface TimeHit {
  hhmm: string;
  index: number;
  length: number;
}

function findTime(s: string): TimeHit | null {
  const re1 = new RegExp(`${PREFIX}\\s*(\\d{1,2}):(\\d{2})`);
  const m1 = s.match(re1);
  if (m1 && m1.index != null) {
    const h = toHour(m1[1], Number(m1[2]), false);
    const min = Number(m1[3]);
    if (h <= 23 && min <= 59) return { hhmm: `${pad(h)}:${pad(min)}`, index: m1.index, length: m1[0].length };
  }
  const re2 = new RegExp(`${PREFIX}\\s*${HOUR_TOKEN}\\s*点\\s*(半|一刻|三刻|(\\d{1,2})分?)?`);
  const m2 = s.match(re2);
  if (m2 && m2.index != null) {
    const base = cnToNumber(m2[2]);
    if (base != null && base <= 24) {
      const h = toHour(m2[1], base) % 24;
      let min = 0;
      if (m2[3] === '半') min = 30;
      else if (m2[3] === '一刻') min = 15;
      else if (m2[3] === '三刻') min = 45;
      else if (m2[4]) min = Number(m2[4]);
      if (min <= 59) return { hhmm: `${pad(h)}:${pad(min)}`, index: m2.index, length: m2[0].length };
    }
  }
  return null;
}

function cut(s: string, index: number, length: number): string {
  return `${s.slice(0, index)} ${s.slice(index + length)}`;
}

// ---- 时间段：14:00-16:00 写简历 / 下午2点到4点 开会 ----

function parseRange(s: string, ctx: ParseContext): { start: Date; end: Date; rest: string } | null {
  const sep = '\\s*(?:-|~|到|至)\\s*';
  const re1 = new RegExp(`${PREFIX}\\s*(\\d{1,2}):(\\d{2})${sep}${PREFIX}\\s*(\\d{1,2}):(\\d{2})`);
  const re2 = new RegExp(`${PREFIX}\\s*${HOUR_TOKEN}\\s*(?:点(半)?)?${sep}${PREFIX}\\s*${HOUR_TOKEN}\\s*点(半)?`);
  let sh: number, sm: number, eh: number, em: number, idx: number, len: number;
  const m1 = s.match(re1);
  const m2 = m1 ? null : s.match(re2);
  if (m1 && m1.index != null) {
    sh = toHour(m1[1], Number(m1[2]), false);
    sm = Number(m1[3]);
    eh = toHour(m1[4] ?? m1[1], Number(m1[5]), false);
    em = Number(m1[6]);
    idx = m1.index;
    len = m1[0].length;
  } else if (m2 && m2.index != null) {
    const a = cnToNumber(m2[2]);
    const b = cnToNumber(m2[5]);
    if (a == null || b == null) return null;
    sh = toHour(m2[1], a);
    sm = m2[3] ? 30 : 0;
    // 后半段没写上下午：跟前半段走（下午2点到4点）；比开始还早就试试加 12（11点到1点 = 11–13 点），不行就是过了午夜
    eh = m2[4] ? toHour(m2[4], b) : m2[1] ? toHour(m2[1], b) : b;
    if (!m2[4] && eh < sh && eh + 12 > sh && eh + 12 < 24) eh += 12;
    em = m2[6] ? 30 : 0;
    idx = m2.index;
    len = m2[0].length;
  } else {
    return null;
  }
  if (sh > 23 || eh > 24 || sm > 59 || em > 59) return null;
  let base = lingDay(ctx.now, ctx.dayStartHour);
  let rest = cut(s, idx, len);
  if (/昨天/.test(rest)) {
    base = addDays(base, -1);
    rest = rest.replace('昨天', ' ');
  } else if (/明天/.test(rest)) {
    base = addDays(base, 1);
    rest = rest.replace('明天', ' ');
  } else {
    rest = rest.replace(/今天/, ' ');
  }
  const at = (h: number, m: number) => {
    // 换日点之前的钟点（比如凌晨 1 点）属于这一天的尾巴，在日历上是第二天
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (h < ctx.dayStartHour ? 1 : 0), h, m);
    return d;
  };
  const start = at(sh, sm);
  let end = at(eh % 24, em);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 3600 * 1000);
  if (end.getTime() - start.getTime() > 16 * 3600 * 1000) return null;
  return { start, end, rest };
}

// ---- 重复 ----

function parseRepeat(s: string): { repeat: RepeatRule; rest: string } | null {
  let m = s.match(/每隔?\s*(\d+|[两二三四五六七八九十]{1,3})\s*天/);
  if (m && m.index != null) {
    const n = cnToNumber(m[1]);
    if (n && n >= 1 && n <= 90) return { repeat: n === 1 ? { type: 'daily' } : { type: 'interval', days: n }, rest: cut(s, m.index, m[0].length) };
  }
  m = s.match(/每(?:天|日)/);
  if (m && m.index != null) return { repeat: { type: 'daily' }, rest: cut(s, m.index, m[0].length) };
  m = s.match(/每个?(?:周|星期|礼拜)\s*([一二三四五六日天](?:\s*[、,，和与及]?\s*[一二三四五六日天])*)/);
  if (m && m.index != null) {
    const days = Array.from(new Set(m[1].replace(/[\s、,，和与及]/g, '').split('').map((c) => WEEKDAY_CHAR[c]))).filter((d) => d != null);
    if (days.length) return { repeat: { type: 'weekly', days: days.sort() }, rest: cut(s, m.index, m[0].length) };
  }
  m = s.match(/每个?月\s*(?:的)?\s*(最后一天|(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[号日])/);
  if (m && m.index != null) {
    const day = m[1] === '最后一天' ? 0 : cnToNumber(m[2]);
    if (day != null && day >= 0 && day <= 31) return { repeat: { type: 'monthly', day }, rest: cut(s, m.index, m[0].length) };
  }
  return null;
}

// ---- 日期 ----

function parseDate(s: string, ctx: ParseContext): { date: Date; rest: string; relative?: number } | null {
  const today = lingDay(ctx.now, ctx.dayStartHour);
  const rel: [RegExp, number][] = [
    [/大后天/, 3],
    [/后天/, 2],
    [/明天|明早|明晚/, 1],
    [/今天|今晚|今早/, 0],
  ];
  for (const [re, n] of rel) {
    const m = s.match(re);
    if (m && m.index != null) {
      // 今晚/明早 这种整个词留给 findTime 当上下午用（今晚8点 = 20:00）
      const keep = /早|晚/.test(m[0]) ? m[0] : '';
      return { date: addDays(today, n), rest: `${s.slice(0, m.index)} ${keep}${s.slice(m.index + m[0].length)}`, relative: n };
    }
  }
  let m = s.match(/(下下|下个?|这个?|本)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/);
  if (m && m.index != null) {
    const target = WEEKDAY_CHAR[m[2]];
    const mondayOffset = (today.getDay() + 6) % 7; // 今天离这周一几天
    const thisMonday = addDays(today, -mondayOffset);
    const targetOffset = (target + 6) % 7; // 周一=0 … 周日=6
    let date: Date;
    if (m[1] && m[1].startsWith('下下')) date = addDays(thisMonday, 14 + targetOffset);
    else if (m[1] && m[1].startsWith('下')) date = addDays(thisMonday, 7 + targetOffset);
    else if (m[1]) date = addDays(thisMonday, targetOffset);
    else {
      // 只说「周三」：今天或者之后最近的那个周三
      const diff = (target - today.getDay() + 7) % 7;
      date = addDays(today, diff);
    }
    return { date, rest: cut(s, m.index, m[0].length) };
  }
  m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
  if (!m) m = s.match(/(?<![\d:])(\d{1,2})\/(\d{1,2})(?![\d:])/);
  if (m && m.index != null) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let date = new Date(today.getFullYear(), month - 1, day);
      if (date.getTime() < addDays(today, -60).getTime()) date = new Date(today.getFullYear() + 1, month - 1, day);
      return { date, rest: cut(s, m.index, m[0].length) };
    }
  }
  m = s.match(/(?<![\d月/])(\d{1,2})\s*号/);
  if (m && m.index != null) {
    const day = Number(m[1]);
    if (day >= 1 && day <= 31) {
      let date = new Date(today.getFullYear(), today.getMonth(), day);
      if (date.getTime() < today.getTime()) date = new Date(today.getFullYear(), today.getMonth() + 1, day);
      return { date, rest: cut(s, m.index, m[0].length) };
    }
  }
  return null;
}

function parseState(s: string, ctx: ParseContext): string | null {
  const t = s.replace(/[。！!～~…,.，\s]/g, '');
  if (!t || t.length > 8) return null;
  const core = t.replace(/^(我|今天|现在|有点儿?|有些|好|很|太|超|特别|真的?|巨|蛮|挺)+/, '').replace(/(了|啊|呀|哦|噢|死了|极了|得很)+$/, '');
  if (ctx.stateWords.includes(core)) return core;
  if (STATE_SYNONYMS[core]) return STATE_SYNONYMS[core];
  if (STATE_SYNONYMS[t]) return STATE_SYNONYMS[t];
  return null;
}

/** 猫的名字可能带小名：「兔狲（兔轩）」写「兔狲」或「兔轩」都认 */
function catAliases(name: string): string[] {
  const out = [name];
  const m = name.match(/^(.+?)[（(](.+?)[）)]\s*$/);
  if (m) out.push(m[1].trim(), ...m[2].split(/[、,，/]/).map((x) => x.trim()));
  return out.filter((x) => x.length >= 2 || x === name);
}

export function parseCapture(input: string, ctx: ParseContext): ParsedCapture {
  const raw = input.trim();
  const s = normalize(raw);
  const cats = ctx.catNames.filter((n) => n && catAliases(n).some((a) => s.includes(a)));
  const base: ParsedCapture = { kind: 'fragment', raw, text: raw, cats };
  if (!s) return base;

  const range = parseRange(s, ctx);
  if (range) {
    const rest = clean(range.rest);
    const categoryName = ctx.categoryNames.filter((n) => n && rest.includes(n)).sort((a, b) => b.length - a.length)[0] ?? null;
    // 「14:00-16:00 工作 写简历」：分类名拿去当分类，剩下的当备注；只写了分类名就不留备注
    const withoutCat = categoryName ? clean(rest.replace(categoryName, ' ')) : rest;
    const text = categoryName ? withoutCat : rest || raw;
    return { ...base, kind: 'timeblock', text, start: range.start, end: range.end, categoryName };
  }

  const rep = parseRepeat(s);
  if (rep) {
    const t = findTime(rep.rest);
    const rest = t ? cut(rep.rest, t.index, t.length) : rep.rest;
    return { ...base, kind: 'routine', repeat: rep.repeat, time: t?.hhmm ?? null, text: clean(rest) || raw, date: dateKeyOf(lingDay(ctx.now, ctx.dayStartHour)) };
  }

  if (IDEA_PREFIX.test(s)) {
    const text = clean(s.replace(/^(有个想法|有个点子|点子|想法|灵感|idea)[:：，,]?/i, '')) || raw;
    return { ...base, kind: 'idea', text };
  }

  const state = parseState(s, ctx);
  if (state) return { ...base, kind: 'state', state, text: raw };

  const dated = parseDate(s, ctx);
  const restAfterDate = dated ? dated.rest : s;
  const t = findTime(restAfterDate);
  const rest = clean(t ? cut(restAfterDate, t.index, t.length) : restAfterDate.replace(/^\s*(今晚|今早)/, ''));
  const date = dated?.date ?? lingDay(ctx.now, ctx.dayStartHour);
  const isToday = dateKeyOf(date) === dateKeyOf(lingDay(ctx.now, ctx.dayStartHour));
  const looksTodo = TODO_VERBS.test(rest) || TODO_VERBS.test(s);
  if (t && isToday) {
    const [hh, mm] = t.hhmm.split(':').map(Number);
    const at = new Date(date.getFullYear(), date.getMonth(), date.getDate() + (hh < ctx.dayStartHour ? 1 : 0), hh, mm);
    // 「12:40 麻辣烫」：钟点已经过了、又不像要去做的事 → 是在记一笔，存成那个时间的碎片
    if (at.getTime() < ctx.now.getTime() - 5 * 60000 && !looksTodo) return { ...base, kind: 'fragment', text: rest || raw, at };
  }
  // 只说了「今天」、没有钟点、也不像要去做的事（今天开会被说了好焦虑）→ 不是事项
  if ((dated && !(isToday && !t && !looksTodo)) || t) {
    return { ...base, kind: 'todo', date: dateKeyOf(date), time: t?.hhmm ?? null, text: rest || raw };
  }

  if (TODO_VERBS.test(s) && s.length <= 30) {
    return { ...base, kind: 'todo', date: dateKeyOf(lingDay(ctx.now, ctx.dayStartHour)), time: null, text: clean(s) };
  }

  return base;
}

const WEEK_LABEL = ['日', '一', '二', '三', '四', '五', '六'];

/** 结果小标签上那句：「事项 · 周三 15:00」 */
export function describeParsed(p: ParsedCapture, now: Date, dayStartHour: number): string {
  const today = dateKeyOf(lingDay(now, dayStartHour));
  const tomorrow = dateKeyOf(addDays(lingDay(now, dayStartHour), 1));
  const dayWord = (key?: string) => {
    if (!key) return '';
    if (key === today) return '今天';
    if (key === tomorrow) return '明天';
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const diff = Math.round((dt.getTime() - lingDay(now, dayStartHour).getTime()) / 86400000);
    if (diff > 0 && diff < 7) return `周${WEEK_LABEL[dt.getDay()]}`;
    return `${m}/${d}`;
  };
  const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  switch (p.kind) {
    case 'timeblock':
      return `时间块 · ${hm(p.start!)}–${hm(p.end!)}${p.categoryName ? ` · ${p.categoryName}` : ''}`;
    case 'todo':
      return `事项 · ${dayWord(p.date)}${p.time ? ` ${p.time}` : ''}${p.cats.length ? ` · ${p.cats.join('、')}` : ''}`;
    case 'routine': {
      const r = p.repeat!;
      const what =
        r.type === 'daily'
          ? '每天'
          : r.type === 'weekly'
            ? `每周${[1, 2, 3, 4, 5, 6, 0].filter((d) => r.days.includes(d)).map((d) => WEEK_LABEL[d]).join('')}`
            : r.type === 'monthly'
              ? r.day === 0
                ? '每月最后一天'
                : `每月 ${r.day} 号`
              : `每 ${r.days} 天`;
      return `例行 · ${what}${p.time ? ` ${p.time}` : ''}`;
    }
    case 'state':
      return `状态 · ${p.state}`;
    case 'idea':
      return '想法池（Notion）';
    default:
      return p.at ? `碎片 · ${hm(p.at)}` : '碎片';
  }
}
