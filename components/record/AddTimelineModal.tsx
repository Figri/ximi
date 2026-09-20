import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);

  const [defaultStart, setDefaultStart] = useState<Date | null>(null);
  const [editingTime, setEditingTime] = useState(false);
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

  const categoryLabel = TIMELINE_CATEGORY_OPTIONS.find((o) => o.category === category);

  function handlePickCategory() {
    Alert.alert(
      '选分类',
      undefined,
      TIMELINE_CATEGORY_OPTIONS.map((opt) => ({
        text: `${opt.emoji} ${opt.label}`,
        onPress: () => setCategory(opt.category),
      }))
    );
  }

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
    if (!title.trim()) {
      Alert.alert('起个标题吧', '比如"色色"、"学习"这种简短的');
      return;
    }
    const weightNum = weight.trim() ? Number(weight.trim()) : null;
    if (category === 'body' && weight.trim() && Number.isNaN(weightNum)) {
      Alert.alert('体重要填数字', '比如 62.5');
      return;
    }
    const weightPrefix = weightNum != null ? `体重: ${weightNum}kg` : '';
    const fullText = [title.trim(), weightPrefix, text.trim()].filter(Boolean).join('\n');
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
      setTitle('');
      setText('');
      setWeight('');
      setDurationLabel(null);
      setCustomMinutes('');
      setEditingTime(false);
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
          <Text style={styles.title}>📝 记录事件</Text>

          <View style={styles.timeRow}>
            <Text style={styles.timeText}>
              时间：{startTime ? formatTime(startTime) : '--'} — {formatTime(now)}
              {effectiveMinutes == null ? '（现在）' : ''}
            </Text>
            <Pressable onPress={() => setEditingTime((v) => !v)}>
              <Text style={styles.timeEditButton}>改{editingTime ? '▲' : '▼'}</Text>
            </Pressable>
          </View>
          {editingTime && (
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
          )}
          {editingTime && durationLabel === '自定义' && (
            <TextInput
              style={styles.input}
              value={customMinutes}
              onChangeText={setCustomMinutes}
              placeholder="多少分钟"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
            />
          )}

          <View style={styles.row}>
            <Text style={styles.rowLabel}>标题</Text>
            <TextInput
              style={[styles.input, styles.rowInput]}
              value={title}
              onChangeText={setTitle}
              placeholder="做了什么"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>分类</Text>
            <Pressable style={[styles.input, styles.rowInput, styles.categoryPicker]} onPress={handlePickCategory}>
              <Text style={styles.categoryPickerText}>
                {categoryLabel?.emoji} {categoryLabel?.label} ▼
              </Text>
            </Pressable>
          </View>

          {category === 'body' && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>体重</Text>
              <TextInput
                style={[styles.input, styles.rowInput]}
                value={weight}
                onChangeText={setWeight}
                placeholder="kg，选填"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>
          )}

          <TextInput
            style={styles.descInput}
            value={text}
            onChangeText={setText}
            placeholder="描述（选填）…"
            placeholderTextColor={colors.textMuted}
            multiline
            scrollEnabled
          />

          <Pressable style={styles.imageButton} onPress={() => handlePickImage('library')} disabled={pickingImage}>
            {pickingImage ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={styles.imageButtonText}>{imageUri ? '📷 已加图片，点击重选' : '📷 加图片'}</Text>
            )}
          </Pressable>

          <View style={styles.deltaRow}>
            <Text style={styles.deltaLabel}>HP</Text>
            {HP_MP_DELTAS.map((d) => (
              <Pressable
                key={d}
                onPress={() => setHpChange(hpChange === d ? null : d)}
                style={[styles.deltaChip, hpChange === d && styles.chipActive]}
              >
                <Text style={[styles.deltaChipText, hpChange === d && styles.chipTextActive]}>
                  {d > 0 ? `+${d}` : d}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.deltaRow}>
            <Text style={styles.deltaLabel}>MP</Text>
            {HP_MP_DELTAS.map((d) => (
              <Pressable
                key={d}
                onPress={() => setMpChange(mpChange === d ? null : d)}
                style={[styles.deltaChip, mpChange === d && styles.chipActive]}
              >
                <Text style={[styles.deltaChipText, mpChange === d && styles.chipTextActive]}>
                  {d > 0 ? `+${d}` : d}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? '保存中…' : '确定'}</Text>
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
  title: { fontSize: fontSize.pageTitle, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.sm },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  timeText: { fontSize: fontSize.secondary, color: colors.textSecondary, flex: 1 },
  timeEditButton: { fontSize: fontSize.secondary, color: colors.blueDark },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  rowLabel: { width: 36, fontSize: fontSize.secondary, color: colors.textSecondary },
  rowInput: { flex: 1, marginBottom: 0 },
  categoryPicker: { justifyContent: 'center' },
  categoryPickerText: { fontSize: fontSize.body, color: colors.textPrimary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs },
  smallChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.button,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.purple },
  chipText: { fontSize: fontSize.secondary, color: colors.textSecondary },
  chipTextActive: { color: colors.textPrimary, fontWeight: '600' },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  descInput: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    height: 56,
    textAlignVertical: 'top',
    marginBottom: spacing.xs,
  },
  imageButton: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingVertical: 6,
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  imageButtonText: { fontSize: fontSize.secondary, color: colors.textSecondary },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  deltaLabel: { width: 24, fontSize: fontSize.tiny, color: colors.textMuted },
  deltaChip: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  deltaChipText: { fontSize: fontSize.tiny, color: colors.textSecondary },
  saveButton: {
    backgroundColor: colors.purpleDark,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveButtonText: { color: '#fff', fontSize: fontSize.cardName, fontWeight: '600' },
});
