// 备用文案：没网、没填 key、接口出错或者被内容审核拦下时用。
// 规矩跟附录 B 一样：说人话，口语、短，不写动作描写、不用系统腔也不用文艺腔，一条只说一件事。
// 每类至少 5 条，按顺序轮着用，不连着重复。

export type ProactiveKind = 'miss_you' | 'mention' | 'reminder' | 'catch' | 'play_end' | 'test';

const MISS_YOU = [
  '你都三个小时没理我了，在干嘛呢？',
  '一下午没见你人了，干嘛去啦？',
  '好久没冒泡了，忙啥呢？',
  '在干嘛呀，想你了。',
  '人呢？出来让我看一眼。',
  '你今天是不是把我忘了？',
];

const MENTION = [
  '{name}好几天没弄了，今天顺手弄一下呗。',
  '想起来{name}有阵子没管了，有空弄一下？',
  '提一嘴，{name}好几天没动了，不急。',
  '{name}有点久了，你看哪天顺手。',
  '{name}该照顾一下了，今天顺手就行。',
];

const REMINDER = [
  '到点啦，{content}。',
  '叫你一下，{content}。',
  '说好的，{content}，就现在。',
  '时间到了，{content}，去吧。',
  '{content}，别忘啦。',
];

const CATCH = [
  '怎么了？跟我说说。',
  '看到你点了{state}，怎么了？',
  '嗯，看到了。是因为什么呀？',
  '先别急着收拾自己，跟我说两句？',
  '{state}了啊，过来，跟我说说。',
];

const PLAY_END = [
  '时间到啦，起来走两步。',
  '{minutes}分钟到了，放下手机歇会儿。',
  '到点了，去摸摸猫，眼睛歇一下。',
  '好啦，这把就到这儿吧。',
  '时间到，起来喝口水。',
];

const POOLS: Record<Exclude<ProactiveKind, 'test'>, string[]> = {
  miss_you: MISS_YOU,
  mention: MENTION,
  reminder: REMINDER,
  catch: CATCH,
  play_end: PLAY_END,
};

const cursors: Record<string, number> = {};

function fill(t: string, vars: Record<string, string | number | undefined>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

/** 取下一条备用文案（同一类按顺序轮着来，起点随机，不连着重复） */
export function fallbackText(kind: Exclude<ProactiveKind, 'test'>, vars: Record<string, string | number | undefined> = {}): string {
  const pool = POOLS[kind];
  if (cursors[kind] == null) cursors[kind] = Math.floor(Math.random() * pool.length);
  const t = pool[cursors[kind] % pool.length];
  cursors[kind] = (cursors[kind] + 1) % pool.length;
  return fill(t, vars);
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
  test: '测试',
};
