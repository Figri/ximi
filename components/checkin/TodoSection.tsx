import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';
import { TodoRow } from './TodoRow';
import { QuickAddBar } from './QuickAddBar';
import { useCardStore } from '../../lib/store';
import type { Action, Card } from '../../types';

interface Row {
  card: Card;
  action: Action;
  done: boolean;
}

export function TodoSection() {
  const { cards, actions, lastCompletions, doComplete, doUndo, fetchAll } = useCardStore();
  const [completedOpen, setCompletedOpen] = useState(false);

  const { important, normal, completed } = useMemo(() => {
    const byCard: Record<string, Action[]> = {};
    for (const a of actions) {
      byCard[a.card_id] = byCard[a.card_id] ?? [];
      byCard[a.card_id].push(a);
    }

    const important: Row[] = [];
    const normal: Row[] = [];
    const completed: Row[] = [];

    for (const card of cards) {
      if (card.archived || card.display_type !== 'todo') continue;
      const primary = (byCard[card.id] ?? []).find((a) => a.is_primary);
      if (!primary) continue;
      const done = Boolean(lastCompletions[primary.id]);
      const row: Row = { card, action: primary, done };
      if (done) completed.push(row);
      else if (card.priority === 'important') important.push(row);
      else normal.push(row);
    }

    const byDue = (a: Row, b: Row) => {
      if (!a.card.due_date && !b.card.due_date) return 0;
      if (!a.card.due_date) return 1;
      if (!b.card.due_date) return -1;
      return new Date(a.card.due_date).getTime() - new Date(b.card.due_date).getTime();
    };
    important.sort(byDue);
    normal.sort(byDue);

    return { important, normal, completed };
  }, [cards, actions, lastCompletions]);

  function renderRow(row: Row) {
    return (
      <TodoRow
        key={row.card.id}
        card={row.card}
        action={row.action}
        done={row.done}
        onComplete={(a) => doComplete(a, row.card)}
        onUndo={(a) => doUndo(a.id)}
        onDeleted={fetchAll}
      />
    );
  }

  const hasAny = important.length + normal.length + completed.length > 0;

  return (
    <View style={styles.container}>
      {!hasAny && <Text style={styles.empty}>还没有事项，在下面写点什么吧</Text>}

      {important.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupHeader}>── 重要 ──</Text>
          {important.map(renderRow)}
        </View>
      )}

      {normal.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupHeader}>── 普通 ──</Text>
          {normal.map(renderRow)}
        </View>
      )}

      {completed.length > 0 && (
        <View style={styles.group}>
          <Pressable onPress={() => setCompletedOpen((v) => !v)}>
            <Text style={styles.groupHeader}>
              ── 已完成（{completed.length}） ── {completedOpen ? '▼' : '▶'}
            </Text>
          </Pressable>
          {completedOpen && completed.map(renderRow)}
        </View>
      )}

      <QuickAddBar onAdded={fetchAll} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: spacing.md },
  group: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  groupHeader: {
    fontSize: fontSize.secondary,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    includeFontPadding: false,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.body,
    paddingVertical: spacing.lg,
  },
});
