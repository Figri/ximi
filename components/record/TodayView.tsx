import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchTimelineForDate } from '../../lib/timeline';
import { fetchDailySummary, generateDailySummary } from '../../lib/dailySummary';
import { getApiKey, getSelectedModel } from '../../lib/aiSettings';
import { TIMELINE_CATEGORY_OPTIONS } from './CategoryConfig';
import type { DailySummary, TimelineEntry } from '../../types';

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export function TodayView({ refreshKey }: { refreshKey: number }) {
  const [date, setDate] = useState(new Date());
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, s] = await Promise.all([fetchTimelineForDate(date), fetchDailySummary(date)]);
      setEntries(e);
      setSummary(s);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function handleGenerateSummary() {
    setGenerating(true);
    try {
      const model = (await getSelectedModel()) ?? 'claude-sonnet';
      const apiKey = await getApiKey(model);
      const result = await generateDailySummary(date, model, apiKey);
      setSummary(result);
    } catch (err) {
      Alert.alert('生成失败', err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.dateNav}>
        <Pressable onPress={() => setDate((d) => new Date(d.getTime() - 86400000))}>
          <Text style={styles.dateNavArrow}>‹</Text>
        </Pressable>
        <Text style={styles.dateLabel}>
          {isSameDay(date, new Date()) ? '今天' : date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
          {' · '}
          {date.toLocaleDateString('zh-CN', { weekday: 'short' })}
        </Text>
        <Pressable
          onPress={() => setDate((d) => new Date(d.getTime() + 86400000))}
          disabled={isSameDay(date, new Date())}
        >
          <Text style={[styles.dateNavArrow, isSameDay(date, new Date()) && styles.dateNavArrowDisabled]}>›</Text>
        </Pressable>
      </View>

      <View style={styles.summaryCard}>
        {summary ? (
          <>
            <SummaryLine label="身体" value={summary.body_summary} />
            <SummaryLine label="睡眠" value={summary.sleep_summary} />
            <SummaryLine label="饮食" value={summary.food_summary} />
            <SummaryLine label="情绪" value={summary.emotion_summary} />
            <SummaryLine label="烦恼" value={summary.worry_summary} />
            <SummaryLine label="计划" value={summary.plan_summary} />
            <Pressable onPress={handleGenerateSummary} disabled={generating}>
              <Text style={styles.regenerate}>{generating ? '重新生成中…' : '重新生成'}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.generateButton} onPress={handleGenerateSummary} disabled={generating}>
            {generating ? (
              <ActivityIndicator color={colors.purpleDark} />
            ) : (
              <Text style={styles.generateButtonText}>✨ 生成这天的 AI 总结</Text>
            )}
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />
      ) : entries.length === 0 ? (
        <Text style={styles.empty}>这天还没有记录，点右下角 ＋ 补一条</Text>
      ) : (
        entries.map((entry) => {
          const opt = TIMELINE_CATEGORY_OPTIONS.find((o) => o.category === entry.category);
          return (
            <View key={entry.id} style={styles.entryRow}>
              <Text style={styles.entryTime}>
                {new Date(entry.start_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={styles.entryEmoji}>{opt?.emoji ?? '📝'}</Text>
              <Text style={styles.entryText}>{entry.description}</Text>
            </View>
          );
        })
      )}
    </View>
  );
}

function SummaryLine({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <Text style={styles.summaryLine}>
      <Text style={styles.summaryLabel}>{label}：</Text>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  dateNavArrow: { fontSize: 22, color: colors.textSecondary, paddingHorizontal: spacing.md },
  dateNavArrowDisabled: { color: colors.textMuted, opacity: 0.4 },
  dateLabel: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600' },
  summaryCard: {
    backgroundColor: colors.purpleLight,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryLine: { fontSize: fontSize.secondary, color: colors.textPrimary, marginBottom: 4, lineHeight: 18 },
  summaryLabel: { fontWeight: '600', color: colors.purpleDark },
  regenerate: { fontSize: fontSize.tiny, color: colors.purpleDark, marginTop: spacing.xs },
  generateButton: { paddingVertical: spacing.sm, alignItems: 'center' },
  generateButtonText: { fontSize: fontSize.body, color: colors.purpleDark, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.body, marginTop: spacing.xl },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  entryTime: { fontSize: fontSize.tiny, color: colors.textMuted, width: 40 },
  entryEmoji: { fontSize: 14, includeFontPadding: false },
  entryText: { fontSize: fontSize.body, color: colors.textPrimary, flex: 1, flexShrink: 1 },
});
