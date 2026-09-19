import type { Action, Card } from '../types';
import { getActionDecay } from './decay';

/**
 * HP/MP 真实计算（v2）：
 * - HP 反映"日常事务有没有跟上"——所有主动作衰减百分比的平均值，
 *   越多卡片超期/快超期，HP 越低。
 * - MP 反映"有没有照顾好自己"——只看 💅护理 标签下卡片的主动作衰减百分比，
 *   护理类的事拖着不做，MP 掉得比别的更明显。
 * 都不看 manual/timer 类型动作（没有"过期"这个概念，不该拉低分数）。
 */

function isScorable(action: Action): boolean {
  return action.frequency_type !== 'manual';
}

function averageDecayPercentage(
  cards: Card[],
  actions: Action[],
  lastCompletions: Record<string, string>,
  filter: (card: Card) => boolean
): number {
  const byCard: Record<string, Action[]> = {};
  for (const a of actions) {
    byCard[a.card_id] = byCard[a.card_id] ?? [];
    byCard[a.card_id].push(a);
  }

  const percentages: number[] = [];
  for (const card of cards) {
    if (card.archived || !filter(card)) continue;
    const primary = (byCard[card.id] ?? []).find((a) => a.is_primary);
    if (!primary || !isScorable(primary)) continue;
    const lastCompletedAt = lastCompletions[primary.id] ? new Date(lastCompletions[primary.id]) : null;
    percentages.push(getActionDecay(primary, lastCompletedAt).percentage);
  }

  if (percentages.length === 0) return 100;
  return Math.round(percentages.reduce((sum, p) => sum + p, 0) / percentages.length);
}

export function calculateHP(cards: Card[], actions: Action[], lastCompletions: Record<string, string>): number {
  return averageDecayPercentage(cards, actions, lastCompletions, () => true);
}

export function calculateMP(cards: Card[], actions: Action[], lastCompletions: Record<string, string>): number {
  return averageDecayPercentage(cards, actions, lastCompletions, (card) => card.tags.includes('💅护理'));
}
