import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addTimelineEntry } from '../../lib/timeline';
import { TIMELINE_CATEGORY_OPTIONS } from './CategoryConfig';
import type { TimelineCategory } from '../../types';

interface AddTimelineModalProps {
  visible: boolean;
  defaultCategory: TimelineCategory;
  onClose: () => void;
  onAdded: () => void;
}

export function AddTimelineModal({ visible, defaultCategory, onClose, onAdded }: AddTimelineModalProps) {
  const [category, setCategory] = useState<TimelineCategory>(defaultCategory);
  const [text, setText] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const weightNum = weight.trim() ? Number(weight.trim()) : null;
    if (category === 'body' && weight.trim() && Number.isNaN(weightNum)) {
      Alert.alert('体重要填数字', '比如 62.5');
      return;
    }
    const weightPrefix = weightNum != null ? `体重: ${weightNum}kg` : '';
    const fullText = [weightPrefix, text.trim()].filter(Boolean).join('\n');
    if (!fullText) {
      Alert.alert('写点什么吧', '内容不能是空的');
      return;
    }
    setSaving(true);
    try {
      await addTimelineEntry({ category, description: fullText });
      setText('');
      setWeight('');
      setCategory(defaultCategory);
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
          <Text style={styles.title}>记一笔</Text>
          <View style={styles.typeRow}>
            {TIMELINE_CATEGORY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.category}
                onPress={() => setCategory(opt.category)}
                style={[styles.chip, category === opt.category && styles.chipActive]}
              >
                <Text style={styles.chipEmoji}>{opt.emoji}</Text>
                <Text style={[styles.chipText, category === opt.category && styles.chipTextActive]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
          {category === 'body' && (
            <TextInput
              style={styles.input}
              value={weight}
              onChangeText={setWeight}
              placeholder="体重（kg，选填），比如 62.5"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
          )}
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="写点什么…"
            placeholderTextColor={colors.textMuted}
            multiline
            autoFocus
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
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.purple },
  chipEmoji: { fontSize: 14, includeFontPadding: false },
  chipText: { fontSize: fontSize.body, color: colors.textSecondary },
  chipTextActive: { color: colors.textPrimary, fontWeight: '600' },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  saveButton: {
    backgroundColor: colors.purpleDark,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontSize: fontSize.cardName, fontWeight: '600' },
});
