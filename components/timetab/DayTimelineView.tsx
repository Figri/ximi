import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { deleteTimelineEntry, fetchTimelineForDate, setDaySummary } from '../../lib/timeline';
import { fetchDailySummary } from '../../lib/dailySummary';
import type { TimelineEntry } from '../../types';

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

interface DayTimelineViewProps {
  date: Date;
  onDateChange: (date: Date) => void;
  refreshKey: number;
}

export function DayTimelineView({ date, onDateChange, refreshKey }: DayTimelineViewProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryText, setSummaryText] = useState('');
  const [editingSummary, setEditingSummary] = useState(false);
  const [draftSummary, setDraftSummary] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, s] = await Promise.all([fetchTimelineForDate(date), fetchDailySummary(date)]);
      setEntries(e);
      setSummaryText(s?.summary ?? '');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function handleSaveSummary() {
    await setDaySummary(date, draftSummary);
    setSummaryText(draftSummary.trim());
    setEditingSummary(false);
  }

  function handleDelete(entry: TimelineEntry) {
    Alert.alert('删除这条记录？', entry.description ?? '', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteTimelineEntry(entry.id);
          load();
        },
      },
    ]);
  }

  const today = new Date();
  const ordered = [...entries].sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

  return (
    <View style={styles.container}>
      <View style={styles.dateNav}>
        <Pressable onPress={() => onDateChange(new Date(date.getTime() - 86400000))}>
          <Text style={styles.dateNavArrow}>‹</Text>
        </Pressable>
        <Text style={styles.dateLabel}>
          {isSameDay(date, today) ? '今天' : date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
          {' · '}
          {date.toLocaleDateString('zh-CN', { weekday: 'short' })}
        </Text>
        <Pressable onPress={() => onDateChange(new Date(date.getTime() + 86400000))} disabled={isSameDay(date, today)}>
          <Text style={[styles.dateNavArrow, isSameDay(date, today) && styles.dateNavArrowDisabled]}>›</Text>
        </Pressable>
      </View>

      {editingSummary ? (
        <View style={styles.summaryEditRow}>
          <TextInput
            style={styles.summaryInput}
            value={draftSummary}
            onChangeText={setDraftSummary}
            placeholder="这天的一行摘要（月历里会显示）"
            placeholderTextColor={colors.textMuted}
            autoFocus
            maxLength={20}
            onSubmitEditing={handleSaveSummary}
            onBlur={handleSaveSummary}
          />
        </View>
      ) : (
        <Pressable
          style={styles.summaryRow}
          onPress={() => {
            setDraftSummary(summaryText);
            setEditingSummary(true);
          }}
        >
          <Text style={styles.summaryLabel}>{summaryText || '点这里写一行摘要（给月历用）'}</Text>
        </Pressable>
      )}

      <ScrollView contentContainerStyle={styles.list}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />
        ) : ordered.length === 0 ? (
          <Text style={styles.empty}>这天还没有记录，点右下角＋补一条</Text>
        ) : (
          ordered.map((entry, i) => (
            <Pressable key={entry.id} onLongPress={() => handleDelete(entry)} style={styles.row}>
              <View style={styles.timeCol}>
                <Text style={styles.time}>
                  {new Date(entry.start_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={styles.lineCol}>
                <View style={styles.dot} />
                {i < ordered.length - 1 && <View style={styles.line} />}
              </View>
              <View style={styles.contentCol}>
                <Text style={styles.entryText}>
                  <Text style={styles.entryIcon}>{entry.icon ?? '📝'} </Text>
                  {entry.description}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  dateNavArrow: { fontSize: 22, color: colors.textSecondary, paddingHorizontal: spacing.md },
  dateNavArrowDisabled: { color: colors.textMuted, opacity: 0.4 },
  dateLabel: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600' },
  summaryRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  summaryLabel: { fontSize: fontSize.secondary, color: colors.textMuted, textAlign: 'center' },
  summaryEditRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  summaryInput: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    fontSize: fontSize.secondary,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 3 },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.body, marginTop: spacing.xl },
  row: { flexDirection: 'row' },
  timeCol: { width: 44, paddingTop: 2 },
  time: { fontSize: fontSize.tiny, color: colors.textMuted, includeFontPadding: false },
  lineCol: { width: 16, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.purpleDark, marginTop: 6 },
  line: { width: 2, flex: 1, backgroundColor: '#E4DEEC', marginTop: 2 },
  contentCol: { flex: 1, paddingBottom: spacing.md },
  entryIcon: { fontSize: 14 },
  entryText: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 20 },
});
