import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addCategory, archiveCategory, updateCategory } from '../../lib/timelog';
import { ColorSwatchPicker } from './ColorSwatchPicker';
import type { TimeCategory } from '../../types';

interface CategoryFormModalProps {
  visible: boolean;
  category?: TimeCategory | null; // 有值=编辑
  defaultParentId?: string | null; // 新建次级分类时预填父级
  topLevelCategories: TimeCategory[];
  onClose: () => void;
  onSaved: () => void;
}

export function CategoryFormModal({
  visible,
  category,
  defaultParentId,
  topLevelCategories,
  onClose,
  onSaved,
}: CategoryFormModalProps) {
  const isEdit = !!category;
  const [isSub, setIsSub] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [defaultDescription, setDefaultDescription] = useState('');
  const [color, setColor] = useState('#A78BCE');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (category) {
      setIsSub(!!category.parent_id);
      setParentId(category.parent_id);
      setName(category.name);
      setDefaultDescription(category.default_description ?? '');
      setColor(category.color);
    } else {
      setIsSub(!!defaultParentId);
      setParentId(defaultParentId ?? null);
      setName('');
      setDefaultDescription('');
      setColor('#A78BCE');
    }
  }, [visible, category, defaultParentId]);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('叫什么名字呢？', '分类名不能为空');
      return;
    }
    if (isSub && !parentId) {
      Alert.alert('选个一级分类', '次级分类要挂在某个一级分类下面');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && category) {
        await updateCategory(category.id, {
          name: name.trim(),
          color,
          default_description: defaultDescription.trim() || null,
        });
      } else {
        await addCategory({
          name: name.trim(),
          color,
          parent_id: isSub ? parentId : null,
          default_description: defaultDescription.trim() || null,
        });
      }
      onSaved();
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleArchive() {
    if (!category) return;
    Alert.alert('归档这个分类？', `${category.name}（归档后不会出现在选择列表里，历史记录不受影响）`, [
      { text: '取消', style: 'cancel' },
      {
        text: '归档',
        style: 'destructive',
        onPress: async () => {
          await archiveCategory(category.id);
          onSaved();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
          <Text style={styles.title}>{isEdit ? '编辑分类' : '新建分类'}</Text>

          {!isEdit && (
            <View style={styles.chipRow}>
              <Pressable onPress={() => setIsSub(false)} style={[styles.chip, !isSub && styles.chipActive]}>
                <Text style={[styles.chipText, !isSub && styles.chipTextActive]}>一级分类</Text>
              </Pressable>
              <Pressable onPress={() => setIsSub(true)} style={[styles.chip, isSub && styles.chipActive]}>
                <Text style={[styles.chipText, isSub && styles.chipTextActive]}>次级分类</Text>
              </Pressable>
            </View>
          )}

          {isSub && !isEdit && (
            <>
              <Text style={styles.label}>挂在哪个一级分类下</Text>
              <View style={styles.chipRow}>
                {topLevelCategories.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setParentId(c.id)}
                    style={[styles.chip, { borderColor: c.color }, parentId === c.id && { backgroundColor: c.color }]}
                  >
                    <Text style={[styles.chipText, parentId === c.id && styles.chipTextActive]}>{c.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>分类名称</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="请输入标题" placeholderTextColor={colors.textMuted} />

          <Text style={styles.label}>默认描述</Text>
          <TextInput
            style={styles.input}
            value={defaultDescription}
            onChangeText={setDefaultDescription}
            placeholder="建这类记录时自动预填的正文，不填就空着"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>颜色</Text>
          <ColorSwatchPicker value={color} onChange={setColor} />

          <View style={styles.actions}>
            {isEdit && (
              <Pressable style={styles.archiveButton} onPress={handleArchive}>
                <Text style={styles.archiveButtonText}>归档</Text>
              </Pressable>
            )}
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
            <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>保存</Text>}
            </Pressable>
          </View>
        </ScrollView>
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
    maxHeight: '88%',
  },
  sheetContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  label: { fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.button, borderWidth: 1.5, borderColor: colors.card, backgroundColor: colors.background },
  chipActive: { backgroundColor: colors.purple },
  chipText: { fontSize: fontSize.body, color: colors.textSecondary },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  archiveButton: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm, alignItems: 'center' },
  archiveButtonText: { color: colors.redDark, fontSize: fontSize.body },
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
