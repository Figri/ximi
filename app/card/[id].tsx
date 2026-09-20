import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import {
  archiveCard,
  createCard,
  createTag,
  deleteAction,
  fetchActionsForCard,
  fetchAllTags,
  fetchCard,
  fetchCompletionHistory,
  updateAction,
  updateCard,
} from '../../lib/cards';
import { useCardStore } from '../../lib/store';
import type { Action, Completion, FrequencyType, TimeOfDay } from '../../types';

const FREQUENCY_LABELS: Record<FrequencyType, string> = {
  interval: '周期衰减',
  fixed_day: '固定星期几',
  manual: '手动（不衰减）',
};

const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: '🌅 早上',
  day: '☀️ 白天',
  evening: '🌙 晚上',
  anytime: '⏰ 随时',
};

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const fetchAll = useCardStore((s) => s.fetchAll);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [cardId, setCardId] = useState<string | null>(isNew ? null : id);

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('anytime');
  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  const [primaryAction, setPrimaryAction] = useState<Action | null>(null);
  const [actionName, setActionName] = useState('做了');
  const [frequencyType, setFrequencyType] = useState<FrequencyType>('interval');
  const [suggestedInterval, setSuggestedInterval] = useState('3');
  const [maxDelay, setMaxDelay] = useState('5');

  const [secondaryActions, setSecondaryActions] = useState<Action[]>([]);
  const [history, setHistory] = useState<Completion[]>([]);

  useEffect(() => {
    fetchAllTags().then((rows) => setAllTags(rows.map((r) => r.name)));
    if (!isNew) loadCard(id);
  }, [id]);

  async function loadCard(cid: string) {
    setLoading(true);
    try {
      const [card, actions, hist] = await Promise.all([
        fetchCard(cid),
        fetchActionsForCard(cid),
        fetchCompletionHistory(cid),
      ]);
      if (card) {
        setName(card.name);
        setNotes(card.notes ?? '');
        setTags(card.tags);
        setTimeOfDay(card.time_of_day ?? 'anytime');
      }
      const primary = actions.find((a) => a.is_primary) ?? null;
      setPrimaryAction(primary);
      if (primary) {
        setActionName(primary.name);
        setFrequencyType(primary.frequency_type);
        setSuggestedInterval(String(primary.suggested_interval ?? primary.interval_days ?? 3));
        setMaxDelay(String(primary.max_delay ?? 5));
      }
      setSecondaryActions(actions.filter((a) => !a.is_primary));
      setHistory(hist);
    } finally {
      setLoading(false);
    }
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleAddTag() {
    const tag = newTagInput.trim();
    if (!tag) return;
    await createTag(tag);
    setAllTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setTags((prev) => [...prev, tag]);
    setNewTagInput('');
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('叫什么名字呢？', '卡片名字不能为空');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await createCard(
          { name: name.trim(), type: 'habit', tags, notes: notes.trim() || null, time_of_day: timeOfDay },
          [
            {
              name: actionName.trim() || '做了',
              is_primary: true,
              frequency_type: frequencyType,
              interval_days: frequencyType === 'interval' ? Number(suggestedInterval) : null,
              fixed_days: null,
              suggested_interval: frequencyType === 'interval' ? Number(suggestedInterval) : null,
              max_delay: frequencyType === 'interval' ? Number(maxDelay) : null,
              requires_selection: false,
            },
          ]
        );
      } else if (cardId) {
        await updateCard(cardId, { name: name.trim(), tags, notes: notes.trim() || null, time_of_day: timeOfDay });
        if (primaryAction) {
          await updateAction(primaryAction.id, {
            name: actionName.trim() || '做了',
            frequency_type: frequencyType,
            suggested_interval: frequencyType === 'interval' ? Number(suggestedInterval) : null,
            max_delay: frequencyType === 'interval' ? Number(maxDelay) : null,
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

  function handleArchive() {
    if (!cardId) return;
    Alert.alert('归档这张卡片？', '归档后不会出现在生活tab里，可以在数据库里恢复', [
      { text: '取消', style: 'cancel' },
      {
        text: '归档',
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
        <Text style={styles.label}>名字</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="比如：浇花" />

        <Text style={styles.label}>标签</Text>
        <View style={styles.tagRow}>
          {allTags.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => toggleTag(tag)}
              style={[styles.tagChip, tags.includes(tag) && styles.tagChipActive]}
            >
              <Text style={[styles.tagChipText, tags.includes(tag) && styles.tagChipTextActive]}>{tag}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.newTagRow}>
          <TextInput
            style={[styles.input, styles.newTagInput]}
            value={newTagInput}
            onChangeText={setNewTagInput}
            placeholder="新标签，比如 🌿植物"
          />
          <Pressable style={styles.addTagButton} onPress={handleAddTag}>
            <Text style={styles.addTagButtonText}>添加</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>属于哪个时间段</Text>
        <View style={styles.tagRow}>
          {(Object.keys(TIME_OF_DAY_LABELS) as TimeOfDay[]).map((tod) => (
            <Pressable
              key={tod}
              onPress={() => setTimeOfDay(tod)}
              style={[styles.tagChip, timeOfDay === tod && styles.tagChipActive]}
            >
              <Text style={[styles.tagChipText, timeOfDay === tod && styles.tagChipTextActive]}>
                {TIME_OF_DAY_LABELS[tod]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>主动作</Text>
        <TextInput style={styles.input} value={actionName} onChangeText={setActionName} placeholder="比如：浇了" />

        <Text style={styles.label}>频率类型</Text>
        <View style={styles.tagRow}>
          {(Object.keys(FREQUENCY_LABELS) as FrequencyType[]).map((type) => (
            <Pressable
              key={type}
              onPress={() => setFrequencyType(type)}
              style={[styles.tagChip, frequencyType === type && styles.tagChipActive]}
            >
              <Text style={[styles.tagChipText, frequencyType === type && styles.tagChipTextActive]}>
                {FREQUENCY_LABELS[type]}
              </Text>
            </Pressable>
          ))}
        </View>

        {frequencyType === 'interval' && (
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.label}>建议间隔（天）</Text>
              <TextInput
                style={styles.input}
                value={suggestedInterval}
                onChangeText={setSuggestedInterval}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.label}>最大延迟（天）</Text>
              <TextInput style={styles.input} value={maxDelay} onChangeText={setMaxDelay} keyboardType="numeric" />
            </View>
          </View>
        )}

        <Text style={styles.label}>备注</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="随便写点什么"
          multiline
        />

        {secondaryActions.length > 0 && (
          <>
            <Text style={styles.label}>次要动作</Text>
            {secondaryActions.map((a) => (
              <View key={a.id} style={styles.secondaryItem}>
                <Text style={styles.secondaryText}>{a.name}</Text>
                <Pressable onPress={() => deleteAction(a.id).then(() => loadCard(id))}>
                  <Text style={styles.deleteText}>删除</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {!isNew && history.length > 0 && (
          <>
            <Text style={styles.label}>最近完成记录</Text>
            {history.slice(0, 10).map((h) => (
              <Text key={h.id} style={styles.historyItem}>
                {new Date(h.completed_at).toLocaleString('zh-CN')}
                {h.undone ? '（已撤销）' : ''}
              </Text>
            ))}
          </>
        )}

        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? '保存中…' : '保存'}</Text>
        </Pressable>

        {!isNew && (
          <Pressable style={styles.archiveButton} onPress={handleArchive}>
            <Text style={styles.archiveButtonText}>归档这张卡片</Text>
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
  label: {
    fontSize: fontSize.secondary,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tagChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    backgroundColor: colors.card,
  },
  tagChipActive: { backgroundColor: colors.purple },
  tagChipText: { fontSize: fontSize.body, color: colors.textSecondary },
  tagChipTextActive: { color: colors.textPrimary, fontWeight: '600' },
  newTagRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' },
  newTagInput: { flex: 1 },
  addTagButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.blueLight,
    borderRadius: radius.widget,
  },
  addTagButtonText: { color: colors.blueDark, fontSize: fontSize.body },
  row: { flexDirection: 'row', gap: spacing.md },
  rowItem: { flex: 1 },
  secondaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  secondaryText: { fontSize: fontSize.body, color: colors.textPrimary },
  deleteText: { fontSize: fontSize.secondary, color: colors.redDark },
  historyItem: { fontSize: fontSize.secondary, color: colors.textMuted, paddingVertical: 2 },
  saveButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.purpleDark,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontSize: fontSize.cardName, fontWeight: '600' },
  archiveButton: { marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.sm },
  archiveButtonText: { color: colors.redDark, fontSize: fontSize.body },
});
