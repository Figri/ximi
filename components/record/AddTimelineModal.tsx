import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { addTimelineEntry, fetchLastEntryEnd } from '../../lib/timeline';
import { pickImage, uploadChatImage } from '../../lib/chatImages';
import { TIMELINE_CATEGORY_OPTIONS } from './CategoryConfig';
import type { TimelineCategory } from '../../types';

interface AddTimelineModalProps {
  visible: boolean;
  defaultCategory: TimelineCategory;
  onClose: () => void;
  onAdded: () => void;
}

const DURATION_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: '15分钟', minutes: 15 },
  { label: '30分钟', minutes: 30 },
  { label: '1小时', minutes: 60 },
  { label: '2小时', minutes: 120 },
  { label: '自定义', minutes: null },
];

const HP_MP_DELTAS = [-10, -5, -3, -1, 1, 3, 5, 10];

function formatTime(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function AddTimelineModal({ visible, defaultCategory, onClose, onAdded }: AddTimelineModalProps) {
  const [category, setCategory] = useState<TimelineCategory>(defaultCategory);
  const [text, setText] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);

  const [defaultStart, setDefaultStart] = useState<Date | null>(null);
  const [durationLabel, setDurationLabel] = useState<string | null>(null); // null = 默认区间
  const [customMinutes, setCustomMinutes] = useState('');
  const [hpChange, setHpChange] = useState<number | null>(null);
  const [mpChange, setMpChange] = useState<number | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [pickingImage, setPickingImage] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCategory(defaultCategory);
    fetchLastEntryEnd()
      .then((d) => {
        if (d) return setDefaultStart(d);
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        setDefaultStart(midnight);
      })
      .catch(() => setDefaultStart(null));
  }, [visible, defaultCategory]);

  const now = new Date();
  const selectedDuration = DURATION_OPTIONS.find((o) => o.label === durationLabel);
  const effectiveMinutes =
    selectedDuration?.minutes ?? (durationLabel === '自定义' ? Number(customMinutes) || 0 : null);
  const startTime = effectiveMinutes != null ? new Date(now.getTime() - effectiveMinutes * 60_000) : defaultStart;

  async function handlePickImage(source: 'camera' | 'library') {
    setPickingImage(true);
    try {
      const uri = await pickImage(source);
      if (!uri) return;
      const url = await uploadChatImage(uri);
      setImageUri(url);
    } catch (err) {
      Alert.alert('加图片失败', err instanceof Error ? err.message : String(err));
    } finally {
      setPickingImage(false);
    }
  }

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
      await addTimelineEntry({
        category,
        description: fullText,
        start_time: (startTime ?? now).toISOString(),
        end_time: now.toISOString(),
        hp_change: hpChange,
        mp_change: mpChange,
        image_url: imageUri,
      });
      setText('');
      setWeight('');
      setDurationLabel(null);
      setCustomMinutes('');
      setHpChange(null);
      setMpChange(null);
      setImageUri(null);
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
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>📝 记录事件</Text>

            <Text style={styles.label}>
              时间：{startTime ? formatTime(startTime) : '--'} — {formatTime(now)}
              {effectiveMinutes == null ? '（现在）' : ''}
            </Text>
            <View style={styles.chipRow}>
              {DURATION_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.label}
                  onPress={() => setDurationLabel(durationLabel === opt.label ? null : opt.label)}
                  style={[styles.smallChip, durationLabel === opt.label && styles.chipActive]}
                >
                  <Text style={[styles.chipText, durationLabel === opt.label && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {durationLabel === '自定义' && (
              <TextInput
                style={styles.input}
                value={customMinutes}
                onChangeText={setCustomMinutes}
                placeholder="多少分钟"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
              />
            )}

            <Text style={styles.label}>做了什么</Text>
            <View style={styles.chipRow}>
              {TIMELINE_CATEGORY_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.category}
                  onPress={() => setCategory(opt.category)}
                  style={[styles.chip, category === opt.category && styles.chipActive]}
                >
                  <Text style={styles.chipEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.chipText, category === opt.category && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
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

            <Text style={styles.label}>备注（选填）</Text>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="写点什么…"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <Pressable style={styles.imageButton} onPress={() => handlePickImage('library')} disabled={pickingImage}>
              {pickingImage ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text style={styles.imageButtonText}>{imageUri ? '📷 已加图片，点击重选' : '📷 加图片'}</Text>
              )}
            </Pressable>

            <Text style={styles.label}>HP 变化</Text>
            <View style={styles.chipRow}>
              {HP_MP_DELTAS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setHpChange(hpChange === d ? null : d)}
                  style={[styles.deltaChip, hpChange === d && styles.chipActive]}
                >
                  <Text style={[styles.chipText, hpChange === d && styles.chipTextActive]}>
                    {d > 0 ? `+${d}` : d}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>MP 变化</Text>
            <View style={styles.chipRow}>
              {HP_MP_DELTAS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setMpChange(mpChange === d ? null : d)}
                  style={[styles.deltaChip, mpChange === d && styles.chipActive]}
                >
                  <Text style={[styles.chipText, mpChange === d && styles.chipTextActive]}>
                    {d > 0 ? `+${d}` : d}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveButtonText}>{saving ? '保存中…' : '确定'}</Text>
            </Pressable>
          </ScrollView>
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
    maxHeight: '85%',
  },
  title: { fontSize: fontSize.pageTitle, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.md },
  label: {
    fontSize: fontSize.secondary,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    backgroundColor: colors.card,
  },
  smallChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    backgroundColor: colors.card,
  },
  deltaChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    minWidth: 40,
    alignItems: 'center',
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
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  imageButton: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  imageButtonText: { fontSize: fontSize.body, color: colors.textSecondary },
  saveButton: {
    backgroundColor: colors.purpleDark,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveButtonText: { color: '#fff', fontSize: fontSize.cardName, fontWeight: '600' },
});
