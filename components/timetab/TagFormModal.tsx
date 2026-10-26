import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { genId } from '../../lib/timelogLocal';
import { useTimeLogStore } from '../../lib/timelogStore';
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
  const { tags, upsertTag, removeTag } = useTimeLogStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#8E73B3');
  const [saving, setSaving] = useState(false);
  // 不弹系统框：没写名字、没存上就在按钮上面说一句；删除点一下变「再点删除」
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setConfirmDelete(false);
    setName(tag?.name ?? '');
    setColor(tag?.color ?? '#8E73B3');
  }, [visible, tag]);

  async function handleSave() {
    if (!name.trim()) {
      setError('起个名字吧');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (isEdit && tag) {
        await upsertTag({ ...tag, name: name.trim(), color });
      } else {
        await upsertTag({
          id: genId(),
          name: name.trim(),
          color,
          sort_order: tags.length + 1,
          archived: false,
          created_at: new Date().toISOString(),
        });
      }
      onSaved();
    } catch (err) {
      setError(`没存上：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!tag) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await removeTag(tag.id);
    onSaved();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior="padding" style={styles.avoider}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>{isEdit ? '编辑情绪标签' : '新建情绪标签'}</Text>

            <Text style={styles.label}>名称</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(t) => {
                setName(t);
                setError(null);
              }}
              placeholder="比如：崩溃"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.label}>颜色</Text>
            <ColorSwatchPicker value={color} onChange={setColor} compact />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {confirmDelete && !error ? <Text style={styles.deleteHint}>再点一次就删掉；以前挂过它的记录照旧显示</Text> : null}
            <View style={styles.actions}>
              {isEdit && (
                <Pressable style={styles.archiveButton} onPress={handleDelete}>
                  <Text style={styles.archiveButtonText}>{confirmDelete ? '再点删除' : '删除'}</Text>
                </Pressable>
              )}
              <Pressable style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>取消</Text>
              </Pressable>
              <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>保存</Text>}
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,53,84,0.35)', justifyContent: 'center', padding: spacing.xl },
  avoider: { width: '100%' },
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
  error: { fontSize: fontSize.secondary, color: colors.redDark, marginTop: spacing.md },
  deleteHint: { fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: spacing.md },
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
