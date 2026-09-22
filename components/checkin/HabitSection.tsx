import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';
import { HabitIcon } from './HabitIcon';
import { shouldShowHabitToday } from '../../lib/decay';
import { useCardStore } from '../../lib/store';
import type { Action, Card, Cat, TimeOfDay } from '../../types';

const GROUP_ORDER: { key: TimeOfDay; label: string }[] = [
  { key: 'anytime', label: '全天' },
  { key: 'morning', label: '早上' },
  { key: 'day', label: '白天' },
  { key: 'evening', label: '晚上' },
];

interface HabitSectionProps {
  cats: Cat[];
}

export function HabitSection({ cats }: HabitSectionProps) {
  const { cards, actions, lastCompletions, doComplete, doUndo } = useCardStore();

  const groups = useMemo(() => {
    const byCard: Record<string, Action[]> = {};
    for (const a of actions) {
      byCard[a.card_id] = byCard[a.card_id] ?? [];
      byCard[a.card_id].push(a);
    }

    const habitCards = cards.filter((c) => !c.archived && c.display_type === 'habit');

    const result: { label: string; items: { card: Card; action: Action }[] }[] = [];
    for (const group of GROUP_ORDER) {
      const items: { card: Card; action: Action }[] = [];
      for (const card of habitCards) {
        if ((card.time_of_day ?? 'anytime') !== group.key) continue;
        const primary = (byCard[card.id] ?? []).find((a) => a.is_primary);
        if (!primary) continue;
        const lastCompletedAt = lastCompletions[primary.id] ? new Date(lastCompletions[primary.id]) : null;
        if (!shouldShowHabitToday(primary, lastCompletedAt)) continue;
        items.push({ card, action: primary });
      }
      if (items.length) result.push({ label: group.label, items });
    }
    return result;
  }, [cards, actions, lastCompletions]);

  if (groups.length === 0) {
    return <Text style={styles.empty}>今天没有要打卡的习惯，点右上角＋加一个吧</Text>;
  }

  return (
    <View style={styles.container}>
      {groups.map((group) => (
        <View key={group.label} style={styles.group}>
          <Text style={styles.groupHeader}>── {group.label} ──</Text>
          <View style={styles.row}>
            {group.items.map(({ card, action }) => (
              <HabitIcon
                key={card.id}
                card={card}
                action={action}
                lastCompletedAt={lastCompletions[action.id] ? new Date(lastCompletions[action.id]) : null}
                cats={cats}
                onComplete={(a, options) => doComplete(a, card, options)}
                onUndo={(a) => doUndo(a.id)}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  group: { marginBottom: spacing.md },
  groupHeader: {
    fontSize: fontSize.secondary,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    includeFontPadding: false,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.body,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
});
