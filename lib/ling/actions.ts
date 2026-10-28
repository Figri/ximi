import { createCard } from '../cards';
import { resolveComplete } from '../chatInstructions';
import { addWeight } from '../body';
import { addFragment } from '../fragments';
import { useCardStore } from '../store';
import type { AIAction } from '../../types';

// 灵回复里带的指令：完成例行、记一笔、新建例行。返回给对话里显示的小提示。
// 记一笔（timeline）：体重记进「身体」，别的记成今天的随心记（今天页能看到，晚上进 Notion 日记）——
// 原来的「记录」页已经没了，不再写进看不到的时间轴表。

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function executeLingActions(actions: AIAction[]): Promise<string[]> {
  if (!actions.length) return [];
  const store = useCardStore.getState();
  if (store.cards.length === 0) await store.fetchAll();
  const { cards, actions: cardActions } = useCardStore.getState();
  const labels: string[] = [];
  let changed = false;

  for (const action of actions) {
    try {
      if (action.type === 'complete') {
        const resolved = resolveComplete(action, cards, cardActions);
        if (!resolved) continue;
        await useCardStore.getState().doComplete(resolved.action, resolved.card);
        labels.push(`记下了：${resolved.card.name}（${resolved.action.name}）`);
      } else if (action.type === 'timeline' && action.description) {
        const m = action.description.match(/体重[:：]?\s*([\d.]+)/);
        const kg = m ? parseFloat(m[1]) : NaN;
        if (kg > 20 && kg < 300) {
          await addWeight(todayKey(), Math.round(kg * 100) / 100);
          labels.push(`记下了：体重 ${kg}kg（在「身体」里）`);
        } else {
          await addFragment(action.description);
          labels.push(`记下了：${action.description}（在今天的随心记里）`);
        }
      } else if (action.type === 'create_card' && action.card_name) {
        const interval = action.interval_days ?? 3;
        const isFixed = action.frequency_type === 'fixed_day';
        const card = await createCard(
          { name: action.card_name, type: 'habit', tags: action.card_tags ?? [], notes: null },
          [
            {
              name: action.action_name || '做了',
              is_primary: true,
              frequency_type: isFixed ? 'fixed_day' : 'interval',
              interval_days: isFixed ? null : interval,
              fixed_days: isFixed ? (action.fixed_days ?? null) : null,
              suggested_interval: isFixed ? null : interval,
              max_delay: isFixed ? null : interval * 1.5,
              requires_selection: false,
            },
          ]
        );
        labels.push(`加好了新的例行：${card.name}`);
        changed = true;
      }
    } catch {
      // 单条失败不影响其他
    }
  }
  if (changed) await useCardStore.getState().fetchAll();
  return labels;
}
