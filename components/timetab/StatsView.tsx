import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchRangeStats, type RangeStats } from '../../lib/timelog';
import { useTimeLogStore } from '../../lib/timelogStore';

type RangeKey = 'today' | 'week' | 'month';
const RANGE_LABELS: Record<RangeKey, string> = { today: '今日', week: '最近7天', month: '本月' };

function rangeToDates(key: RangeKey): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (key === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (key === 'week') {
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return { start, end };
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}分钟`;
  if (m === 0) return `${h}小时`;
  return `${h}小时${m}分钟`;
}

export function StatsView() {
  const { categories, tags, fetchAll } = useTimeLogStore();
  const [range, setRange] = useState<RangeKey>('today');
  const [stats, setStats] = useState<RangeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (categories.length === 0) fetchAll();
  }, []);

  useEffect(() => {
    setLoading(true);
    const { start, end } = rangeToDates(range);
    fetchRangeStats(start, end)
      .then(setStats)
      .finally(() => setLoading(false));
  }, [range]);

  const categoryById = useMemo(() => {
    const map: Record<string, (typeof categories)[number]> = {};
    for (const c of categories) map[c.id] = c;
    return map;
  }, [categories]);

  // 把次级分类的时长卷到它的一级分类上
  const topLevelBreakdown = useMemo(() => {
    if (!stats) return [];
    const byTop: Record<string, number> = {};
    for (const row of stats.byCategory) {
      if (!row.category_id) {
        byTop['__none__'] = (byTop['__none__'] ?? 0) + row.minutes;
        continue;
      }
      const cat = categoryById[row.category_id];
      const topId = cat?.parent_id ? cat.parent_id : row.category_id;
      byTop[topId] = (byTop[topId] ?? 0) + row.minutes;
    }
    return Object.entries(byTop)
      .map(([id, minutes]) => ({
        id,
        name: id === '__none__' ? '未分类' : categoryById[id]?.name ?? '未知',
        color: id === '__none__' ? colors.textMuted : categoryById[id]?.color ?? colors.textMuted,
        minutes,
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [stats, categoryById]);

  const tagBreakdown = useMemo(() => {
    if (!stats) return [];
    const tagById: Record<string, (typeof tags)[number]> = {};
    for (const t of tags) tagById[t.id] = t;
    return stats.byTag
      .map((row) => ({
        id: row.tag_id,
        name: tagById[row.tag_id]?.name ?? '未知标签',
        color: tagById[row.tag_id]?.color ?? colors.textMuted,
        count: row.count,
        minutes: row.minutes,
      }))
      .sort((a, b) => b.count - a.count);
  }, [stats, tags]);

  const totalMinutes = stats?.totalMinutes ?? 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.rangeRow}>
        {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => setRange(key)}
            style={[styles.rangeChip, range === key && styles.rangeChipActive]}
          >
            <Text style={[styles.rangeChipText, range === key && styles.rangeChipTextActive]}>
              {RANGE_LABELS[key]}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />
      ) : (
        <>
          <Text style={styles.sectionTitle}>分类占比 · 共 {formatDuration(totalMinutes)}</Text>
          {topLevelBreakdown.length === 0 ? (
            <Text style={styles.empty}>这段时间还没有记录</Text>
          ) : (
            <>
              <View style={styles.stackBar}>
                {topLevelBreakdown.map((row) => (
                  <View
                    key={row.id}
                    style={{
                      flex: Math.max(row.minutes, 0.5),
                      backgroundColor: row.color,
                    }}
                  />
                ))}
              </View>
              {topLevelBreakdown.map((row) => (
                <View key={row.id} style={styles.rankRow}>
                  <View style={[styles.dot, { backgroundColor: row.color }]} />
                  <Text style={styles.rankName}>{row.name}</Text>
                  <Text style={styles.rankDuration}>{formatDuration(row.minutes)}</Text>
                  <Text style={styles.rankPercent}>
                    {totalMinutes > 0 ? Math.round((row.minutes / totalMinutes) * 100) : 0}%
                  </Text>
                </View>
              ))}
            </>
          )}

          <Text style={styles.sectionTitle}>情绪标签统计</Text>
          {tagBreakdown.length === 0 ? (
            <Text style={styles.empty}>这段时间还没有挂情绪标签的记录</Text>
          ) : (
            tagBreakdown.map((row) => (
              <View key={row.id} style={styles.rankRow}>
                <View style={[styles.dot, { backgroundColor: row.color }]} />
                <Text style={styles.rankName}>{row.name}</Text>
                <Text style={styles.rankDuration}>{row.count}次</Text>
                <Text style={styles.rankPercent}>{formatDuration(row.minutes)}</Text>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 3 },
  rangeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  rangeChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.button, backgroundColor: colors.card },
  rangeChipActive: { backgroundColor: colors.purple },
  rangeChipText: { fontSize: fontSize.body, color: colors.textSecondary },
  rangeChipTextActive: { color: colors.textPrimary, fontWeight: '600' },
  sectionTitle: {
    fontSize: fontSize.secondary,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  empty: { fontSize: fontSize.body, color: colors.textMuted, paddingVertical: spacing.sm },
  stackBar: {
    flexDirection: 'row',
    height: 20,
    borderRadius: radius.widget,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rankName: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary },
  rankDuration: { fontSize: fontSize.secondary, color: colors.textSecondary },
  rankPercent: { fontSize: fontSize.secondary, color: colors.textMuted, width: 44, textAlign: 'right' },
});
