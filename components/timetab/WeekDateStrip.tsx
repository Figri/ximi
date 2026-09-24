import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchLogCountsForRange } from '../../lib/timelog';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7; // 0=周一
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface WeekDateStripProps {
  date: Date;
  onDateChange: (date: Date) => void;
  refreshKey: number;
}

export function WeekDateStrip({ date, onDateChange, refreshKey }: WeekDateStripProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const today = new Date();
  const weekStart = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  useEffect(() => {
    fetchLogCountsForRange(days).then(setCounts);
  }, [weekStart.getTime(), refreshKey]);

  return (
    <View style={styles.container}>
      <View style={styles.dateRow}>
        <Text style={styles.dateLabel}>
          {date.getMonth() + 1}月{date.getDate()}日
        </Text>
        <Pressable style={styles.todayButton} onPress={() => onDateChange(new Date())}>
          <Text style={styles.todayButtonText}>今</Text>
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((w) => (
          <Text key={w} style={styles.weekdayLabel}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.dayRow}>
        {days.map((d) => {
          const isSelected = isSameDay(d, date);
          const isToday = isSameDay(d, today);
          const count = counts[toDateKey(d)] ?? 0;
          return (
            <Pressable key={d.toISOString()} style={styles.dayCol} onPress={() => onDateChange(d)}>
              <View style={[styles.dayCircle, isSelected && styles.dayCircleSelected]}>
                <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>
                  {isToday && !isSelected ? '今' : d.getDate()}
                </Text>
              </View>
              <Text style={styles.dayCount}>{count > 0 ? count : ''}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  dateLabel: { fontSize: fontSize.cardName, fontWeight: '700', color: colors.textPrimary },
  todayButton: {
    width: 24,
    height: 24,
    borderRadius: radius.avatar,
    backgroundColor: colors.blueLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayButtonText: { fontSize: fontSize.tiny, color: colors.blueDark, fontWeight: '700' },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: fontSize.tiny, color: colors.textMuted },
  dayRow: { flexDirection: 'row' },
  dayCol: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: radius.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: { backgroundColor: colors.purpleDark },
  dayNumber: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  dayNumberSelected: { color: '#fff' },
  dayCount: { fontSize: 9, color: colors.blueDark, marginTop: 1, includeFontPadding: false },
});
