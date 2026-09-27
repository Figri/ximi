import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { genId } from '../../lib/timelogLocal';
import { useTimeLogStore } from '../../lib/timelogStore';
import { ColorSwatchPicker } from './ColorSwatchPicker';
import type { TimeCategory } from '../../types';

interface CategoryFormModalProps {
  visible: boolean;
  category?: TimeCategory | null; // 有值=编辑
  onClose: () => void;
  onSaved: () => void;
}

const COLOR_POOL = [
  '#8B7BA8', '#8B5E2B', '#A78BCE', '#5CB88A', '#F5B841', '#E86F52',
  '#2E6DB4', '#3E3A7A', '#1FA69A', '#E8D96F', '#8B5A2B', '#7A857D', '#9B3B3B',
];

function autoColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOR_POOL[h % COLOR_POOL.length];
}

export function CategoryFormModal({ visible, category, onClose, onSaved }: CategoryFormModalProps) {
  const isEdit = !!category;
  const { categories, upsertCategory, removeCategory } = useTimeLogStore();
  const [name, setName] = useState('');
  const [defaultDescription, setDefaultDescription] = useState('');
  const [color, setColor] = useState('#A78BCE');
  const [colorTouched, setColorTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (category) {
      setName(category.name);
      setDefaultDescription(category.default_description ?? '');
      setColor(category.color);
      setColorTouched(true);
    } else {
      setName('');
      setDefaultDescription('');
      setColor(autoColor(''));
      setColorTouched(false);
    }
  }, [visible, category]);

  // 新建时没手动选过色，名字变了颜色跟着按名字自动换；一旦手动碰过颜色就不再跟随
  function handleNameChange(next: string) {
    setName(next);
    if (!isEdit && !colorTouched) setColor(autoColor(next));
  }

  function handleColorChange(next: string) {
    setColor(next);
    setColorTouched(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('叫什么名字呢？', '分类名不能为空');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && category) {
        await upsertCategory({
          ...category,
          name: name.trim(),
          color,
          default_description: defaultDescription.trim() || null,
        });
      } else {
        await upsertCategory({
          id: genId(),
          name: name.trim(),
          color,
          default_description: defaultDescription.trim() || null,
          parent_id: null,
          sort_order: categories.length + 1,
          archived: false,
          created_at: new Date().toISOString(),
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
    if (!category) return;
    Alert.alert('删除这个分类？', `${category.name}（历史记录里已经记过的不受影响）`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await removeCategory(category.id);
          onSaved();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.avoider}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.title}>{isEdit ? '编辑分类' : '新建分类'}</Text>

              <Text style={styles.label}>分类名称</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={handleNameChange}
                placeholder="请输入标题"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.label}>默认描述</Text>
              <TextInput
                style={styles.input}
                value={defaultDescription}
                onChangeText={setDefaultDescription}
                placeholder="建这类记录时自动预填的正文，不填就空着"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.label}>颜色</Text>
              <ColorSwatchPicker value={color} onChange={handleColorChange} />

              <View style={styles.actions}>
                {isEdit && (
                  <Pressable style={styles.archiveButton} onPress={handleDelete}>
                    <Text style={styles.archiveButtonText}>删除</Text>
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
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,53,84,0.35)', justifyContent: 'flex-end' },
  avoider: { width: '100%' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    maxHeight: '88%',
  },
  sheetContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  label: { fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
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
