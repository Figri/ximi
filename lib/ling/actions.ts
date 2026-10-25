import { createCard } from '../cards';
import { resolveComplete } from '../chatInstructions';
import { addTimelineEntry } from '../timeline';
import { useCardStore } from '../store';
import type { AIAction, TimelineCategory } from '../../types';

// 灵回复里带的指令：完成例行、记一条时间轴、新建例行。返回给对话里显示的小提示。

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
        const durationMs = (action.duration_min ?? 0) * 60_000;
        const end = new Date();
        const start = new Date(end.getTime() - durationMs);
        await addTimelineEntry({
          category: (action.category as TimelineCategory) ?? 'other',
          description: action.description,
          start_time: start.toISOString(),
          end_time: durationMs > 0 ? end.toISOString() : undefined,
          hp_change: action.hp_change,
          mp_change: action.mp_change,
          source: 'chat',
        });
        labels.push(`记下了：${action.description}`);
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
