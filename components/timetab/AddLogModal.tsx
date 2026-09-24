import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addLog, deleteLog, updateLog } from '../../lib/timelog';
import { useTimeLogStore } from '../../lib/timelogStore';
import type { TimeLog } from '../../types';

interface AddLogModalProps {
  visible: boolean;
  log?: TimeLog | null; // 有值=编辑，无值=新建
  initialCategoryId?: string | null;
  initialStart?: Date;
  initialEnd?: Date;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function categoryLabel(cat: { name: string; parent_id: string | null }, byId: Record<string, { name: string }>): string {
  if (cat.parent_id && byId[cat.parent_id]) return `${byId[cat.parent_id].name}·${cat.name}`;
  return cat.name;
}

export function AddLogModal({
  visible,
  log,
  initialCategoryId,
  initialStart,
  initialEnd,
  onClose,
  onSaved,
  onDeleted,
}: AddLogModalProps) {
  const { categories, tags } = useTimeLogStore();
  const isEdit = !!log;

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  const [description, setDescription] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [editingTime, setEditingTime] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (log) {
      setCategoryId(log.category_id);
      setStart(new Date(log.start_time));
      setEnd(new Date(log.end_time));
      setDescription(log.description ?? '');
      setTagIds(log.tag_ids ?? []);
    } else {
      setCategoryId(initialCategoryId ?? null);
      setStart(initialStart ?? new Date());
      setEnd(initialEnd ?? new Date());
      const cat = categories.find((c) => c.id === initialCategoryId);
      setDescription(cat?.default_description ?? '');
      setTagIds([]);
    }
    setEditingTime(false);
  }, [visible, log, initialCategoryId, initialStart, initialEnd]);

  const categoryById: Record<string, { name: string }> = {};
  for (const c of categories) categoryById[c.id] = c;

  function adjustStart(minutes: number) {
    setStart((prev) => {
      const next = new Date(prev.getTime() + minutes * 60_000);
      return next < end ? next : prev;
    });
  }

  function adjustEnd(minutes: number) {
    setEnd((prev) => {
      const next = new Date(prev.getTime() + minutes * 60_000);
      return next > start ? next : prev;
    });
  }

  function toggleTag(id: string) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function handleSave() {
    if (!categoryId) {
      Alert.alert('选个分类吧', '这段时间是做什么的？');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && log) {
        await updateLog(log.id, {
          category_id: categoryId,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          description: description.trim() || null,
          tag_ids: tagIds,
        });
      } else {
        await addLog({
          category_id: categoryId,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          description: description.trim() || null,
          tag_ids: tagIds,
        });
      }
      onSaved();
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!log) return;
    Alert.alert('删除这条记录？', description || undefined, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteLog(log.id);
          onDeleted?.();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{isEdit ? '编辑记录' : '记一笔'}</Text>

          <Text style={styles.label}>分类</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
            <View style={styles.chipRow}>
              {categories.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategoryId(c.id)}
                  style={[styles.catChip, { borderColor: c.color }, categoryId === c.id && { backgroundColor: c.color }]}
                >
                  <Text style={[styles.catChipText, categoryId === c.id && styles.catChipTextActive]}>
                    {categoryLabel(c, categoryById)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <View style={styles.timeRow}>
            <Text style={styles.timeText}>
              时间：{formatTime(start)} — {formatTime(end)}
            </Text>
            <Pressable onPress={() => setEditingTime((v) => !v)}>
              <Text style={styles.timeEditButton}>改{editingTime ? '▲' : '▼'}</Text>
            </Pressable>
          </View>
          {editingTime && (
            <View style={styles.timeAdjustRow}>
              <View style={styles.timeAdjustCol}>
                <Text style={styles.timeAdjustLabel}>开始</Text>
                <View style={styles.timeAdjustButtons}>
                  <Pressable style={styles.timeAdjustButton} onPress={() => adjustStart(-15)}>
                    <Text style={styles.timeAdjustButtonText}>-15</Text>
                  </Pressable>
                  <Pressable style={styles.timeAdjustButton} onPress={() => adjustStart(-5)}>
                    <Text style={styles.timeAdjustButtonText}>-5</Text>
                  </Pressable>
                  <Pressable style={styles.timeAdjustButton} onPress={() => adjustStart(5)}>
                    <Text style={styles.timeAdjustButtonText}>+5</Text>
                  </Pressable>
                  <Pressable style={styles.timeAdjustButton} onPress={() => adjustStart(15)}>
                    <Text style={styles.timeAdjustButtonText}>+15</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.timeAdjustCol}>
                <Text style={styles.timeAdjustLabel}>结束</Text>
                <View style={styles.timeAdjustButtons}>
                  <Pressable style={styles.timeAdjustButton} onPress={() => adjustEnd(-15)}>
                    <Text style={styles.timeAdjustButtonText}>-15</Text>
                  </Pressable>
                  <Pressable style={styles.timeAdjustButton} onPress={() => adjustEnd(-5)}>
                    <Text style={styles.timeAdjustButtonText}>-5</Text>
                  </Pressable>
                  <Pressable style={styles.timeAdjustButton} onPress={() => adjustEnd(5)}>
                    <Text style={styles.timeAdjustButtonText}>+5</Text>
                  </Pressable>
                  <Pressable style={styles.timeAdjustButton} onPress={() => adjustEnd(15)}>
                    <Text style={styles.timeAdjustButtonText}>+15</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          <Text style={styles.label}>正文</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="发生了什么"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <Text style={styles.label}>情绪</Text>
          <View style={styles.chipRow}>
            {tags.map((t) => {
              const active = tagIds.includes(t.id);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => toggleTag(t.id)}
                  style={[styles.tagChip, { borderColor: t.color }, active && { backgroundColor: t.color }]}
                >
                  <Text style={[styles.tagChipText, active && styles.catChipTextActive]}>{t.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            {isEdit && (
              <Pressable style={styles.deleteButton} onPress={handleDelete}>
                <Text style={styles.deleteButtonText}>删除</Text>
              </Pressable>
            )}
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
            <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>保存</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,53,84,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '88%',
  },
  title: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  label: { fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs },
  catScroll: { maxHeight: 40 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  catChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    borderWidth: 1.5,
    backgroundColor: colors.background,
  },
  catChipText: { fontSize: fontSize.body, color: colors.textSecondary },
  catChipTextActive: { color: '#fff', fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  timeText: { fontSize: fontSize.secondary, color: colors.textSecondary, flex: 1 },
  timeEditButton: { fontSize: fontSize.secondary, color: colors.blueDark },
  timeAdjustRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  timeAdjustCol: { flex: 1 },
  timeAdjustLabel: { fontSize: fontSize.tiny, color: colors.textMuted, marginBottom: 4 },
  timeAdjustButtons: { flexDirection: 'row', gap: 4 },
  timeAdjustButton: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: radius.widget,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  timeAdjustButtonText: { fontSize: fontSize.tiny, color: colors.textSecondary },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  tagChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    borderWidth: 1.5,
    backgroundColor: colors.background,
  },
  tagChipText: { fontSize: fontSize.body, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  deleteButton: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm, alignItems: 'center' },
  deleteButtonText: { color: colors.redDark, fontSize: fontSize.body },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  cancelText: { color: colors.textSecondary, fontSize: fontSize.body },
  saveButton: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.purpleDark,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: fontSize.body, fontWeight: '600' },
});
