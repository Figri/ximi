import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMemo, useState } from 'react';
import { Card } from './Card';
import { TagFilter } from './TagFilter';
import { CatRow } from './CatRow';
import { useCardStore } from '../lib/store';
import { getActionDecay } from '../lib/decay';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import type { Action, Card as CardType, Cat, DecayResult, DecayStatus } from '../types';

const CAT_TAG = '🐱猫';
const UNTAGGED = '未分类';

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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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
      const primaryAction = cardActions.find((a) => a.is_primary) ?? null;
      if (!primaryAction) continue;
      const secondaryActions = cardActions.filter((a) => !a.is_primary);

      const lastCompletedAt = lastCompletions[primaryAction.id]
        ? new Date(lastCompletions[primaryAction.id])
        : null;
      const decay = getActionDecay(primaryAction, lastCompletedAt);
      if (!matchesStatusFilter(decay.status, statusFilter)) continue;

      built.push({ card, primaryAction, secondaryActions, decay });
    }
    return built;
  }, [cards, actions, lastCompletions, selectedTag, statusFilter]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byTag: Record<string, Row[]> = {};
    for (const row of rows) {
      const tag = row.card.tags[0] ?? UNTAGGED;
      if (!byTag[tag]) {
        byTag[tag] = [];
        order.push(tag);
      }
      byTag[tag].push(row);
    }
    // 尽量按 allTags 的顺序排组，未在 allTags 里出现的（比如"未分类"）放最后
    const sortedOrder = [
      ...allTags.filter((t) => order.includes(t)),
      ...order.filter((t) => !allTags.includes(t)),
    ];
    return sortedOrder.map((tag) => ({ tag, rows: byTag[tag] }));
  }, [rows, allTags]);

  function handleStatusFilterPress() {
    Alert.alert(
      '看哪些状态',
      undefined,
      STATUS_FILTER_OPTIONS.map((opt) => ({ text: opt.label, onPress: () => setStatusFilter(opt.value) }))
    );
  }

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
        {groups.length === 0 ? (
          <Text style={styles.empty}>这个筛选下还没有卡片</Text>
        ) : (
          groups.map(({ tag, rows: groupRows }) => {
            const isCollapsed = collapsed[tag];
            return (
              <View key={tag} style={styles.group}>
                <Pressable
                  style={styles.groupHeader}
                  onPress={() => setCollapsed((prev) => ({ ...prev, [tag]: !prev[tag] }))}
                >
                  <Text style={styles.groupHeaderText}>
                    ── {tag} ── {isCollapsed ? '▶' : '▼'}
                  </Text>
                </Pressable>
                {!isCollapsed && (
                  <View style={styles.grid}>
                    {groupRows.map((item) => (
                      <Card
                        key={item.card.id}
                        card={item.card}
                        primaryAction={item.primaryAction}
                        secondaryActions={item.secondaryActions}
                        decay={item.decay}
                        onComplete={(action) => doComplete(action, item.card)}
                        onUndo={(action) => doUndo(action.id)}
                      />
                    ))}
                  </View>
                )}
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
  listContent: { paddingTop: spacing.sm, paddingBottom: spacing.xl * 3, paddingHorizontal: spacing.lg },
  group: { marginBottom: spacing.md },
  groupHeader: { paddingVertical: spacing.xs },
  groupHeaderText: {
    fontSize: fontSize.secondary,
    color: colors.textMuted,
    textAlign: 'center',
    includeFontPadding: false,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'flex-start',
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.body,
    marginTop: spacing.xl,
  },
});
