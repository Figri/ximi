import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMemo, useRef, useState } from 'react';
import { Card } from './Card';
import { TagFilter } from './TagFilter';
import { CatRow } from './CatRow';
import { useCardStore } from '../lib/store';
import { getActionDecay, sortByUrgency } from '../lib/decay';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import type { Action, Card as CardType, Cat, DecayResult, DecayStatus, TimeOfDay } from '../types';

const CAT_TAG = '🐱猫';

type StatusFilter = 'all' | 'red' | 'red_yellow' | 'green';
const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'red', label: '🔴 只看红色' },
  { value: 'red_yellow', label: '🔴🟡 需要处理的' },
  { value: 'green', label: '🟢 只看绿色' },
];
const STATUS_FILTER_BADGE: Record<StatusFilter, string> = {
  all: '状态',
  red: '🔴',
  red_yellow: '🔴🟡',
  green: '🟢',
};

const TIME_OF_DAY_GROUPS: { key: TimeOfDay; label: string }[] = [
  { key: 'morning', label: '🌅 早上' },
  { key: 'day', label: '☀️ 白天' },
  { key: 'evening', label: '🌙 晚上' },
  { key: 'anytime', label: '⏰ 随时' },
];

interface Row {
  card: CardType;
  primaryAction: Action | null;
  secondaryActions: Action[];
  decay: DecayResult;
}

function matchesStatusFilter(status: DecayStatus, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'red') return status === 'red';
  if (filter === 'red_yellow') return status === 'red' || status === 'yellow';
  return status === 'green';
}

interface CardListProps {
  cats: Cat[];
  onNewCardPress?: () => void;
}

export function CardList({ cats, onNewCardPress }: CardListProps) {
  const { cards, actions, lastCompletions, doComplete, doUndo } = useCardStore();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [, forceRerender] = useState(0);
  const pinnedUntil = useRef<Record<string, number>>({});
  const pinnedIndex = useRef<Record<string, number>>({});

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
      if (card.archived) continue;
      if (selectedTag && !card.tags.includes(selectedTag)) continue;
      const cardActions = byCard[card.id] ?? [];
      const truePrimary = cardActions.find((a) => a.is_primary) ?? null;
      const others = cardActions.filter((a) => !a.is_primary);

      let primaryAction = truePrimary;
      let secondaryActions = others;

      if (!primaryAction) {
        // 没有主动作的卡片（比如猫砂盆ABC）：只有某个次要动作变黄/红了才冒出来，
        // 用那个最紧急的次要动作顶替主动作的位置显示
        const withDecay = others
          .map((a) => ({
            action: a,
            decay: getActionDecay(a, lastCompletions[a.id] ? new Date(lastCompletions[a.id]) : null),
          }))
          .filter((x) => x.decay.status !== 'green');
        if (withDecay.length === 0) continue;
        withDecay.sort((a, b) => a.decay.percentage - b.decay.percentage);
        primaryAction = withDecay[0].action;
        secondaryActions = others.filter((a) => a.id !== primaryAction!.id);
      }

      const lastCompletedAt = lastCompletions[primaryAction.id]
        ? new Date(lastCompletions[primaryAction.id])
        : null;
      const decay = getActionDecay(primaryAction, lastCompletedAt);
      if (!matchesStatusFilter(decay.status, statusFilter)) continue;

      built.push({ card, primaryAction, secondaryActions, decay });
    }

    return built;
  }, [cards, actions, lastCompletions, selectedTag, statusFilter]);

  const groupedRows = useMemo(() => {
    const now = Date.now();
    const byGroup: Record<TimeOfDay, Row[]> = { morning: [], day: [], evening: [], anytime: [] };
    for (const row of rows) {
      byGroup[row.card.time_of_day ?? 'anytime'].push(row);
    }
    for (const key of Object.keys(byGroup) as TimeOfDay[]) {
      const groupRows = byGroup[key];
      const pinned = groupRows.filter((r) => (pinnedUntil.current[r.card.id] ?? 0) > now);
      const rest = sortByUrgency(
        groupRows
          .filter((r) => (pinnedUntil.current[r.card.id] ?? 0) <= now)
          .map((r) => ({ ...r, status: r.decay.status, percentage: r.decay.percentage }))
      );
      const merged: Row[] = [...rest];
      pinned
        .sort((a, b) => (pinnedIndex.current[a.card.id] ?? 0) - (pinnedIndex.current[b.card.id] ?? 0))
        .forEach((r) => {
          const idx = Math.min(pinnedIndex.current[r.card.id] ?? merged.length, merged.length);
          merged.splice(idx, 0, r);
        });
      byGroup[key] = merged;
    }
    return byGroup;
  }, [rows]);

  function handleComplete(action: Action, row: Row) {
    const group = groupedRows[row.card.time_of_day ?? 'anytime'];
    const idx = group.findIndex((r) => r.card.id === row.card.id);
    pinnedIndex.current[row.card.id] = idx >= 0 ? idx : group.length;
    pinnedUntil.current[row.card.id] = Date.now() + 3000;
    doComplete(action, row.card);
    setTimeout(() => forceRerender((v) => v + 1), 3010);
  }

  function handleStatusFilterPress() {
    Alert.alert(
      '看哪些状态',
      undefined,
      STATUS_FILTER_OPTIONS.map((opt) => ({ text: opt.label, onPress: () => setStatusFilter(opt.value) }))
    );
  }

  const hasAnyRows = rows.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <View style={{ flex: 1 }}>
          <TagFilter tags={allTags} selected={selectedTag} onSelect={setSelectedTag} onAddPress={onNewCardPress} />
        </View>
        <Pressable style={styles.statusFilterButton} onPress={handleStatusFilterPress}>
          <Text style={styles.statusFilterText}>{STATUS_FILTER_BADGE[statusFilter]} ▼</Text>
        </Pressable>
      </View>
      {selectedTag === CAT_TAG && <CatRow cats={cats} />}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {!hasAnyRows ? (
          <Text style={styles.empty}>这个筛选下还没有卡片</Text>
        ) : (
          TIME_OF_DAY_GROUPS.map(({ key, label }) => {
            const groupRows = groupedRows[key];
            if (groupRows.length === 0) return null;
            return (
              <View key={key}>
                <Text style={styles.groupHeader}>── {label} ──</Text>
                {groupRows.map((item) => (
                  <Card
                    key={item.card.id}
                    card={item.card}
                    primaryAction={item.primaryAction}
                    secondaryActions={item.secondaryActions}
                    decay={item.decay}
                    onComplete={(action) => handleComplete(action, item)}
                    onUndo={(action) => doUndo(action.id)}
                  />
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterRow: { flexDirection: 'row', alignItems: 'center' },
  statusFilterButton: {
    marginRight: spacing.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.button,
    backgroundColor: colors.card,
  },
  statusFilterText: { fontSize: fontSize.secondary, color: colors.textSecondary },
  list: { flex: 1 },
  listContent: { paddingTop: spacing.sm, paddingBottom: spacing.xl * 3 },
  groupHeader: {
    fontSize: fontSize.tiny,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    includeFontPadding: false,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.body,
    marginTop: spacing.xl,
  },
});
