import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchMonthSummaries } from '../../lib/timeline';
import { fetchMonthStats } from '../../lib/timelog';

interface MonthCalendarViewProps {
  month: Date; // 任意一天代表这个月
  onMonthChange: (month: Date) => void;
  onSelectDate: (date: Date) => void;
  refreshKey: number;
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function MonthCalendarView({ month, onMonthChange, onSelectDate, refreshKey }: MonthCalendarViewProps) {
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [dominantColors, setDominantColors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchMonthSummaries(month.getFullYear(), month.getMonth()).then(setSummaries);
    fetchMonthStats(month.getFullYear(), month.getMonth()).then((stats) => {
      const colorsByDay: Record<string, string> = {};
      for (const [day, v] of Object.entries(stats)) colorsByDay[day] = v.color;
      setDominantColors(colorsByDay);
    });
  }, [month, refreshKey]);

  const weeks = useMemo(() => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstDay = new Date(year, m, 1);
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const firstWeekday = (firstDay.getDay() + 6) % 7; // 0=周一

    const cells: (Date | null)[] = [...Array(firstWeekday).fill(null)];
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, m, d));
    while (cells.length % 7 !== 0) cells.push(null);

    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [month]);

  const today = new Date();

  return (
    <View style={styles.container}>
      <View style={styles.monthNav}>
        <Pressable onPress={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          <Text style={styles.monthNavArrow}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>
          {month.getFullYear()}年{month.getMonth() + 1}月
        </Text>
        <Pressable onPress={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <Text style={styles.monthNavArrow}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((w) => (
          <Text key={w} style={styles.weekdayLabel}>
            {w}
          </Text>
        ))}
      </View>

      {weeks.map((week, i) => (
        <View key={i} style={styles.weekRow}>
          {week.map((day, j) => {
            if (!day) return <View key={j} style={styles.cell} />;
            const isToday = day.toDateString() === today.toDateString();
            const summary = summaries[toDateKey(day)];
            const dominantColor = dominantColors[toDateKey(day)];
            return (
              <Pressable key={j} style={styles.cell} onPress={() => onSelectDate(day)}>
                <View
                  style={[
                    styles.cellInner,
                    dominantColor ? { backgroundColor: dominantColor + '38' } : null,
                    isToday && styles.cellToday,
                  ]}
                >
                  <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>{day.getDate()}</Text>
                  {summary && (
                    <Text style={styles.summaryText} numberOfLines={2}>
                      {summary}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.md },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  monthNavArrow: { fontSize: 22, color: colors.textSecondary, paddingHorizontal: spacing.md },
  monthLabel: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600' },
  weekdayRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: fontSize.tiny, color: colors.textMuted },
  weekRow: { flexDirection: 'row' },
  cell: { flex: 1, aspectRatio: 0.85, padding: 2 },
  cellInner: {
    flex: 1,
    borderRadius: radius.widget,
    backgroundColor: colors.card,
    padding: 4,
  },
  cellToday: { backgroundColor: colors.purpleLight },
  dayNumber: { fontSize: fontSize.secondary, color: colors.textPrimary, fontWeight: '600' },
  dayNumberToday: { color: colors.purpleDark },
  summaryText: { fontSize: 9, lineHeight: 11, color: colors.textSecondary, marginTop: 2, includeFontPadding: false },
});
