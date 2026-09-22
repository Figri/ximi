import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { createCard } from '../../lib/cards';
import type { Priority } from '../../types';

interface QuickAddBarProps {
  onAdded: () => void;
}

const DUE_OPTIONS: { label: string; days: number | null }[] = [
  { label: '不设', days: null },
  { label: '今天', days: 0 },
  { label: '明天', days: 1 },
  { label: '本周内', days: 7 },
];

export function QuickAddBar({ onAdded }: QuickAddBarProps) {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [dueDays, setDueDays] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleDuePress() {
    Alert.alert(
      '什么时候之前',
      undefined,
      DUE_OPTIONS.map((opt) => ({ text: opt.label, onPress: () => setDueDays(opt.days) }))
    );
  }

  async function handleSubmit() {
    const name = text.trim();
    if (!name || submitting) return;
    setSubmitting(true);
    try {
      let due_date: string | null = null;
      if (dueDays !== null) {
        const d = new Date();
        d.setHours(23, 59, 0, 0);
        d.setDate(d.getDate() + dueDays);
        due_date = d.toISOString();
      }
      await createCard(
        {
          name,
          type: 'info',
          tags: [],
          notes: null,
          display_type: 'todo',
          priority,
          due_date,
        },
        [{ name: '完成', is_primary: true, frequency_type: 'manual', interval_days: null, fixed_days: null, suggested_interval: null, max_delay: null, requires_selection: false }]
      );
      setText('');
      setPriority('normal');
      setDueDays(null);
      onAdded();
    } catch (err) {
      Alert.alert('加失败了', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.bar}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="写点什么..."
        placeholderTextColor={colors.textMuted}
        onSubmitEditing={handleSubmit}
        returnKeyType="done"
      />
      <Pressable style={[styles.iconButton, dueDays !== null && styles.iconButtonActive]} onPress={handleDuePress}>
        <Text style={styles.iconText}>⏰</Text>
      </Pressable>
      <Pressable
        style={[styles.iconButton, priority === 'important' && styles.iconButtonActive]}
        onPress={() => setPriority((p) => (p === 'important' ? 'normal' : 'important'))}
      >
        <Text style={styles.iconText}>❗</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.widget,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: { backgroundColor: colors.purpleLight },
  iconText: { fontSize: 16 },
});
