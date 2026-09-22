import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addTimelineEntry } from '../../lib/timeline';

interface AddEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}

const QUICK_ICONS = ['📝', '🍜', '😴', '💬', '🏥', '🎮', '💻', '🐱', '🚿', '📖'];

const AGO_OPTIONS: { label: string; minutes: number }[] = [
  { label: '刚刚', minutes: 0 },
  { label: '15分钟前', minutes: 15 },
  { label: '1小时前', minutes: 60 },
  { label: '2小时前', minutes: 120 },
];

function formatTime(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function AddEntryModal({ visible, onClose, onAdded }: AddEntryModalProps) {
  const [icon, setIcon] = useState('📝');
  const [description, setDescription] = useState('');
  const [agoMinutes, setAgoMinutes] = useState(0);
  const [saving, setSaving] = useState(false);

  const startTime = new Date(Date.now() - agoMinutes * 60_000);

  async function handleSave() {
    const text = description.trim();
    if (!text) {
      Alert.alert('写点什么呢？', '描述不能为空');
      return;
    }
    setSaving(true);
    try {
      await addTimelineEntry({ description: text, icon, start_time: startTime.toISOString() });
      setDescription('');
      setIcon('📝');
      setAgoMinutes(0);
      onAdded();
    } catch (err) {
      Alert.alert('记失败了', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>记一笔</Text>

          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>时间：{formatTime(startTime)}</Text>
          </View>
          <View style={styles.chipRow}>
            {AGO_OPTIONS.map((opt) => (
              <Pressable
                key={opt.minutes}
                onPress={() => setAgoMinutes(opt.minutes)}
                style={[styles.chip, agoMinutes === opt.minutes && styles.chipActive]}
              >
                <Text style={[styles.chipText, agoMinutes === opt.minutes && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>图标</Text>
          <View style={styles.chipRow}>
            {QUICK_ICONS.map((e) => (
              <Pressable key={e} onPress={() => setIcon(e)} style={[styles.iconChip, icon === e && styles.chipActive]}>
                <Text style={styles.iconText}>{e}</Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="发生了什么"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <View style={styles.actions}>
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
  },
  title: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  timeRow: { marginBottom: spacing.xs },
  timeLabel: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  label: { fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.button, backgroundColor: colors.background },
  chipActive: { backgroundColor: colors.purple },
  chipText: { fontSize: fontSize.body, color: colors.textSecondary },
  chipTextActive: { color: colors.textPrimary, fontWeight: '600' },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: radius.widget,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 18 },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    minHeight: 56,
    textAlignVertical: 'top',
    marginTop: spacing.sm,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
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
