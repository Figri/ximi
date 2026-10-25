import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { buildWeek, shiftWeek, type WeekSummary } from '../../lib/week';
import { formatMinutes } from '../../lib/dayDigest';
import { lingDayKey, useLingSettings } from '../../lib/ling/settings';
import { PageTitle } from '../../components/common/PageTitle';

// 本周（需求文档 §8.7）：时间去了哪、例行做了几次、各种状态出现了几次。只放数字，不打分、不算连续天数；
// 叙事（周回顾）在 Notion 那边由灵写。

function md(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}`;
}

export default function ReviewScreen() {
  const dayStartHour = useLingSettings((s) => s.settings.dayStartHour);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [week, setWeek] = useState<WeekSummary | null>(null);
  const todayKey = lingDayKey(new Date(), dayStartHour);
  const key = anchor ?? todayKey;

  const load = useCallback(async (k: string) => {
    setWeek(await buildWeek(k, dayStartHour));
  }, [dayStartHour]);

  useFocusEffect(
    useCallback(() => {
      load(key);
    }, [load, key])
  );

  function go(weeks: number) {
    const next = shiftWeek(key, weeks);
    setAnchor(next > todayKey ? null : next);
  }

  const maxMin = Math.max(1, ...(week?.timeByCategory.map((c) => c.minutes) ?? [1]));
  const isThisWeek = !!week && week.days.includes(todayKey);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <PageTitle
        title="本周"
        right={
          <View style={styles.nav}>
            <Pressable onPress={() => go(-1)} hitSlop={10} testID="week-prev">
              <Text style={styles.navBtn}>‹</Text>
            </Pressable>
            <Text style={styles.range}>{week ? `${md(week.days[0])} – ${md(week.days[6])}` : ''}</Text>
            <Pressable onPress={() => go(1)} hitSlop={10} disabled={isThisWeek} testID="week-next">
              <Text style={[styles.navBtn, isThisWeek && styles.navOff]}>›</Text>
            </Pressable>
          </View>
        }
      />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>时间去了哪</Text>
          {week?.timeByCategory.length ? (
            week.timeByCategory.slice(0, 8).map((c) => (
              <View key={c.name} style={styles.barRow}>
                <Text style={styles.barName} numberOfLines={1}>
                  {c.name}
                </Text>
                <View style={styles.barTrack}>
                  <View style={[styles.bar, { width: `${Math.max(3, (c.minutes / maxMin) * 100)}%`, backgroundColor: c.color }]} />
                </View>
                <Text style={styles.barValue}>{formatMinutes(c.minutes)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>这周还没记时间块。</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>例行做了几次</Text>
          {week?.routines.length ? (
            <View style={styles.chips}>
              {week.routines.map((r) => (
                <Text key={r.name} style={styles.chip}>
                  {r.name} ×{r.count}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>这周还没勾过例行。</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>状态</Text>
          {week?.states.length ? (
            <View style={styles.chips}>
              {week.states.map((s) => (
                <Text key={s.state} style={styles.chip}>
                  {s.state} ×{s.count}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>这周没点过状态。</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>别的</Text>
          <Text style={styles.line}>事项做完 {week?.todosDone ?? 0} 件</Text>
          <Text style={styles.line}>{week?.sleepAvg != null ? `平均睡 ${week.sleepAvg} 小时（记了 ${week.sleepNights} 晚）` : '这周没记睡觉的时间块'}</Text>
          <Text style={styles.line}>碎片 {week?.fragments ?? 0} 条</Text>
        </View>
        <Text style={styles.foot}>这里只放数字。周回顾在 Notion 那边写。</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  navBtn: { fontSize: 22, color: colors.purpleDark, paddingHorizontal: 4 },
  navOff: { color: colors.textMuted, opacity: 0.4 },
  range: { fontSize: fontSize.body, color: colors.textSecondary, minWidth: 96, textAlign: 'center' },
  body: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontSize: fontSize.secondary, fontWeight: '700', color: colors.textSecondary },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barName: { width: 56, fontSize: fontSize.body, color: colors.textPrimary },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.background, overflow: 'hidden' },
  bar: { height: 10, borderRadius: 5 },
  barValue: { width: 44, textAlign: 'right', fontSize: fontSize.secondary, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { fontSize: fontSize.body, color: colors.textPrimary, backgroundColor: colors.background, borderRadius: radius.button, paddingHorizontal: 10, paddingVertical: 5, overflow: 'hidden' },
  line: { fontSize: fontSize.body, color: colors.textPrimary },
  empty: { fontSize: fontSize.body, color: colors.textMuted },
  foot: { fontSize: fontSize.secondary, color: colors.textMuted, textAlign: 'center' },
});
