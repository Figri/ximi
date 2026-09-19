import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addWorry } from '../../lib/worries';
import type { WorrySeverity } from '../../types';

const SEVERITIES: { value: WorrySeverity; label: string }[] = [
  { value: 'light', label: '轻' },
  { value: 'medium', label: '中' },
  { value: 'heavy', label: '重' },
];

export function AddWorryModal({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [content, setContent] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [severity, setSeverity] = useState<WorrySeverity>('medium');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!content.trim()) {
      Alert.alert('说说看', '内容不能是空的');
      return;
    }
    setSaving(true);
    try {
      const tags = tagInput
        .split(/[\s,，]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      await addWorry(content.trim(), tags, severity);
      setContent('');
      setTagInput('');
      setSeverity('medium');
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
          <Text style={styles.title}>说说什么烦恼</Text>
          <TextInput
            style={styles.input}
            value={content}
            onChangeText={setContent}
            placeholder="发生什么了…"
            placeholderTextColor={colors.textMuted}
            multiline
            autoFocus
          />
          <TextInput
            style={styles.input}
            value={tagInput}
            onChangeText={setTagInput}
            placeholder="标签，比如 💔感情 🐱猫（可以不填）"
            placeholderTextColor={colors.textMuted}
          />
          <View style={styles.severityRow}>
            {SEVERITIES.map((s) => (
              <Pressable
                key={s.value}
                onPress={() => setSeverity(s.value)}
                style={[styles.severityChip, severity === s.value && styles.severityChipActive]}
              >
                <Text style={[styles.severityText, severity === s.value && styles.severityTextActive]}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>
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
  severityRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  severityChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    backgroundColor: colors.card,
  },
  severityChipActive: { backgroundColor: colors.purple },
  severityText: { fontSize: fontSize.body, color: colors.textSecondary },
  severityTextActive: { color: colors.textPrimary, fontWeight: '600' },
  saveButton: {
    backgroundColor: colors.purpleDark,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontSize: fontSize.cardName, fontWeight: '600' },
});
