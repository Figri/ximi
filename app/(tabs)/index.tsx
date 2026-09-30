import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { WeekDateStrip } from '../../components/timetab/WeekDateStrip';
import { TimeBlockView } from '../../components/timetab/TimeBlockView';
import { TimeAxisView } from '../../components/timetab/TimeAxisView';
import { MonthCalendarView } from '../../components/timetab/MonthCalendarView';
import { StatsView } from '../../components/timetab/StatsView';

type ViewMode = 'day' | 'month' | 'stats';
type DayView = 'block' | 'axis'; // block=时间块, axis=时间轴

export default function TimelineScreen() {
  const [mode, setMode] = useState<ViewMode>('day');
  const [dayView, setDayView] = useState<DayView>('block');
  const [date, setDate] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  // 记住进统计页之前停在哪个视图，"统计"按钮变开关：再点一次回到那个视图
  const preStatsMode = useRef<'day' | 'month'>('day');

  function bumpRefresh() {
    setRefreshKey((k) => k + 1);
  }

  function handleStatsPress() {
    if (mode === 'stats') {
      setMode(preStatsMode.current);
    } else {
      preStatsMode.current = mode === 'month' ? 'month' : 'day';
      setMode('stats');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>时间</Text>
        <View style={styles.headerIcons}>
          <Pressable style={styles.textButton} onPress={() => router.push('/timelog-categories')}>
            <Text style={styles.textButtonLabel}>分类</Text>
          </Pressable>
          <Pressable style={styles.textButton} onPress={() => router.push('/timelog-tags')}>
            <Text style={styles.textButtonLabel}>标签</Text>
          </Pressable>
          <Pressable style={styles.textButton} onPress={() => setMode(mode === 'day' ? 'month' : 'day')}>
            <Text style={styles.textButtonLabel}>{mode === 'day' ? '月' : '日'}</Text>
          </Pressable>
          <Pressable style={styles.textButton} onPress={handleStatsPress}>
            <Text style={styles.textButtonLabel}>统计</Text>
          </Pressable>
        </View>
      </View>

      {mode === 'day' && <WeekDateStrip date={date} onDateChange={setDate} refreshKey={refreshKey} />}

      {mode === 'day' &&
        (dayView === 'block' ? (
          <TimeBlockView date={date} refreshKey={refreshKey} onChanged={bumpRefresh} />
        ) : (
          <TimeAxisView date={date} refreshKey={refreshKey} onChanged={bumpRefresh} />
        ))}
      {mode === 'month' && (
        <MonthCalendarView
          month={date}
          onMonthChange={setDate}
          onSelectDate={(d) => {
            setDate(d);
            setMode('day');
          }}
          refreshKey={refreshKey}
        />
      )}
      {mode === 'stats' && <StatsView />}

      {mode === 'day' && (
        <Pressable style={styles.viewToggleFab} onPress={() => setDayView((v) => (v === 'block' ? 'axis' : 'block'))}>
          <Text style={styles.viewToggleFabText}>{dayView === 'block' ? '☰' : '田'}</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  pageTitle: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  textButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.button,
    backgroundColor: colors.purpleLight,
  },
  textButtonLabel: {
    fontSize: fontSize.tiny,
    color: colors.purpleDark,
    fontWeight: '600',
  },
  viewToggleFab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.purpleDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  viewToggleFabText: { color: '#fff', fontSize: 22 },
});
