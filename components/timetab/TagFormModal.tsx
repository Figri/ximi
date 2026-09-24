import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addTag, archiveTag, updateTag } from '../../lib/timelog';
import { ColorSwatchPicker } from './ColorSwatchPicker';
import type { TimeTag } from '../../types';

interface TagFormModalProps {
  visible: boolean;
  tag?: TimeTag | null;
  onClose: () => void;
  onSaved: () => void;
}

export function TagFormModal({ visible, tag, onClose, onSaved }: TagFormModalProps) {
  const isEdit = !!tag;
  const [name, setName] = useState('');
  const [color, setColor] = useState('#8E73B3');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(tag?.name ?? '');
    setColor(tag?.color ?? '#8E73B3');
  }, [visible, tag]);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('叫什么名字呢？', '标签名不能为空');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && tag) {
        await updateTag(tag.id, { name: name.trim(), color });
      } else {
        await addTag({ name: name.trim(), color });
      }
      onSaved();
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleArchive() {
    if (!tag) return;
    Alert.alert('归档这个标签？', tag.name, [
      { text: '取消', style: 'cancel' },
      {
        text: '归档',
        style: 'destructive',
        onPress: async () => {
          await archiveTag(tag.id);
          onSaved();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{isEdit ? '编辑情绪标签' : '新建情绪标签'}</Text>

          <Text style={styles.label}>名称</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="比如：崩溃" placeholderTextColor={colors.textMuted} />

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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,53,84,0.35)', justifyContent: 'center', padding: spacing.xl },
  sheet: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.lg },
  title: { fontSize: fontSize.cardName, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  label: { fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs },
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
