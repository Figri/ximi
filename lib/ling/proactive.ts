import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { loadItems as loadTodoItems } from '../todoLocal';
import { nextTodoOccurrence } from '../todo';
import { loadItems as loadScheduleItems } from '../scheduleLocal';
import { getPlaySession } from '../play';
import { fetchActions, fetchCards, fetchLastCompletions } from '../cards';
import { nextHabitReminder } from '../decay';
import { ensureNotificationPermission, ensureLingChannels } from '../notifications';
import { routineStatuses } from './context';
import { writeDrafts, fallbackDrafts, type DraftRequest, type Drafts } from './brain';
import { isPausedToday, isQuiet, lingDayKey, loadLingSettings, nextAllowed, type LingSettings } from './settings';
import { useLingThread, type LingKind } from './thread';
import { fallbackText } from './templates';

// 主动消息怎么做到「App 关着也能收到，而且不靠服务器」（需求文档 §6.5）：
// 1. 每次打开 App（开着时每 3 小时一次），灵把接下来可能要发的话先写好（drafts）。
// 2. 离开 App 时，按规则算好时间，排成手机本地的定时通知（没有谷歌服务也能响）。
// 3. 一回到 App，已经发出去的那几条放进对话线（带上为什么发），没发的全部作废，按最新情况重排。
// 所以「想你了」只会在她真的消失了才出现；约定提醒到点就响，不受免打扰影响。

export interface OutboxItem {
  id: string;
  kind: Exclude<LingKind, 'chat' | 'divider' | 'note'>;
  text: string;
  fireAt: string;
  trigger: string;
  notificationId: string | null;
  fallback: boolean;
  /** 事项提醒 / 日程提醒 / 娱乐出口：对应的 id，避免同一个点重复进对话 */
  refKey: string | null;
}

const K_OUTBOX = 'ling_outbox_v1';
const K_DELIVERED = 'ling_delivered_v1';
const K_DRAFTS = 'ling_drafts_v1';
const K_MENTION_AT = 'ling_mention_at_v1';
const DRAFT_TTL_MS = 3 * 3600 * 1000;
const HOUR = 3600 * 1000;
/** 两条主动消息（含约定提醒）之间至少隔这么久，免得一下子连着来好几条 */
const MIN_GAP_MS = 45 * 60 * 1000;

// 投递、重排、作废都要读改写同一个 outbox：排队一个一个来，不然后写的会把先写的盖掉，
// 盖掉的那批通知已经排进系统了却不在 outbox 里，下次就取消不掉，会重复响。
let outboxLock: Promise<unknown> = Promise.resolve();
function withOutboxLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = outboxLock.then(fn, fn);
  outboxLock = run.catch(() => {});
  return run;
}

