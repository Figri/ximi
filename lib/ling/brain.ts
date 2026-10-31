import { callModel, modelLabel, parseActions, type ModelMessage } from '../ai';
import { getApiKey } from '../aiSettings';
import type { AIAction } from '../../types';
import { buildLingSystemPrompt } from './prompt';
import { buildTodayData, formatLocalMemory, loadLocalMemory, yesterdaySnippet } from './context';
import { historyForModel, loadAllMessages, recentFeedback, type LingMessage } from './thread';
import { fallbackText, hasBanned, isRecentLine, KIND_LABEL, similarText, type ProactiveKind } from './templates';
import { loadLingSettings, useLingSettings } from './settings';

// 灵的大脑：聊天回复、点状态时接住你、提前写主动消息、设定页的「让灵试一句」。
// 模型调用失败（没网、没 key、被审核拦）时，主动消息和接住你退回备用文案；聊天把错误告诉她。

export async function currentBrain() {
  if (!useLingSettings.getState().loaded) await useLingSettings.getState().load();
  const model = useLingSettings.getState().model;
  const apiKey = await getApiKey(model).catch(() => null);
  return { model, apiKey };
}

/** 回复按空行拆成 1–3 个气泡，多出来的并进最后一个 */
export function splitBubbles(text: string): string[] {
  const parts = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 3) return parts.length ? parts : [text.trim()].filter(Boolean);
  return [parts[0], parts[1], parts.slice(2).join('\n')];
}

