import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { archiveCard, createCard, fetchActionsForCard, fetchCard, updateAction, updateCard } from '../../lib/cards';
import { useCardStore } from '../../lib/store';
import type { Action, FrequencyType, TimeOfDay } from '../../types';

const TIME_SLOT_LABELS: Record<TimeOfDay, string> = {
  anytime: '⏰ 全天',
  morning: '🌅 早上',
  day: '☀️ 白天',
  evening: '🌙 晚上',
};
const TIME_SLOTS: TimeOfDay[] = ['anytime', 'morning', 'evening'];

type FreqChoice = 'daily' | 'fixed_day' | 'interval';
const FREQ_LABELS: Record<FreqChoice, string> = {
  daily: '每天',
  fixed_day: '指定星期几',
  interval: '每X天一次',
};
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function freqToChoice(type: FrequencyType, interval: number | null): FreqChoice {
  if (type === 'fixed_day') return 'fixed_day';
  if (type === 'interval' && interval && interval > 1) return 'interval';
  return 'daily';
}

export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const fetchAll = useCardStore((s) => s.fetchAll);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [cardId, setCardId] = useState<string | null>(isNew ? null : id);

  const [emoji, setEmoji] = useState('⭐');
  const [name, setName] = useState('');
  const [timeSlot, setTimeSlot] = useState<TimeOfDay>('anytime');
  const [freqChoice, setFreqChoice] = useState<FreqChoice>('daily');
  const [intervalDays, setIntervalDays] = useState('3');
  const [fixedDays, setFixedDays] = useState<number[]>([1]);
  const [requiresSelection, setRequiresSelection] = useState(false);
  const [primaryAction, setPrimaryAction] = useState<Action | null>(null);

  useEffect(() => {
    if (!isNew) loadCard(id);
  }, [id]);

  async function loadCard(cid: string) {
    setLoading(true);
    try {
      const [card, actions] = await Promise.all([fetchCard(cid), fetchActionsForCard(cid)]);
      if (card) {
        setEmoji(card.emoji ?? '⭐');
        setName(card.name);
        setTimeSlot(card.time_of_day ?? 'anytime');
      }
      const primary = actions.find((a) => a.is_primary) ?? null;
      setPrimaryAction(primary);
      if (primary) {
        setFreqChoice(freqToChoice(primary.frequency_type, primary.suggested_interval ?? primary.interval_days));
        setIntervalDays(String(primary.suggested_interval ?? primary.interval_days ?? 3));
        setFixedDays(primary.fixed_days ?? [1]);
        setRequiresSelection(primary.requires_selection);
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleFixedDay(day: number) {
    setFixedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  function buildFrequencyFields() {
    if (freqChoice === 'fixed_day') {
      return {
        frequency_type: 'fixed_day' as FrequencyType,
        fixed_days: fixedDays.length ? fixedDays : [1],
        suggested_interval: null,
        max_delay: null,
        interval_days: null,
      };
    }
    const interval = freqChoice === 'daily' ? 1 : Math.max(1, Number(intervalDays) || 1);
    return {
      frequency_type: 'interval' as FrequencyType,
      fixed_days: null,
      suggested_interval: interval,
      max_delay: Math.ceil(interval * 1.5),
      interval_days: interval,
    };
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('叫什么名字呢？', '习惯名字不能为空');
      return;
    }
    setSaving(true);
    try {
      const freq = buildFrequencyFields();
      if (isNew) {
        await createCard(
          {
            name: name.trim(),
            type: 'habit',
            tags: [],
            notes: null,
            time_of_day: timeSlot,
            emoji: emoji.trim() || '⭐',
            display_type: 'habit',
          },
          [
            {
              name: '完成',
              is_primary: true,
              frequency_type: freq.frequency_type,
              interval_days: freq.interval_days,
              fixed_days: freq.fixed_days,
              suggested_interval: freq.suggested_interval,
              max_delay: freq.max_delay,
              requires_selection: requiresSelection,
            },
          ]
        );
      } else if (cardId) {
        await updateCard(cardId, {
          name: name.trim(),
          time_of_day: timeSlot,
          emoji: emoji.trim() || '⭐',
        });
        if (primaryAction) {
          await updateAction(primaryAction.id, {
            frequency_type: freq.frequency_type,
            fixed_days: freq.fixed_days,
            suggested_interval: freq.suggested_interval,
            max_delay: freq.max_delay,
            requires_selection: requiresSelection,
          });
        }
      }
      await fetchAll();
      router.back();
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!cardId) return;
    Alert.alert('删除这个习惯？', name, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await archiveCard(cardId);
          await fetchAll();
          router.back();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>加载中…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>{isNew ? '新建习惯' : '编辑习惯'}</Text>

        <Text style={styles.label}>图标</Text>
        <TextInput style={styles.input} value={emoji} onChangeText={setEmoji} maxLength={4} />

        <Text style={styles.label}>名字</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="比如：刷牙" />

        <Text style={styles.label}>时间段</Text>
        <View style={styles.chipRow}>
          {TIME_SLOTS.map((slot) => (
            <Pressable
              key={slot}
              onPress={() => setTimeSlot(slot)}
              style={[styles.chip, timeSlot === slot && styles.chipActive]}
            >
              <Text style={[styles.chipText, timeSlot === slot && styles.chipTextActive]}>
                {TIME_SLOT_LABELS[slot]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>频率</Text>
        <View style={styles.chipRow}>
          {(Object.keys(FREQ_LABELS) as FreqChoice[]).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFreqChoice(f)}
              style={[styles.chip, freqChoice === f && styles.chipActive]}
            >
              <Text style={[styles.chipText, freqChoice === f && styles.chipTextActive]}>{FREQ_LABELS[f]}</Text>
            </Pressable>
          ))}
        </View>

        {freqChoice === 'fixed_day' && (
          <View style={styles.chipRow}>
            {WEEKDAY_LABELS.map((label, i) => {
              const day = i + 1;
              return (
                <Pressable
                  key={day}
                  onPress={() => toggleFixedDay(day)}
                  style={[styles.dayChip, fixedDays.includes(day) && styles.chipActive]}
                >
                  <Text style={[styles.chipText, fixedDays.includes(day) && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {freqChoice === 'interval' && (
          <View style={styles.row}>
            <Text style={styles.label}>每</Text>
            <TextInput
              style={[styles.input, styles.numberInput]}
              value={intervalDays}
              onChangeText={setIntervalDays}
              keyboardType="numeric"
            />
            <Text style={styles.label}>天一次</Text>
          </View>
        )}

        <View style={styles.switchRow}>
          <Text style={styles.label}>需要选猫（梳毛/剪指甲这类）</Text>
          <Switch value={requiresSelection} onValueChange={setRequiresSelection} />
        </View>

        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? '保存中…' : '保存'}</Text>
        </Pressable>

        {!isNew && (
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>删除这个习惯</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { textAlign: 'center', marginTop: spacing.xl, color: colors.textMuted },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  pageTitle: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  label: { fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  numberInput: { width: 64, textAlign: 'center', marginHorizontal: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.button, backgroundColor: colors.card },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: radius.avatar,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.purple },
  chipText: { fontSize: fontSize.body, color: colors.textSecondary },
  chipTextActive: { color: colors.textPrimary, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  saveButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.purpleDark,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontSize: fontSize.cardName, fontWeight: '600' },
  deleteButton: { marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.sm },
  deleteButtonText: { color: colors.redDark, fontSize: fontSize.body },
});
