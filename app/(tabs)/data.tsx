import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing, statusColorDark } from '../../constants/theme';
import { getActionDecay } from '../../lib/decay';
import { useCardStore } from '../../lib/store';
import { fetchWorries } from '../../lib/worries';
import {
  fetchCompletionCountsByDay,
  fetchProjects,
  fetchRecentDailySummaries,
  fetchWeightSeries,
} from '../../lib/stats';
import type { DailySummary, Project, Worry } from '../../types';

const WEEKDAY_NARROW = ['日', '一', '二', '三', '四', '五', '六'];

function shortDate(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${m}/${d}`;
}

export default function DataScreen() {
  const { cards, actions, lastCompletions, fetchAll } = useCardStore();

  const [completionCounts, setCompletionCounts] = useState<{ date: string; count: number }[]>([]);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [worries, setWorries] = useState<Worry[]>([]);
  const [weightSeries, setWeightSeries] = useState<{ date: string; weight: number }[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [counts, dailySummaries, worryList, weights, projectList] = await Promise.all([
        fetchCompletionCountsByDay(7),
        fetchRecentDailySummaries(14),
        fetchWorries(),
        fetchWeightSeries(20),
        fetchProjects(),
      ]);
      setCompletionCounts(counts);
      setSummaries(dailySummaries);
      setWorries(worryList);
      setWeightSeries(weights);
      setProjects(projectList);
    } finally {
      setLoading(false);
    }
  }

  const statusCounts = useMemo(() => {
    const byCard: Record<string, typeof actions> = {};
    for (const a of actions) {
      byCard[a.card_id] = byCard[a.card_id] ?? [];
      byCard[a.card_id].push(a);
    }
    const counts = { green: 0, yellow: 0, red: 0 };
    for (const card of cards) {
      const primary = (byCard[card.id] ?? []).find((a) => a.is_primary);
      if (!primary) continue;
      const lastAt = lastCompletions[primary.id] ? new Date(lastCompletions[primary.id]) : null;
      const decay = getActionDecay(primary, lastAt);
      counts[decay.status]++;
    }
    return counts;
  }, [cards, actions, lastCompletions]);

  const worryStats = useMemo(() => {
    const stats = {
      active: 0,
      resolved: 0,
      letGo: 0,
      light: 0,
      medium: 0,
      heavy: 0,
    };
    for (const w of worries) {
      if (w.status === 'active') stats.active++;
      else if (w.status === 'resolved') stats.resolved++;
      else stats.letGo++;
      if (w.severity === 'light') stats.light++;
      else if (w.severity === 'medium') stats.medium++;
      else stats.heavy++;
    }
    return stats;
  }, [worries]);

  const maxCompletionCount = Math.max(1, ...completionCounts.map((c) => c.count));
  const totalHabitCards = statusCounts.green + statusCounts.yellow + statusCounts.red;
  const maxWeight = Math.max(1, ...weightSeries.map((w) => w.weight));
  const minWeight = weightSeries.length ? Math.min(...weightSeries.map((w) => w.weight)) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.push('/')}>
          <Text style={styles.backText}>‹ 打卡</Text>
        </Pressable>
        <Text style={styles.title}>📊 数据</Text>
        {loading && <Text style={styles.loadingText}>加载中…</Text>}

        {/* 习惯完成率 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>习惯完成率</Text>
          <Text style={styles.cardSubtitle}>最近 7 天每天完成次数</Text>
          <View style={styles.barRow}>
            {completionCounts.map((c) => (
              <View key={c.date} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { height: `${(c.count / maxCompletionCount) * 100}%`, backgroundColor: colors.purpleDark },
                    ]}
                  />
                </View>
                <Text style={styles.barValue}>{c.count}</Text>
                <Text style={styles.barLabel}>{WEEKDAY_NARROW[new Date(c.date).getDay()]}</Text>
              </View>
            ))}
          </View>
          {totalHabitCards > 0 ? (
            <View style={styles.statusRow}>
              <StatusPill color={statusColorDark.green} label={`绿 ${statusCounts.green}`} />
              <StatusPill color={statusColorDark.yellow} label={`黄 ${statusCounts.yellow}`} />
              <StatusPill color={statusColorDark.red} label={`红 ${statusCounts.red}`} />
            </View>
          ) : (
            <Text style={styles.empty}>还没有卡片</Text>
          )}
        </View>

        {/* HP/MP 趋势 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>HP / MP 趋势</Text>
          <Text style={styles.cardSubtitle}>最近 14 天的每日总结</Text>
          {summaries.length === 0 ? (
            <Text style={styles.empty}>还没有生成过每日总结，去记录tab「今日」点『生成这天的AI总结』</Text>
          ) : (
            <View style={styles.barRow}>
              {summaries.map((s) => (
                <View key={s.date} style={styles.barCol}>
                  <View style={styles.dualBarTrack}>
                    <View style={[styles.dualBar, { height: `${s.hp ?? 0}%`, backgroundColor: colors.redDark }]} />
                    <View style={[styles.dualBar, { height: `${s.mp ?? 0}%`, backgroundColor: colors.purpleDark }]} />
                  </View>
                  <Text style={styles.barLabel}>{shortDate(s.date)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 烦恼统计 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>烦恼统计</Text>
          {worries.length === 0 ? (
            <Text style={styles.empty}>暂无烦恼记录</Text>
          ) : (
            <>
              <View style={styles.statusRow}>
                <StatusPill color={colors.redDark} label={`进行中 ${worryStats.active}`} />
                <StatusPill color={colors.greenDark} label={`已解决 ${worryStats.resolved}`} />
                <StatusPill color={colors.textMuted} label={`已放下 ${worryStats.letGo}`} />
              </View>
              <View style={[styles.statusRow, { marginTop: spacing.sm }]}>
                <StatusPill color={colors.yellowDark} label={`轻 ${worryStats.light}`} />
                <StatusPill color={colors.yellowDark} label={`中 ${worryStats.medium}`} />
                <StatusPill color={colors.redDark} label={`重 ${worryStats.heavy}`} />
              </View>
            </>
          )}
        </View>

        {/* 体重曲线 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>体重曲线</Text>
          {weightSeries.length === 0 ? (
            <Text style={styles.empty}>
              还没有体重记录，去记录tab「身体」分类记一笔，填一下体重（kg）那一栏
            </Text>
          ) : (
            <>
              <Text style={styles.weightLatest}>最新 {weightSeries[weightSeries.length - 1].weight}kg</Text>
              <View style={styles.barRow}>
                {weightSeries.map((w, i) => {
                  const range = maxWeight - minWeight || 1;
                  const ratio = (w.weight - minWeight) / range;
                  return (
                    <View key={`${w.date}-${i}`} style={styles.barCol}>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { height: `${10 + ratio * 90}%`, backgroundColor: colors.blueDark },
                          ]}
                        />
                      </View>
                      <Text style={styles.barLabel}>{shortDate(w.date)}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* 项目列表 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>项目列表</Text>
          {projects.length === 0 ? (
            <Text style={styles.empty}>还没有项目，这块创建入口还没做，先占位</Text>
          ) : (
            projects.map((p) => (
              <View key={p.id} style={styles.projectRow}>
                <Text style={styles.projectName}>{p.name}</Text>
                <Text style={styles.projectStatus}>{p.status}</Text>
              </View>
            ))
          )}
        </View>

        {/* 屏幕时间统计 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>屏幕时间统计</Text>
          <Text style={styles.empty}>需要系统权限，暂不支持，先放着</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusPill({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.pill}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

const BAR_HEIGHT = 80;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  backText: { fontSize: fontSize.body, color: colors.purpleDark, fontWeight: '600', marginBottom: spacing.sm },
  title: { fontSize: fontSize.pageTitle, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.lg },
  loadingText: { fontSize: fontSize.secondary, color: colors.textMuted, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600' },
  cardSubtitle: { fontSize: fontSize.secondary, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },
  empty: { fontSize: fontSize.secondary, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 18 },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: BAR_HEIGHT + 36,
    marginTop: spacing.sm,
  },
  barCol: { alignItems: 'center', flex: 1 },
  barTrack: {
    width: 14,
    height: BAR_HEIGHT,
    borderRadius: 7,
    backgroundColor: colors.background,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { width: '100%', borderRadius: 7 },
  dualBarTrack: {
    width: 20,
    height: BAR_HEIGHT,
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
  },
  dualBar: { width: 8, borderRadius: 4, alignSelf: 'flex-end' },
  barValue: { fontSize: fontSize.tiny, color: colors.textSecondary, marginTop: 4, includeFontPadding: false },
  barLabel: {
    fontSize: fontSize.tiny,
    color: colors.textMuted,
    marginTop: 2,
    includeFontPadding: false,
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillLabel: { fontSize: fontSize.secondary, color: colors.textSecondary },
  weightLatest: { fontSize: fontSize.cardName, color: colors.blueDark, fontWeight: '600', marginTop: spacing.xs },
  projectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  projectName: { fontSize: fontSize.body, color: colors.textPrimary },
  projectStatus: { fontSize: fontSize.secondary, color: colors.textMuted },
});
