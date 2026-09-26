import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, spacing } from '../../constants/theme';
import { WeekDateStrip } from '../../components/timetab/WeekDateStrip';
import { TimeBlockView } from '../../components/timetab/TimeBlockView';
import { TimeAxisView } from '../../components/timetab/TimeAxisView';
import { MonthCalendarView } from '../../components/timetab/MonthCalendarView';
import { StatsView } from '../../components/timetab/StatsView';

type ViewMode = 'day' | 'month' | 'stats';
type DayView = 'block' | 'axis'; // block=时间块, axis=时间轴

export default function TimelineScreen() {
  const [mode, setMode] = useState<ViewMode>('day');
  const [dayView, setDayView] = useState<DayView>('axis');
  const [date, setDate] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);

  function bumpRefresh() {
    setRefreshKey((k) => k + 1);
  }

  function handleOpenMenu() {
    Alert.alert('时间日志设置', undefined, [
      { text: '取消', style: 'cancel' },
      { text: '📁 分类管理', onPress: () => router.push('/timelog-categories') },
      { text: '💭 情绪标签管理', onPress: () => router.push('/timelog-tags') },
      { text: mode === 'day' ? '📅 月历' : '📆 日视图', onPress: () => setMode(mode === 'day' ? 'month' : 'day') },
      { text: '📊 统计', onPress: () => setMode('stats') },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>时间</Text>
        <View style={styles.headerRight}>
          {mode === 'day' && (
            <Pressable style={styles.toggleBtn} onPress={() => setDayView((v) => (v === 'block' ? 'axis' : 'block'))}>
              <Text style={styles.toggleBtnText}>{dayView === 'block' ? '☰' : '田'}</Text>
            </Pressable>
          )}
          <Pressable style={styles.menuButton} onPress={handleOpenMenu}>
            <Text style={styles.menuButtonText}>⋮</Text>
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  toggleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnText: { fontSize: 16, color: colors.textSecondary },
  menuButton: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  menuButtonText: { fontSize: 20, color: colors.textSecondary, fontWeight: '700' },
});
