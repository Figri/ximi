import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { WeekDateStrip } from '../../components/timetab/WeekDateStrip';
import { DayGanttView } from '../../components/timetab/DayGanttView';
import { TimeLogListView } from '../../components/timetab/TimeLogListView';
import { MonthCalendarView } from '../../components/timetab/MonthCalendarView';
import { StatsView } from '../../components/timetab/StatsView';

type ViewMode = 'day' | 'month' | 'stats';
type DayViewMode = 'block' | 'grid' | 'list';
const DAY_VIEW_LABELS: Record<DayViewMode, string> = { block: '块', grid: '格', list: '表' };
const DAY_VIEW_ORDER: DayViewMode[] = ['block', 'grid', 'list'];

export default function TimelineScreen() {
  const [mode, setMode] = useState<ViewMode>('day');
  const [dayViewMode, setDayViewMode] = useState<DayViewMode>('block');
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
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>时间</Text>
        <View style={styles.headerRight}>
          <Pressable style={styles.menuButton} onPress={handleOpenMenu}>
            <Text style={styles.menuButtonText}>⋮</Text>
          </Pressable>
          {mode === 'day' && (
            <View style={styles.dayViewSwitch}>
              {DAY_VIEW_ORDER.map((v) => (
                <Pressable
                  key={v}
                  style={[styles.dayViewButton, dayViewMode === v && styles.dayViewButtonActive]}
                  onPress={() => setDayViewMode(v)}
                >
                  <Text style={[styles.dayViewText, dayViewMode === v && styles.dayViewTextActive]}>
                    {DAY_VIEW_LABELS[v]}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.modeSwitch}>
            <Pressable
              style={[styles.modeButton, mode === 'day' && styles.modeButtonActive]}
              onPress={() => setMode('day')}
            >
              <Text style={[styles.modeText, mode === 'day' && styles.modeTextActive]}>日</Text>
            </Pressable>
            <Pressable
              style={[styles.modeButton, mode === 'month' && styles.modeButtonActive]}
              onPress={() => setMode('month')}
            >
              <Text style={[styles.modeText, mode === 'month' && styles.modeTextActive]}>月</Text>
            </Pressable>
            <Pressable
              style={[styles.modeButton, mode === 'stats' && styles.modeButtonActive]}
              onPress={() => setMode('stats')}
            >
              <Text style={[styles.modeText, mode === 'stats' && styles.modeTextActive]}>统计</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {mode === 'day' && <WeekDateStrip date={date} onDateChange={setDate} refreshKey={refreshKey} />}

      {mode === 'day' &&
        (dayViewMode === 'list' ? (
          <TimeLogListView date={date} refreshKey={refreshKey} onChanged={bumpRefresh} />
        ) : (
          <DayGanttView
            date={date}
            refreshKey={refreshKey}
            gridMode={dayViewMode === 'grid'}
            onChanged={bumpRefresh}
          />
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
  menuButton: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  menuButtonText: { fontSize: 20, color: colors.textSecondary, fontWeight: '700' },
  dayViewSwitch: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.button, padding: 2 },
  dayViewButton: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.button - 2 },
  dayViewButtonActive: { backgroundColor: colors.purple },
  dayViewText: { fontSize: fontSize.body, color: colors.textSecondary },
  dayViewTextActive: { color: colors.textPrimary, fontWeight: '600' },
  modeSwitch: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.button, padding: 2 },
  modeButton: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.button - 2 },
  modeButtonActive: { backgroundColor: colors.purple },
  modeText: { fontSize: fontSize.body, color: colors.textSecondary },
  modeTextActive: { color: colors.textPrimary, fontWeight: '600' },
});
