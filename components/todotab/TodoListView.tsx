import { StyleSheet, Text, View, Pressable } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { formatRepeatLabel, isDoneOnDate } from '../../lib/todo';
import type { TodoCategory, TodoCompletion, TodoItem } from '../../types';

interface TodoListViewProps {
  items: TodoItem[];
  dateKey: string; // 判断/写完成状态用的那一天
  categoryById: Record<string, TodoCategory>;
  completions: TodoCompletion[];
  onToggleDone: (item: TodoItem, done: boolean) => void;
  onToggleImportant: (item: TodoItem) => void;
  onPressItem: (item: TodoItem) => void;
  emptyText?: string;
}

export function TodoListView({
  items,
  dateKey,
  categoryById,
  completions,
  onToggleDone,
  onToggleImportant,
  onPressItem,
  emptyText,
}: TodoListViewProps) {
  const unfinished: TodoItem[] = [];
  const finished: TodoItem[] = [];
  for (const item of items) {
    if (isDoneOnDate(item, dateKey, completions)) finished.push(item);
    else unfinished.push(item);
  }

  function renderRow(item: TodoItem, done: boolean) {
    const cat = item.category_id ? categoryById[item.category_id] : null;
    const catColor = cat?.color ?? colors.textMuted;
    const repeatLabel = formatRepeatLabel(item);
    return (
      <Pressable key={item.id} style={[styles.row, done && styles.rowDone]} onPress={() => onPressItem(item)}>
        <Pressable hitSlop={8} onPress={() => onToggleImportant(item)}>
          <Text style={styles.star}>{item.important ? '★' : '☆'}</Text>
        </Pressable>
        <Text style={[styles.content, done && styles.contentDone]} numberOfLines={2}>
          {item.content}
        </Text>
        {repeatLabel && (
          <View style={styles.repeatChip}>
            <Text style={styles.repeatChipText}>{repeatLabel}</Text>
          </View>
        )}
        <Pressable
          hitSlop={8}
          onPress={() => onToggleDone(item, !done)}
          style={[
            styles.checkCircle,
            { borderColor: catColor },
            done && { backgroundColor: catColor, borderColor: catColor },
          ]}
        >
          {done && <Text style={styles.checkMark}>✓</Text>}
        </Pressable>
      </Pressable>
    );
  }

  if (items.length === 0) {
    return <Text style={styles.empty}>{emptyText ?? '这天还没有事项'}</Text>;
  }

  return (
    <View>
      {unfinished.map((item) => renderRow(item, false))}

      {finished.length > 0 && (
        <>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>已完成</Text>
            <View style={styles.dividerLine} />
          </View>
          {finished.map((item) => renderRow(item, true))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  rowDone: { opacity: 0.55 },
  star: { fontSize: 18, color: colors.yellowDark },
  content: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary },
  contentDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  repeatChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.button, backgroundColor: colors.background },
  repeatChipText: { fontSize: fontSize.tiny, color: colors.textSecondary },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.textMuted, opacity: 0.3 },
  dividerText: { fontSize: fontSize.tiny, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.body, paddingVertical: spacing.lg },
});
