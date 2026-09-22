import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { archiveCard, fetchCard, updateCard } from '../../lib/cards';
import { useCardStore } from '../../lib/store';
import type { Priority } from '../../types';

const DUE_OPTIONS: { label: string; days: number | null }[] = [
  { label: '不设', days: null },
  { label: '今天', days: 0 },
  { label: '明天', days: 1 },
  { label: '本周内', days: 7 },
  { label: '下周', days: 14 },
];

function formatDue(dueDate: string | null): string {
  if (!dueDate) return '不设';
  const d = new Date(dueDate);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function TodoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fetchAll = useCardStore((s) => s.fetchAll);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [dueDate, setDueDate] = useState<string | null>(null);

  useEffect(() => {
    fetchCard(id).then((card) => {
      if (card) {
        setName(card.name);
        setNotes(card.notes ?? '');
        setPriority(card.priority);
        setDueDate(card.due_date);
      }
      setLoading(false);
    });
  }, [id]);

  function handleDuePress() {
    Alert.alert(
      '什么时候之前',
      undefined,
      DUE_OPTIONS.map((opt) => ({
        text: opt.label,
        onPress: () => {
          if (opt.days === null) {
            setDueDate(null);
            return;
          }
          const d = new Date();
          d.setHours(23, 59, 0, 0);
          d.setDate(d.getDate() + opt.days);
          setDueDate(d.toISOString());
        },
      }))
    );
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('写点什么吧', '标题不能为空');
      return;
    }
    setSaving(true);
    try {
      await updateCard(id, {
        name: name.trim(),
        notes: notes.trim() || null,
        priority,
        due_date: dueDate,
      });
      await fetchAll();
      router.back();
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert('删除这条事项？', name, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await archiveCard(id);
          await fetchAll();
          router.back();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>加载中…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>编辑事项</Text>

        <Text style={styles.label}>标题</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="做什么" />

        <Text style={styles.label}>优先级</Text>
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setPriority('important')}
            style={[styles.chip, priority === 'important' && styles.chipActive]}
          >
            <Text style={[styles.chipText, priority === 'important' && styles.chipTextActive]}>🔴 重要</Text>
          </Pressable>
          <Pressable
            onPress={() => setPriority('normal')}
            style={[styles.chip, priority === 'normal' && styles.chipActive]}
          >
            <Text style={[styles.chipText, priority === 'normal' && styles.chipTextActive]}>⚪ 普通</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>截止时间</Text>
        <Pressable style={styles.input} onPress={handleDuePress}>
          <Text style={styles.dueText}>{formatDue(dueDate)}</Text>
        </Pressable>

        <Text style={styles.label}>备注</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="随便写点什么"
          multiline
        />

        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? '保存中…' : '保存'}</Text>
        </Pressable>

        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>删除这条事项</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { textAlign: 'center', marginTop: spacing.xl, color: colors.textMuted },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  pageTitle: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  label: { fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  dueText: { fontSize: fontSize.body, color: colors.textPrimary },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.button, backgroundColor: colors.card },
  chipActive: { backgroundColor: colors.purple },
  chipText: { fontSize: fontSize.body, color: colors.textSecondary },
  chipTextActive: { color: colors.textPrimary, fontWeight: '600' },
  saveButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.purpleDark,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontSize: fontSize.cardName, fontWeight: '600' },
  deleteButton: { marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.sm },
  deleteButtonText: { color: colors.redDark, fontSize: fontSize.body },
});
