import type { AIAction, Action, Card } from '../types';

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