interface DeliveredLog {
  /** 已经进过对话的 refKey（约定提醒），防止重复 */
  refKeys: string[];
  /** 每天各类主动消息发了几条：{ '2026-10-25': { miss_you: 1, mention: 1 } } */
  perDay: Record<string, Record<string, number>>;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function loadOutbox(): Promise<OutboxItem[]> {
  return readJson<OutboxItem[]>(K_OUTBOX, []);
}
async function saveOutbox(items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(K_OUTBOX, JSON.stringify(items));
}
async function loadDelivered(): Promise<DeliveredLog> {
  return readJson<DeliveredLog>(K_DELIVERED, { refKeys: [], perDay: {} });
}
async function saveDelivered(log: DeliveredLog): Promise<void> {
  // 只留最近 14 天的计数和最近 300 个 refKey
  const days = Object.keys(log.perDay).sort().slice(-14);
  const perDay: DeliveredLog['perDay'] = {};
  for (const d of days) perDay[d] = log.perDay[d];
  await AsyncStorage.setItem(K_DELIVERED, JSON.stringify({ refKeys: log.refKeys.slice(-300), perDay }));
}

export async function sentToday(kind: string, settings?: LingSettings, now = new Date()): Promise<number> {
  const s = settings ?? (await loadLingSettings());
  const log = await loadDelivered();
  return log.perDay[lingDayKey(now, s.dayStartHour)]?.[kind] ?? 0;
}

// ---------------- 投递：打开 App 时把已经发出去的放进对话 ----------------

/** 把 fireAt 已过的消息放进对话线，返回放了几条 */
export function deliverDue(at?: Date): Promise<number> {
  return withOutboxLock(async () => {
    const now = at ?? new Date();
    const settings = await loadLingSettings();
    const outbox = await loadOutbox();
    const due = outbox.filter((o) => new Date(o.fireAt).getTime() <= now.getTime()).sort((a, b) => a.fireAt.localeCompare(b.fireAt));
    if (!due.length) return 0;
    const log = await loadDelivered();
    const thread = useLingThread.getState();
    if (!thread.loaded) await thread.load();
    let added = 0;
    for (const item of due) {
      if (item.refKey && log.refKeys.includes(item.refKey)) continue;
      await useLingThread.getState().add({
        role: 'assistant',
        content: item.text,
        kind: item.kind,
        trigger: item.trigger,
        fallback: item.fallback,
        created_at: item.fireAt,
      });
      added++;
      if (item.refKey) log.refKeys.push(item.refKey);
      const day = lingDayKey(new Date(item.fireAt), settings.dayStartHour);
      log.perDay[day] = log.perDay[day] ?? {};
      log.perDay[day][item.kind] = (log.perDay[day][item.kind] ?? 0) + 1;
    }
    await saveDelivered(log);
    await saveOutbox(outbox.filter((o) => !due.includes(o)));
    return added;
  });
}

/** App 开着的时候「想你了」响了（正常不会，兜底）：她明明在，这条作废，按现在重排 */
export function dropOutboxItem(id: string): Promise<void> {
  return withOutboxLock(async () => {
    const outbox = await loadOutbox();
    await saveOutbox(outbox.filter((o) => o.id !== id));
  });
}

// ---------------- 通知 ----------------

async function cancelAllPending(): Promise<void> {
  const outbox = await loadOutbox();
  const now = Date.now();
  const keep: OutboxItem[] = [];
  for (const o of outbox) {
    if (new Date(o.fireAt).getTime() <= now) {
      keep.push(o); // 已经响过的留着，等投递
      continue;
    }
    if (o.notificationId) await Notifications.cancelScheduledNotificationAsync(o.notificationId).catch(() => {});
  }
  await saveOutbox(keep);
}

/** 老版本排过的通知（事项提醒 / 衰减提醒）全部取消，由灵接管 */
export async function cancelLegacyNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (n.identifier.startsWith('ximi-todo-') || n.identifier.startsWith('ximi-action-')) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
      }
    }
  } catch {}
}

async function scheduleOne(item: OutboxItem, settings: LingSettings, canNotify: boolean): Promise<string | null> {
  if (!canNotify || Platform.OS === 'web') return null;
  const isRemind = item.kind === 'reminder' || item.kind === 'play_end';
  try {
    return await Notifications.scheduleNotificationAsync({
      identifier: `ling-${item.id}`,
      content: {
        title: '灵',
        body: settings.lockScreen === 'full' ? item.text : '发来一条消息',
        data: { lingOutboxId: item.id, kind: item.kind },
        sound: isRemind ? 'default' : undefined,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(item.fireAt),
        channelId: isRemind ? 'ling-remind' : 'ling',
      },
    });
  } catch {
    return null;
  }
}

// ---------------- 草稿：灵提前写好的话 ----------------

interface StoredDrafts extends Drafts {
  signature: string;
}

function signatureOf(req: DraftRequest): string {
  return JSON.stringify({ m: req.mention?.name ?? null, r: req.reminders.map((r) => `${r.id}|${r.content}|${r.at}`) });
}

