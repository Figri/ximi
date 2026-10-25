import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { archiveCard, createCard, fetchActionsForCard, fetchAllTags, fetchCard, fetchCards, updateAction, updateCard } from '../../lib/cards';
import { useCardStore } from '../../lib/store';
import { rescheduleAll } from '../../lib/ling/proactive';
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
  interval: '做完隔几天',
  fixed_day: '每周固定几天',
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
  // 分类：卡片的第一个标签，「今天 → 该照顾的」按它分组（猫、打扫……）；其余标签原样留着
  const [group, setGroup] = useState<string | null>(null);
  const [otherTags, setOtherTags] = useState<string[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  // 到日子提醒我：存在主动作的 remind_at（'HH:MM'），灵按约定提醒那套发
  const [remindOn, setRemindOn] = useState(false);
  const [remindAt, setRemindAt] = useState('20:00');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!isNew) loadCard(id);
    loadKnownTags();
  }, [id]);

  async function loadKnownTags() {
    const [table, cards] = await Promise.all([fetchAllTags().catch(() => []), fetchCards().catch(() => [])]);
    const names = [...table.map((t) => t.name), ...cards.flatMap((c) => c.tags ?? [])].filter((t): t is string => !!t && !!t.trim());
    const uniq = Array.from(new Set(names));
    setKnownTags(uniq.length ? uniq : ['🐱猫', '🧹打扫', '💅护理']);
  }

  function addNewTag() {
    const t = newTag.trim();
    if (!t) return;
    setKnownTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setGroup(t);
    setNewTag('');
  }

  async function loadCard(cid: string) {
    setLoading(true);
    try {
      const [card, actions] = await Promise.all([fetchCard(cid), fetchActionsForCard(cid)]);
      if (card) {
        setEmoji(card.emoji ?? '⭐');
        setName(card.name);
        setTimeSlot(card.time_of_day ?? 'anytime');
        const tags = (card.tags ?? []).filter(Boolean);
        setGroup(tags[0] ?? null);
        setOtherTags(tags.slice(1));
      }
      const primary = actions.find((a) => a.is_primary) ?? null;
      setPrimaryAction(primary);
      if (primary) {
        setFreqChoice(freqToChoice(primary.frequency_type, primary.suggested_interval ?? primary.interval_days));
        setIntervalDays(String(primary.suggested_interval ?? primary.interval_days ?? 3));
        setFixedDays(primary.fixed_days ?? [1]);
        setRequiresSelection(primary.requires_selection);
        setRemindOn(!!primary.remind_at);
        if (primary.remind_at) setRemindAt(primary.remind_at);
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

  function normalizeTime(raw: string): string | null {
    const m = raw.trim().replace('：', ':').match(/^(\d{1,2})(?::(\d{1,2}))?$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('给它起个名字，比如：洗头');
      return;
    }
    const remind = remindOn ? normalizeTime(remindAt) : null;
    if (remindOn && !remind) {
      setError('提醒时间写成 20:00 这样');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const freq = buildFrequencyFields();
      const tags = group ? [group, ...otherTags.filter((t) => t !== group)] : otherTags;
      if (isNew) {
        await createCard(
          {
            name: name.trim(),
            type: 'habit',
            tags,
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
              remind_at: remind,
            },
          ]
        );
      } else if (cardId) {
        await updateCard(cardId, {
          name: name.trim(),
          time_of_day: timeSlot,
          emoji: emoji.trim() || '⭐',
          tags,
        });
        if (primaryAction) {
          await updateAction(primaryAction.id, {
            frequency_type: freq.frequency_type,
            fixed_days: freq.fixed_days,
            suggested_interval: freq.suggested_interval,
            interval_days: freq.interval_days,
            max_delay: freq.max_delay,
            requires_selection: requiresSelection,
            remind_at: remind,
          });
        }
      }
      await fetchAll();
      // 改了提醒 / 频率：重排灵的约定提醒
      rescheduleAll().catch(() => []);
      router.back();
    } catch (err) {
      setError(`没存上：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  // 删除不弹系统框：点一下变成「再点一次就删」，3 秒没点就恢复
  async function handleDelete() {
    if (!cardId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    await archiveCard(cardId);
    await fetchAll();
    rescheduleAll().catch(() => []);
    router.back();
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>加载中…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.pageTitle}>{isNew ? '新建习惯' : '编辑习惯'}</Text>

        <Text style={styles.label}>图标</Text>
        <TextInput style={styles.input} value={emoji} onChangeText={setEmoji} maxLength={4} />

        <Text style={styles.label}>名字</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="比如：刷牙" />

        <View style={styles.labelRow}>
          <Text style={styles.label}>分类（今天页「该照顾的」按它分组）</Text>
          <Pressable onPress={() => router.push('/care-groups')} hitSlop={8}>
            <Text style={styles.manageLink}>分类管理 ›</Text>
          </Pressable>
        </View>
        <View style={styles.chipRow}>
          {knownTags.map((t) => (
            <Pressable key={t} onPress={() => setGroup(t)} style={[styles.chip, group === t && styles.chipActive]} testID={`habit-group-${t}`}>
              <Text style={[styles.chipText, group === t && styles.chipTextActive]}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.row, styles.newTagRow]}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={newTag}
            onChangeText={setNewTag}
            placeholder="新分类，比如 🧹打扫"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={addNewTag}
            testID="habit-new-group"
          />
          <Pressable style={styles.addTagBtn} onPress={addNewTag}>
            <Text style={styles.addTagText}>加上</Text>
          </Pressable>
        </View>

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
          <>
            <View style={styles.row}>
              <Text style={styles.label}>上次做完后，隔</Text>
              <TextInput
                style={[styles.input, styles.numberInput]}
                value={intervalDays}
                onChangeText={setIntervalDays}
                keyboardType="numeric"
                testID="habit-interval"
              />
              <Text style={styles.label}>天再做</Text>
            </View>
            <Text style={styles.help}>从你哪天真做了开始数。比如计划周一洗头、拖到周三才洗，下次就从周三往后数，不会因为拖了一次就一直算「过期」。</Text>
          </>
        )}
        {freqChoice === 'fixed_day' && <Text style={styles.help}>固定在这几天做。日子会挪的（拖一拖也没关系的那种），用「做完隔几天」更合适。</Text>}

        <View style={styles.switchRow}>
          <Text style={styles.label}>到日子提醒我</Text>
          <Switch value={remindOn} onValueChange={setRemindOn} testID="habit-remind" />
        </View>
        {remindOn ? (
          <>
            <View style={styles.row}>
              <Text style={styles.label}>到日子那天的</Text>
              <TextInput
                style={[styles.input, styles.timeInput]}
                value={remindAt}
                onChangeText={setRemindAt}
                placeholder="20:00"
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
                testID="habit-remind-at"
              />
              <Text style={styles.label}>灵来提醒一下</Text>
            </View>
            <Text style={styles.help}>
              {freqChoice === 'fixed_day'
                ? '每个选中的日子提醒一次，那天已经做了就不提醒。'
                : '只在到日子那天提醒一次，没做也不会一直催。从做过一次之后开始算。'}
            </Text>
          </>
        ) : null}

        <View style={styles.switchRow}>
          <Text style={styles.label}>需要选猫（梳毛/剪指甲这类）</Text>
          <Switch value={requiresSelection} onValueChange={setRequiresSelection} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving} testID="habit-save">
          <Text style={styles.saveButtonText}>{saving ? '保存中…' : '保存'}</Text>
        </Pressable>

        {!isNew && (
          <Pressable style={styles.deleteButton} onPress={handleDelete} testID="habit-delete">
            <Text style={styles.deleteButtonText}>{confirmDelete ? '再点一次就删掉' : '删除这个习惯'}</Text>
          </Pressable>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
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
  timeInput: { width: 76, textAlign: 'center', marginHorizontal: spacing.sm },
  help: { fontSize: fontSize.secondary, color: colors.textMuted, lineHeight: 17, marginTop: spacing.xs },
  error: { fontSize: fontSize.secondary, color: colors.redDark, marginTop: spacing.md },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  manageLink: { fontSize: fontSize.secondary, color: colors.purpleDark },
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
  flex: { flex: 1 },
  newTagRow: { gap: spacing.sm, marginTop: spacing.sm },
  addTagBtn: { borderWidth: 1, borderColor: colors.purple, borderRadius: radius.widget, paddingHorizontal: 14, paddingVertical: 8 },
  addTagText: { color: colors.purpleDark, fontSize: fontSize.body },
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
