import type { AIAction, Action, Card, Cat } from '../types';
import { getActionDecay } from './decay';

const STATUS_EMOJI = { red: '🔴', yellow: '🟡', green: '🟢' } as const;

/** 给聊天用的完整上下文：当前时间、记忆、卡片状态、猫信息 */
export function buildCardContextSummary(
  cards: Card[],
  actions: Action[],
  cats: Cat[],
  lastCompletions: Record<string, string>,
  memory?: string
): string {
  const now = new Date();
  const timeText = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const weekdayText = now.toLocaleDateString('zh-CN', { weekday: 'long' });

  const memorySection = memory?.trim() ? `\n## 西米想让你一直记住的事\n${memory.trim()}\n` : '';

  const byCard: Record<string, Action[]> = {};
  for (const a of actions) {
    byCard[a.card_id] = byCard[a.card_id] ?? [];
    byCard[a.card_id].push(a);
  }

  const cardLines = cards
    .filter((c) => !c.archived)
    .map((card) => {
      const primary = (byCard[card.id] ?? []).find((a) => a.is_primary);
      if (!primary) return `- ${card.name}：（无主动作）`;
      const lastCompletedAt = lastCompletions[primary.id] ? new Date(lastCompletions[primary.id]) : null;
      const decay = getActionDecay(primary, lastCompletedAt);
      return `- ${card.name}：${STATUS_EMOJI[decay.status]}${decay.timeLeft}`;
    })
    .join('\n');

  const catLine = cats
    .map((c) => `${c.name}(${c.gender ?? ''}${c.notes ? ` ${c.notes}` : ''})`)
    .join('、');

  return `当前时间：${timeText}
今天星期：${weekdayText}
${memorySection}
## 用户的卡片状态（生活tab数据）
${cardLines || '（暂无卡片）'}

## 用户的猫
${catLine || '（暂无）'}`;
}

interface ResolvedComplete {
  card: Card;
  action: Action;
}

/** 把 AI 的 complete 指令，对应回真实的卡片/动作。找不到就返回 null（宁可不执行，也不要误操作）*/
export function resolveComplete(action: AIAction, cards: Card[], actions: Action[]): ResolvedComplete | null {
  if (action.type !== 'complete' || !action.card_name) return null;

  const normalize = (s: string) => s.trim().toLowerCase();
  const wantedCard = normalize(action.card_name);

  const card = cards.find((c) => normalize(c.name) === wantedCard);
  if (!card) return null;

  const cardActions = actions.filter((a) => a.card_id === card.id);
  const resolved = action.action_name
    ? cardActions.find((a) => normalize(a.name) === normalize(action.action_name!))
    : cardActions.find((a) => a.is_primary);
  if (!resolved) return null;

  return { card, action: resolved };
}
