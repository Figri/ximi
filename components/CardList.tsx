import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useMemo, useState } from 'react';
import { Card } from './Card';
import { TagFilter } from './TagFilter';
import { useCardStore } from '../lib/store';
import { getActionDecay, sortByUrgency } from '../lib/decay';
import { colors, fontSize, spacing } from '../constants/theme';
import type { Action, Card as CardType, DecayResult } from '../types';

interface Row {
  card: CardType;
  primaryAction: Action | null;
  secondaryActions: Action[];
  decay: DecayResult;
}

export function CardList({ onNewCardPress }: { onNewCardPress?: () => void }) {
  const { cards, actions, lastCompletions, doComplete, doUndo } = useCardStore();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => c.tags.forEach((t) => set.add(t)));
    return Array.from(set);
  }, [cards]);

  const rows = useMemo<Row[]>(() => {
    const byCard: Record<string, Action[]> = {};
    for (const a of actions) {
      byCard[a.card_id] = byCard[a.card_id] ?? [];
      byCard[a.card_id].push(a);
    }

    const built: Row[] = [];
    for (const card of cards) {
      if (selectedTag && !card.tags.includes(selectedTag)) continue;
      const cardActions = byCard[card.id] ?? [];
      const primaryAction = cardActions.find((a) => a.is_primary) ?? null;
      if (!primaryAction) continue; // 只显示有主动作的卡片

      const secondaryActions = cardActions.filter((a) => !a.is_primary);
      const lastCompletedAt = lastCompletions[primaryAction.id]
        ? new Date(lastCompletions[primaryAction.id])
        : null;
      const decay = getActionDecay(primaryAction, lastCompletedAt);

      built.push({ card, primaryAction, secondaryActions, decay });
    }

    return sortByUrgency(built.map((r) => ({ ...r, status: r.decay.status, percentage: r.decay.percentage })));
  }, [cards, actions, lastCompletions, selectedTag]);

  return (
    <View style={styles.container}>
      <TagFilter tags={allTags} selected={selectedTag} onSelect={setSelectedTag} onAddPress={onNewCardPress} />
      <FlatList
        style={styles.list}
        data={rows}
        keyExtractor={(r) => r.card.id}
        contentContainerStyle={styles.listContent}
        removeClippedSubviews={false}
        renderItem={({ item }) => (
          <Card
            card={item.card}
            primaryAction={item.primaryAction}
            secondaryActions={item.secondaryActions}
            decay={item.decay}
            onComplete={(action) => item.primaryAction && doComplete(action, item.card)}
            onUndo={(action) => doUndo(action.id)}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>这个标签下还没有卡片，点右上角 ＋ 新建一个吧</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingTop: spacing.sm, paddingBottom: spacing.xl * 3 },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.body,
    marginTop: spacing.xl,
  },
});
