import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addCollection } from '../../lib/collections';

export function AddCollectionModal({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('起个名字', '收藏总得有个标题');
      return;
    }
    setSaving(true);
    try {
      await addCollection(name.trim(), content.trim(), url.trim() || null);
      setName('');
      setContent('');
      setUrl('');
      onAdded();
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>加个收藏</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="标题"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="链接（可以不填）"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="url"
          />
          <TextInput
            style={[styles.input, styles.contentInput]}
            value={content}
            onChangeText={setContent}
            placeholder="内容/备注（可以不填）"
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? '保存中…' : '保存'}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61, 53, 84, 0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: { fontSize: fontSize.pageTitle, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.md },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  contentInput: { minHeight: 70, textAlignVertical: 'top' },
  saveButton: {
    backgroundColor: colors.purpleDark,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontSize: fontSize.cardName, fontWeight: '600' },
});
