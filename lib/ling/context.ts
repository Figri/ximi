import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchDayView } from '../schedule';
import { fetchItemsForDate, isDoneOnDate } from '../todo';
import { loadCompletions as loadTodoCompletions } from '../todoLocal';
import { fetchActions, fetchCards, fetchCats, fetchLastCompletions } from '../cards';
import { getActionDecay } from '../decay';
import { fetchMemory } from '../memory';
import { stateEventsBetween, summarizeStates } from '../states';
import { lingDayKey, loadLingSettings } from './settings';
import type { LingMessage } from './thread';

// 给灵的第 5 层「今天的情况」：只放灵说话用得上的东西，短。

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export interface RoutineStatus {
  cardId: string;
  name: string;
  status: 'green' | 'yellow' | 'red';
  timeLeft: string;
}

/** 例行（习惯卡片主动作）的红黄绿，顺口一提和今天页都用 */
export async function routineStatuses(): Promise<RoutineStatus[]> {
  const [cards, actions, last] = await Promise.all([fetchCards(), fetchActions(), fetchLastCompletions()]);
  const out: RoutineStatus[] = [];
  for (const card of cards) {
    if (card.display_type === 'todo') continue;
    const primary = actions.find((a) => a.card_id === card.id && a.is_primary);
    if (!primary || primary.frequency_type === 'manual') continue;
    const decay = getActionDecay(primary, last[primary.id] ? new Date(last[primary.id]) : null);
    out.push({ cardId: card.id, name: card.name, status: decay.status, timeLeft: decay.timeLeft });
  }
  return out;
}

export async function buildTodayData(now = new Date()): Promise<string> {
  const settings = await loadLingSettings();
  const dayKey = lingDayKey(now, settings.dayStartHour);
  const lines: string[] = [];
  const isLateNight = now.getHours() < settings.dayStartHour;
  lines.push(
    `现在：${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAY[now.getDay()]} ${hhmm(now)}${isLateNight ? `（还没过 ${settings.dayStartHour} 点，算 ${dayKey.slice(5)} 这一天）` : ''}`
  );

  try {
    const view = await fetchDayView(dayKey);
    const rows = Object.entries(view.rowsBySlot).flatMap(([slot, list]) =>
      list.map((r) => `${slot === 'allday' ? '全天' : `${slot}点`} ${r.title}${r.done ? '（做了）' : ''}`)
    );
    if (rows.length) lines.push(`今天的作息和事项：${rows.join('；')}`);
  } catch {}

  try {
    const [y, m, d] = dayKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const items = await fetchItemsForDate(date);
    const comps = await loadTodoCompletions();
    if (items.length) {
      lines.push(`今天的待办：${items.map((it) => `${it.content}${isDoneOnDate(it, dayKey, comps) ? '（做了）' : ''}`).join('；')}`);
    }
  } catch {}

  try {
    const routines = await routineStatuses();
    const due = routines.filter((r) => r.status !== 'green');
    const ok = routines.filter((r) => r.status === 'green');
    if (due.length) lines.push(`该照顾的例行（名字照抄）：${due.map((r) => `${r.name}（${r.timeLeft}）`).join('；')}`);
    if (ok.length) lines.push(`状态还好的例行：${ok.map((r) => r.name).join('、')}`);
  } catch {}

  try {
    const cats = await fetchCats();
    if (cats.length) lines.push(`猫：${cats.map((c) => c.name).join('、')}`);
  } catch {}

  try {
    const start = new Date(now.getTime() - 12 * 3600 * 1000);
    const events = await stateEventsBetween(start, new Date(now.getTime() + 60000));
    if (events.length) {
      const last = events[events.length - 1];
      lines.push(`她最近点的状态：${summarizeStates(events)}，最后一次是 ${hhmm(new Date(last.at))} 的「${last.state}」${last.note ? `（${last.note}）` : ''}`);
    }
  } catch {}

  try {
    const raw = await AsyncStorage.getItem('play_session_v1');
    const play = raw ? JSON.parse(raw) : null;
    if (play?.endsAt && new Date(play.endsAt).getTime() > now.getTime()) {
      lines.push(`她正在玩${play.what ?? ''}，说好玩到 ${hhmm(new Date(play.endsAt))}`);
    }
  } catch {}

  return lines.join('\n');
}

/** 第 6 层的一部分：昨天最后聊的几句（让灵第二天能接上话） */
export function yesterdaySnippet(messages: LingMessage[], now = new Date(), dayStartHour = 5): string {
  const today = lingDayKey(now, dayStartHour);
  const before = messages.filter((m) => m.kind !== 'divider' && lingDayKey(new Date(m.created_at), dayStartHour) < today);
  const tail = before.slice(-6);
  if (!tail.length) return '';
  return tail.map((m) => `${m.role === 'user' ? '她' : '你'}：${m.content.replace(/\s+/g, ' ').slice(0, 80)}`).join('\n');
}

export async function loadLocalMemory(): Promise<string> {
  try {
    const mem = await fetchMemory();
    return mem ? `她让你一直记住的：\n${mem}` : '';
  } catch {
    return '';
  }
}