/** 模型要求：合并连续同角色的消息；第一条不能是灵说的（有的接口不接受） */
function normalizeHistory(history: ModelMessage[]): ModelMessage[] {
  const merged: ModelMessage[] = [];
  for (const m of history) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n${m.content}`;
    else merged.push({ ...m });
  }
  if (merged.length && merged[0].role === 'assistant') merged.unshift({ role: 'user', content: '（她打开了 App）' });
  return merged;
}

async function systemPrompt(messages: LingMessage[], extra: { inOsOverride?: string; omitReplyFormat?: boolean; localMemory?: string } = {}) {
  const settings = await loadLingSettings();
  return buildLingSystemPrompt({
    todayData: await buildTodayData(),
    yesterday: yesterdaySnippet(messages, new Date(), settings.dayStartHour),
    feedback: recentFeedback(messages),
    ...extra,
    localMemory: extra.localMemory ?? (await loadLocalMemory()),
  });
}

/** 「让灵一直记住的事」页的预览：灵现在开口时真正读到的整段提示词（记忆那段用页面上还没存的草稿） */
export async function previewSystemPrompt(memoryDraft: string): Promise<string> {
  return systemPrompt(await loadAllMessages(), { localMemory: formatLocalMemory(memoryDraft.trim()) });
}

export interface LingReply {
  bubbles: string[];
  actions: AIAction[];
  suggest: boolean;
}

export class NoKeyError extends Error {}

export async function replyTo(messages: LingMessage[]): Promise<LingReply> {
  const { model, apiKey } = await currentBrain();
  if (!apiKey) throw new NoKeyError(`还没填 ${modelLabel(model)} 的 key：点右上角「设定」→ 大脑，填好就能聊了`);
  const system = await systemPrompt(messages);
  const history = normalizeHistory(historyForModel(messages));
  const raw = await callModel(model, history, system, apiKey, 700);
  const { text, actions, extra } = parseActions(raw);
  const bubbles = splitBubbles(text);
  if (!bubbles.length) throw new Error('灵这次没说出话来，再发一次试试');
  return { bubbles, actions, suggest: extra.suggest === true };
}

/** 从模型输出里抠出 JSON 对象（带不带 ```json 都行） */
export function extractJson(raw: string): any | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

function cleanLine(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.replace(/^["“”'\s]+|["“”'\s]+$/g, '').trim();
  if (!t || t.length > 80 || hasBanned(t)) return null;
  return t;
}

// ---- 点状态时接住你 ----

export async function catchState(state: string, note: string | null, messages: LingMessage[]): Promise<{ text: string; fallback: boolean }> {
  const fb = () => ({ text: fallbackText('catch', { state }), fallback: true });
  try {
    const { model, apiKey } = await currentBrain();
    if (!apiKey) return fb();
    const system = await systemPrompt(messages, { omitReplyFormat: true });
    const history = normalizeHistory([
      ...historyForModel(messages, 12),
      { role: 'user', content: `（她刚在 App 里点了状态「${state}」${note ? `，补了一句：${note}` : ''}。按「接住你」回她，一两句，口语，亲一点、可以抱抱她，不分析。只输出要发的话。）` },
    ]);
    const raw = await callModel(model, history, system, apiKey, 200);
    const text = parseActions(raw).text.split(/\n\s*\n/)[0]?.trim();
    return text && !hasBanned(text) ? { text, fallback: false } : fb();
  } catch {
    return fb();
  }
}

// ---- 提前写主动消息 ----

export interface DraftRequest {
  missYou: number;
  mention: { name: string; timeLeft: string } | null;
  /** waterCup：喝水提醒是第几杯（备用话用喝水那一组） */
  reminders: { id: string; content: string; at: string; waterCup?: number }[];
}

export interface Drafts {
  missYou: string[];
  mention: string | null;
  reminders: Record<string, string>;
  createdAt: string;
  source: 'model' | 'fallback';
}

export function fallbackDrafts(req: DraftRequest): Drafts {
  return {
    missYou: Array.from({ length: req.missYou }, () => fallbackText('miss_you')),
    mention: req.mention ? fallbackText('mention', { name: req.mention.name }) : null,
    reminders: Object.fromEntries(
      req.reminders.map((r) => [r.id, r.waterCup ? fallbackText('water', { n: r.waterCup }) : fallbackText('reminder', { content: r.content })])
    ),
    createdAt: new Date().toISOString(),
    source: 'fallback',
  };
}

/** 提示词里「例：「……」」那几句示范：模型爱照抄，写出来跟示范一样的不用 */
export function exampleLines(system: string): string[] {
  return Array.from(system.matchAll(/例：「([^」]+)」/g)).map((m) => m[1]);
}

/**
 * recent：最近已经发给她的主动消息。告诉灵别重复，写出来还是跟它们（或者提示词里的示范、或者同一批里另一条）
 * 一样、很像的，那一条换成备用话。
 */
export async function writeDrafts(req: DraftRequest, messages: LingMessage[], recent: string[] = []): Promise<Drafts> {
  const base = fallbackDrafts(req);
  try {
    const { model, apiKey } = await currentBrain();
    if (!apiKey) return base;
    const system = await systemPrompt(messages, { omitReplyFormat: true });
    const avoid = [...recent, ...exampleLines(system)];
    const fresh = (t: string | null, taken: string[]): t is string => !!t && !isRecentLine(t, avoid) && !taken.some((x) => similarText(x, t));
    const asks: string[] = [];
    if (req.missYou > 0) asks.push(`"miss_you": ${req.missYou} 条「想你了」，她好几个小时没打开 App 时发，能接上最近聊的就接上，几条不能一样`);
    if (req.mention) asks.push(`"mention": 1 条「顺口一提」，说的是「${req.mention.name}」（${req.mention.timeLeft}），口气轻，做不做都行`);
    if (req.reminders.length) {
      asks.push(
        `"reminders": 对象，key 是下面的 id，值是到点时发给她的话，说清楚是什么事：\n${req.reminders
          .map((r) => `  ${r.id}：${r.at} ${r.content}`)
          .join('\n')}`
      );
    }
    if (!asks.length) return base;
    const said = recent.length ? `\n最近已经发过这些，这次换个说法，别重复、也别只是换几个字：\n${recent.slice(0, 10).map((t) => `- ${t}`).join('\n')}` : '';
    const user = `她可能会离开 App 一阵子。提前写好下面这些到时候发给她的微信消息，每条一两句，说人话，亲一点、黏一点（可以抱抱亲亲、撒个娇）。规则里的「例：」只是告诉你口气，不许照抄例子。现在是 ${new Date().getHours()} 点。\n${asks.join('\n')}${said}\n只输出一个 JSON 对象，不要别的字。`;
    const raw = await callModel(model, normalizeHistory([...historyForModel(messages, 12), { role: 'user', content: user }]), system, apiKey, 600);
    const json = extractJson(raw);
    if (!json) return base;
    const written = Array.isArray(json.miss_you) ? (json.miss_you.map(cleanLine) as (string | null)[]) : [];
    const missYou: string[] = [];
    for (let i = 0; i < base.missYou.length; i++) {
      const t = written[i] ?? null;
      missYou.push(fresh(t, missYou) ? t : fallbackText('miss_you'));
    }
    const reminders: Record<string, string> = { ...base.reminders };
    if (json.reminders && typeof json.reminders === 'object') {
      for (const r of req.reminders) {
        const t = cleanLine(json.reminders[r.id]);
        if (fresh(t, Object.values(reminders).filter((x) => x !== reminders[r.id]))) reminders[r.id] = t;
      }
    }
    const mention = req.mention ? cleanLine(json.mention) : null;
    return {
      missYou,
      mention: req.mention ? (fresh(mention, []) ? mention : base.mention) : null,
      reminders,
      createdAt: new Date().toISOString(),
      source: 'model',
    };
  } catch {
    return base;
  }
}

// ---- 设定页：让灵试一句 ----

export async function trySamples(kind: Exclude<ProactiveKind, 'test' | 'play_end'>, inOsDraft: string, messages: LingMessage[]): Promise<string[]> {
  const { model, apiKey } = await currentBrain();
  if (!apiKey) throw new NoKeyError(`还没填 ${modelLabel(model)} 的 key`);
  const system = await systemPrompt(messages, { inOsOverride: inOsDraft, omitReplyFormat: true });
  const scene: Record<string, string> = {
    miss_you: '她三个多小时没打开 App 了，发一条「想你了」',
    mention: '「猫砂盆A」好几天没换新砂了，发一条「顺口一提」',
    reminder: '她说好 23:00 断电，现在到点了，发一条「约定提醒」',
    catch: '她刚点了状态「焦虑」，发一条「接住你」',
  };
  const user = `${scene[kind]}。写 3 条不同的，每条一两句。只输出 JSON：{"samples": ["...", "...", "..."]}`;
  const raw = await callModel(model, [{ role: 'user', content: user }], system, apiKey, 400);
  const json = extractJson(raw);
  const list = Array.isArray(json?.samples) ? json.samples.map(cleanLine).filter(Boolean) : [];
  if (!list.length) throw new Error(`这次没写出「${KIND_LABEL[kind]}」的示范，再试一次`);
  return list.slice(0, 3) as string[];
}

// ---- 今天页最上面那句 ----

/** 打开今天页时灵写一句（一句、短、不提问、不催）；写不出来返回 null，页面就用规则那句 */
export async function writeTodayLine(messages: LingMessage[], hint: string): Promise<string | null> {
  try {
    const { model, apiKey } = await currentBrain();
    if (!apiKey) return null;
    const system = await systemPrompt(messages, { omitReplyFormat: true });
    const user = `（她打开了 App 的今天页。写一句放在页面最上面的话：一句，不超过 25 个字，像微信里随口说的，亲一点、可以撒个娇；不用问句，不催，不列计划，不提几点了。能接上最近聊的或今天的情况就接上。参考：${hint}。只输出这句话。）`;
    const raw = await callModel(model, normalizeHistory([...historyForModel(messages, 8), { role: 'user', content: user }]), system, apiKey, 80);
    const line = cleanLine(parseActions(raw).text.split('\n')[0]);
    return line && line.length <= 40 ? line : null;
  } catch {
    return null;
  }
}
