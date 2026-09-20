import type { Action, AIInstruction, Card, Cat } from '../types';
import { getActionDecay } from './decay';

/** 给聊天用的卡片/猫上下文摘要，AI 回复里的 card/actionName 要原样抄这里的名字 */
export function buildCardContextSummary(
  cards: Card[],
  actions: Action[],
  cats: Cat[],
  lastCompletions: Record<string, string>,
  memory?: string
): string {
  const memorySection = memory?.trim()
    ? `西米让你一直记住的事情（人设/习惯/偏好……，聊天时要参考）：\n${memory.trim()}\n\n`
    : '';

  const catLines = cats
    .map((c) => `${c.name}${c.gender ? `(${c.gender})` : ''}${c.notes ? ` ${c.notes}` : ''}`)
    .join('、');

  const byCard: Record<string, Action[]> = {};
  for (const a of actions) {
    byCard[a.card_id] = byCard[a.card_id] ?? [];
    byCard[a.card_id].push(a);
  }

  const cardLines = cards
    .filter((c) => !c.archived)
    .map((card) => {
      const cardActions = byCard[card.id] ?? [];
      const actionLines = cardActions.map((a) => {
        const lastCompletedAt = lastCompletions[a.id] ? new Date(lastCompletions[a.id]) : null;
        const decay = getActionDecay(a, lastCompletedAt);
        return `${a.name}(${decay.status === 'red' ? '超期' : decay.status === 'yellow' ? '快到了' : '还好'})`;
      });
      return `${card.name}：${actionLines.join('、') || '（无动作）'}`;
    })
    .join('\n');

  return `${memorySection}猫：${catLines || '（暂无）'}

卡片和动作（西米说"做了/完成了xxx"，你判断出对应哪张卡片的哪个动作时，
在 JSON 指令里的 "card" 和 "actionName" 必须跟下面列出的名字完全一样，
一个字都不能改，也不要自己编不存在的卡片名）：
${cardLines || '（暂无卡片）'}`;
}

interface ResolvedInstruction {
  card: Card;
  action: Action;
}

/** 把 AI 回复里的指令，对应回真实的卡片/动作。找不到就返回 null（宁可不执行，也不要误操作）*/
export function resolveInstruction(
  instruction: AIInstruction,
  cards: Card[],
  actions: Action[]
): ResolvedInstruction | null {
  if (instruction.action !== 'complete' || !instruction.card || !instruction.actionName) return null;

  const normalize = (s: string) => s.trim().toLowerCase();
  const wantedCard = normalize(instruction.card);
  const wantedAction = normalize(instruction.actionName);

  const card = cards.find((c) => normalize(c.name) === wantedCard);
  if (!card) return null;

  const action = actions.find(
    (a) => a.card_id === card.id && normalize(a.name) === wantedAction
  );
  if (!action) return null;

  return { card, action };
}
