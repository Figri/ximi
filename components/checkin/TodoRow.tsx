import { useRef } from 'react';
import { Alert, Animated, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { archiveCard } from '../../lib/cards';
import type { Action, Card } from '../../types';

interface TodoRowProps {
  card: Card;
  action: Action;
  done: boolean;
  onComplete: (action: Action) => void;
  onUndo: (action: Action) => void;
  onDeleted: () => void;
}

function formatDue(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function TodoRow({ card, action, done, onComplete, onUndo, onDeleted }: TodoRowProps) {
  const due = formatDue(card.due_date);
  const overdue = card.due_date && !done && new Date(card.due_date).getTime() < Date.now();
  const scale = useRef(new Animated.Value(1)).current;

  function handleCheckboxPress() {
    if (done) {
      onUndo(action);
      return;
    }
    onComplete(action);
    Vibration.vibrate(12);
    scale.setValue(0.8);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start();
  }

  function handleLongPress() {
    Alert.alert('删除这条事项？', card.name, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await archiveCard(card.id);
          onDeleted();
        },
      },
    ]);
  }

  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push(`/todo/${card.id}`)}
      onLongPress={handleLongPress}
    >
      <Pressable hitSlop={10} style={styles.checkboxHit} onPress={handleCheckboxPress}>
        <Animated.View style={[styles.checkbox, done && styles.checkboxDone, { transform: [{ scale }] }]}>
          {done && <Text style={styles.checkMark}>✓</Text>}
        </Animated.View>
      </Pressable>
      <Text style={[styles.title, done && styles.titleDone]} numberOfLines={1}>
        {card.name}
      </Text>
      {due && <Text style={[styles.due, overdue && styles.dueOverdue]}>{due}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  checkboxHit: { padding: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.widget - 4,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  checkboxDone: { backgroundColor: colors.greenDark, borderColor: colors.greenDark },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  title: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary },
  titleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  due: { fontSize: fontSize.secondary, color: colors.textMuted, marginLeft: spacing.sm },
  dueOverdue: { color: colors.redDark, fontWeight: '600' },
});