async function loadDrafts(): Promise<StoredDrafts | null> {
  return readJson<StoredDrafts | null>(K_DRAFTS, null);
}

let refreshing: Promise<void> | null = null;

/** 需要时（超过 3 小时，或者要说的事变了）让灵重写一批；失败就用备用文案，不影响排程 */
export function refreshDrafts(force = false): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const plan = await buildPlan(new Date());
    const req = plan.request;
    const sig = signatureOf(req);
    const old = await loadDrafts();
    const fresh = old && old.signature === sig && Date.now() - new Date(old.createdAt).getTime() < DRAFT_TTL_MS && old.source === 'model';
    if (fresh && !force) return;
    const thread = useLingThread.getState();
    if (!thread.loaded) await thread.load();
    const drafts = await writeDrafts(req, useLingThread.getState().messages);
    await AsyncStorage.setItem(K_DRAFTS, JSON.stringify({ ...drafts, signature: sig }));
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// ---------------- 排程 ----------------

interface Reminder {
  refKey: string;
  id: string;
  content: string;
  at: Date;
  kind: 'reminder' | 'play_end';
  trigger: string;
}

interface Plan {
  reminders: Reminder[];
  mention: { name: string; timeLeft: string } | null;
  request: DraftRequest;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function upcomingReminders(now: Date): Promise<Reminder[]> {
  const out: Reminder[] = [];
  const horizon = now.getTime() + 36 * HOUR;
  try {
    for (const item of await loadTodoItems()) {
      if (!item.reminder_enabled || !item.reminder_time) continue;
      const at = nextTodoOccurrence(item, now);
      if (!at || at.getTime() > horizon) continue;
      out.push({ refKey: `todo:${item.id}:${at.toISOString()}`, id: `t${item.id.slice(0, 8)}`, content: item.content, at, kind: 'reminder', trigger: `你给「${item.content}」设了 ${hhmm(at)} 提醒` });
    }
  } catch {}
  try {
    for (const item of await loadScheduleItems()) {
      if (!item.remind_at) continue;
      const at = new Date(item.remind_at);
      if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime() || at.getTime() > horizon) continue;
      out.push({ refKey: `sched:${item.id}:${item.remind_at}`, id: `s${item.id.slice(0, 8)}`, content: item.title, at, kind: 'reminder', trigger: `你给日程「${item.title}」设了 ${hhmm(at)} 提醒` });
    }
  } catch {}
  try {
    // 习惯「到日子提醒我」：到日子那天提醒一次
    const [cards, actions, last] = await Promise.all([fetchCards(), fetchActions(), fetchLastCompletions()]);
    for (const card of cards) {
      if (card.archived || card.display_type !== 'habit') continue;
      const a = actions.find((x) => x.card_id === card.id && x.is_primary);
      if (!a?.remind_at) continue;
      const at = nextHabitReminder(a, last[a.id] ? new Date(last[a.id]) : null, now);
      if (!at || at.getTime() > horizon) continue;
      out.push({ refKey: `habit:${a.id}:${at.toISOString()}`, id: `h${a.id.slice(0, 8)}`, content: card.name, at, kind: 'reminder', trigger: `你给「${card.name}」设了到日子 ${hhmm(at)} 提醒` });
    }
  } catch {}
  try {
    const play = await getPlaySession();
    if (play) {
      const at = new Date(play.endsAt);
      if (at.getTime() > now.getTime()) {
        out.push({ refKey: `play:${play.id}:${play.endsAt}`, id: `p${play.id.slice(-6)}`, content: `玩${play.what}说好的 ${play.minutes} 分钟到了`, at, kind: 'play_end', trigger: `你开始玩${play.what}时定了 ${play.minutes} 分钟` });
      }
    }
  } catch {}
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

async function pickMention(settings: LingSettings, now: Date): Promise<{ name: string; timeLeft: string } | null> {
  if (!settings.enableMention) return null;
  if ((await sentToday('mention', settings, now)) >= 1) return null;
  try {
    const list = (await routineStatuses()).filter((r) => !r.hasReminder);
    const red = list.filter((r) => r.status === 'red');
    const yellow = list.filter((r) => r.status === 'yellow');
    const pick = red[0] ?? yellow[0];
    return pick ? { name: pick.name, timeLeft: pick.timeLeft } : null;
  } catch {
    return null;
  }
}

async function buildPlan(now: Date): Promise<Plan> {
  const settings = await loadLingSettings();
  const reminders = await upcomingReminders(now);
  const mention = await pickMention(settings, now);
  return {
    reminders,
    mention,
    request: {
      missYou: settings.enableMissYou ? Math.min(2, settings.missYouPerDay) : 0,
      mention,
      reminders: reminders.filter((r) => r.kind === 'reminder').map((r) => ({ id: r.id, content: r.content, at: hhmm(r.at) })),
    },
  };
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clashes(t: number, taken: OutboxItem[]): boolean {
  return taken.some((o) => Math.abs(new Date(o.fireAt).getTime() - t) < MIN_GAP_MS);
}

/**
 * 顺口一提的时间：15:00–21:00 里随机挑一个，挑定了这一天就不变（每次打开 App 都重新抽的话会一直往后挪），
 * 已经过了或者和别的消息挨太近才重抽。今天的窗口来不及了就放明天。
 */
async function mentionTime(now: Date, settings: LingSettings, taken: OutboxItem[]): Promise<Date | null> {
  const start = new Date(now);
  start.setHours(15, 0, 0, 0);
  const end = new Date(now);
  end.setHours(21, 0, 0, 0);
  if (now.getTime() + 30 * 60000 >= end.getTime()) {
    start.setDate(start.getDate() + 1);
    end.setDate(end.getDate() + 1);
  }
  const ok = (t: number) => t > now.getTime() + 5 * 60000 && t >= start.getTime() && t <= end.getTime() && !clashes(t, taken) && !isQuiet(new Date(t), settings);
  const saved = await readJson<string | null>(K_MENTION_AT, null);
  let t = saved ? new Date(saved).getTime() : NaN;
  if (!ok(t)) {
    const from = Math.max(now.getTime() + 30 * 60000, start.getTime());
    t = NaN;
    for (let i = 0; i < 16 && !ok(t); i++) t = rand(from, end.getTime());
    if (!ok(t)) return null;
    await AsyncStorage.setItem(K_MENTION_AT, JSON.stringify(new Date(t).toISOString()));
  }
  return new Date(t);
}

/** 「想你了」的时间：躲开免打扰，也躲开前后 45 分钟内已经排了的消息 */
function missYouTime(base: number, settings: LingSettings, taken: OutboxItem[]): Date {
  let at = nextAllowed(new Date(base), settings);
  for (let i = 0; i < 6 && clashes(at.getTime(), taken); i++) {
    const near = taken.filter((o) => Math.abs(new Date(o.fireAt).getTime() - at.getTime()) < MIN_GAP_MS);
    const latest = Math.max(...near.map((o) => new Date(o.fireAt).getTime()));
    at = nextAllowed(new Date(latest + MIN_GAP_MS), settings);
  }
  return at;
}

/**
 * 按「她从 now 开始离开 App」重排所有主动消息和约定提醒。
 * 返回排上的条目（测试和设定页的「接下来」用）。
 */
export function rescheduleAll(at?: Date): Promise<OutboxItem[]> {
  return withOutboxLock(async () => {
    const now = at ?? new Date();
    const settings = await loadLingSettings();
    await cancelAllPending();
    const plan = await buildPlan(now);
    const stored = await loadDrafts();
    const drafts: Drafts = stored && stored.signature === signatureOf(plan.request) ? stored : fallbackDrafts(plan.request);
    const items: OutboxItem[] = [];
    const mk = (p: Omit<OutboxItem, 'id' | 'notificationId'>): OutboxItem => ({
      ...p,
      id: `${p.kind}-${new Date(p.fireAt).getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      notificationId: null,
    });

    // 约定提醒：到点就发，不受免打扰、不受「今天别找我」影响
    for (const r of plan.reminders) {
      const text = r.kind === 'play_end' ? fallbackText('play_end', { minutes: r.content.match(/(\d+) 分钟/)?.[1] }) : drafts.reminders[r.id] ?? fallbackText('reminder', { content: r.content });
      items.push(mk({ kind: r.kind, text, fireAt: r.at.toISOString(), trigger: r.trigger, fallback: drafts.source === 'fallback' || r.kind === 'play_end', refKey: r.refKey }));
    }

    const paused = (d: Date) => isPausedToday(settings, d);

    // 顺口一提：一天最多一件，挑最该照顾的那个，15:00–21:00 之间
    if (plan.mention && drafts.mention) {
      const at = await mentionTime(now, settings, items);
      if (at && !paused(at)) {
        items.push(mk({
          kind: 'mention',
          text: drafts.mention,
          fireAt: at.toISOString(),
          trigger: `「${plan.mention.name}」${plan.mention.timeLeft.startsWith('超') ? '已经' : '快'}到时候了（${plan.mention.timeLeft}）`,
          fallback: drafts.source === 'fallback',
          refKey: null,
        }));
      }
    }

    // 想你了：3–6 小时（随机）没打开 App 才发；每天的上限按落在哪天分别算；连着最多排 2 条，她一打开就作废重排
    if (settings.enableMissYou && settings.missYouPerDay > 0) {
      const used: Record<string, number> = {};
      let cursor = now.getTime();
      for (let i = 0; i < 2; i++) {
        const at = missYouTime(cursor + rand(3, 6) * HOUR, settings, items);
        const day = lingDayKey(at, settings.dayStartHour);
        used[day] = used[day] ?? (await sentToday('miss_you', settings, at));
        if (used[day] >= settings.missYouPerDay || paused(at)) break;
        used[day]++;
        const hours = Math.floor((at.getTime() - now.getTime()) / HOUR);
        items.push(mk({
          kind: 'miss_you',
          text: drafts.missYou[i] ?? fallbackText('miss_you'),
          fireAt: at.toISOString(),
          trigger: `你 ${hours} 个多小时没打开 App`,
          fallback: drafts.source === 'fallback',
          refKey: null,
        }));
        cursor = at.getTime();
      }
    }

    items.sort((a, b) => a.fireAt.localeCompare(b.fireAt));
    const canNotify = Platform.OS !== 'web' && (await ensureLingChannels().then(() => ensureNotificationPermission('once')).catch(() => false));
    for (const it of items) it.notificationId = await scheduleOne(it, settings, canNotify);
    const kept = await loadOutbox(); // cancelAllPending 之后只剩已响未投递的
    await saveOutbox([...kept, ...items]);
    return items;
  });
}

/** 设定页「接下来」：看看排了什么 */
export async function pendingOutbox(): Promise<OutboxItem[]> {
  const now = Date.now();
  return (await loadOutbox()).filter((o) => new Date(o.fireAt).getTime() > now).sort((a, b) => a.fireAt.localeCompare(b.fireAt));
}

/** 提醒自检：10 秒后发一条测试通知 */
export async function sendTestNotification(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  await ensureLingChannels().catch(() => {});
  const ok = await ensureNotificationPermission().catch(() => false);
  if (!ok) return false;
  const settings = await loadLingSettings();
  await Notifications.scheduleNotificationAsync({
    identifier: `ling-test-${Date.now()}`,
    content: { title: '灵', body: settings.lockScreen === 'full' ? '这是一条测试，收到就说明提醒能响 :)' : '发来一条消息', data: { kind: 'test' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 10, repeats: false, channelId: 'ling' },
  });
  return true;
}
