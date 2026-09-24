import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { DayTimelineView } from '../../components/timetab/DayTimelineView';
import { DayGanttView } from '../../components/timetab/DayGanttView';
import { MonthCalendarView } from '../../components/timetab/MonthCalendarView';
import { AddEntryModal } from '../../components/timetab/AddEntryModal';

type ViewMode = 'day' | 'month';
type DayViewMode = 'gantt' | 'list';

export default function TimelineScreen() {
  const [mode, setMode] = useState<ViewMode>('day');
  const [dayViewMode, setDayViewMode] = useState<DayViewMode>('gantt');
  const [date, setDate] = useState(new Date());
  const [addOpen, setAddOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleAdded() {
    setAddOpen(false);
    setRefreshKey((k) => k + 1);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>时间</Text>
        <View style={styles.headerRight}>
          {mode === 'day' && (
            <Pressable
              style={styles.dayViewToggle}
              onPress={() => setDayViewMode((v) => (v === 'gantt' ? 'list' : 'gantt'))}
            >
              <Text style={styles.dayViewToggleText}>{dayViewMode === 'gantt' ? '▦' : '☰'}</Text>
            </Pressable>
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
          </View>
        </View>
      </View>

      {mode === 'day' ? (
        dayViewMode === 'gantt' ? (
          <DayGanttView date={date} refreshKey={refreshKey} />
        ) : (
          <DayTimelineView date={date} onDateChange={setDate} refreshKey={refreshKey} />
        )
      ) : (
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

      <Pressable style={styles.fab} onPress={() => setAddOpen(true)}>
        <Text style={styles.fabText}>＋</Text>
      </Pressable>

      <AddEntryModal visible={addOpen} onClose={() => setAddOpen(false)} onAdded={handleAdded} />
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
  dayViewToggle: {
    width: 32,
    height: 32,
    borderRadius: radius.widget,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayViewToggleText: { fontSize: 15, color: colors.textSecondary },
  modeSwitch: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.button, padding: 2 },
  modeButton: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.button - 2 },
  modeButtonActive: { backgroundColor: colors.purple },
  modeText: { fontSize: fontSize.body, color: colors.textSecondary },
  modeTextActive: { color: colors.textPrimary, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 52,
    height: 52,
    borderRadius: radius.avatar,
    backgroundColor: colors.purpleDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 26, fontWeight: '300', marginTop: -2 },
});
