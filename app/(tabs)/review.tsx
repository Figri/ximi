import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { buildWeek, shiftWeek, type WeekSummary } from '../../lib/week';
import { formatMinutes } from '../../lib/dayDigest';
import { lingDayKey, useLingSettings } from '../../lib/ling/settings';
import { PageTitle } from '../../components/common/PageTitle';

// 本周（需求文档 §8.7）：时间去了哪、每天照顾了几次、例行做了几次、各种状态出现了几次、体重。
// 原来「数据」页的东西（每天完成几次、体重曲线）也并到这里了。只放数字，不打分、不算连续天数；
// 叙事（周回顾）在 Notion 那边由灵写。

const WEEK_NARROW = ['一', '二', '三', '四', '五', '六', '日'];

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
  const maxDay = Math.max(1, ...(week?.routineByDay ?? [1]));
  const ws = week?.weights ?? [];
  const wMax = Math.max(...ws.map((w) => w.value), 0);
  const wMin = ws.length ? Math.min(...ws.map((w) => w.value)) : 0;
  const lastW = ws.length ? ws[ws.length - 1] : null;
  const firstInWeek = ws.find((w) => w.inWeek) ?? null;
  const beforeWeek = [...ws].reverse().find((w) => !w.inWeek) ?? null;
  const weekDiff = lastW?.inWeek && beforeWeek ? Math.round((lastW.value - beforeWeek.value) * 10) / 10 : null;
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
          <Text style={styles.cardTitle}>每天照顾了几次</Text>
          {week && week.routineByDay.some((n) => n > 0) ? (
            <View style={styles.dayBars} testID="week-day-bars">
              {week.routineByDay.map((n, i) => (
                <View key={i} style={styles.dayCol}>
                  <Text style={styles.dayNum}>{n || ''}</Text>
                  <View style={styles.dayTrack}>
                    <View style={[styles.dayFill, { height: `${(n / maxDay) * 100}%` }, week.days[i] === todayKey && styles.dayFillToday]} />
                  </View>
                  <Text style={[styles.dayLabel, week.days[i] === todayKey && styles.dayLabelToday]}>{WEEK_NARROW[i]}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>这周还没照顾过例行。</Text>
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
          <Text style={styles.cardTitle}>体重</Text>
          {lastW ? (
            <>
              <Text style={styles.line}>
                最近 {md(lastW.date)} 是 {lastW.value} kg
                {weekDiff != null && weekDiff !== 0 ? `，比上周最后一次${weekDiff > 0 ? '多' : '少'} ${Math.abs(weekDiff)} kg` : ''}
                {!firstInWeek ? '（这周还没称）' : ''}
              </Text>
              <View style={styles.wBars} testID="week-weights">
                {ws.map((w, i) => {
                  const range = wMax - wMin || 1;
                  return (
                    <View key={`${w.date}-${i}`} style={styles.wCol}>
                      <View style={styles.wTrack}>
                        <View style={[styles.wFill, { height: `${15 + ((w.value - wMin) / range) * 85}%` }, w.inWeek && styles.wFillWeek]} />
                      </View>
                      <Text style={styles.dayLabel}>{md(w.date)}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <Text style={styles.empty}>还没记过体重。今天页「身体」里点「记体重」。</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>别的</Text>
          <Text style={styles.line}>事项做完 {week?.todosDone ?? 0} 件</Text>
          <Text style={styles.line}>{week?.play.count ? `玩了 ${week.play.count} 局，一共 ${formatMinutes(week.play.minutes)}` : '这周没用娱乐出口'}</Text>
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
  dayBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 96 },
  dayCol: { flex: 1, alignItems: 'center', gap: 3 },
  dayNum: { fontSize: fontSize.tiny, color: colors.textSecondary, height: 12 },
  dayTrack: { width: 14, height: 56, borderRadius: 7, backgroundColor: colors.background, justifyContent: 'flex-end', overflow: 'hidden' },
  dayFill: { width: '100%', borderRadius: 7, backgroundColor: colors.purple },
  dayFillToday: { backgroundColor: colors.purpleDark },
  dayLabel: { fontSize: fontSize.tiny, color: colors.textMuted },
  dayLabelToday: { color: colors.purpleDark, fontWeight: '700' },
  wBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 84, marginTop: 4 },
  wCol: { flex: 1, alignItems: 'center', gap: 3 },
  wTrack: { width: 10, height: 60, borderRadius: 5, backgroundColor: colors.background, justifyContent: 'flex-end', overflow: 'hidden' },
  wFill: { width: '100%', borderRadius: 5, backgroundColor: colors.blue },
  wFillWeek: { backgroundColor: colors.blueDark },
});
