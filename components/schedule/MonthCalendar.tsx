import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchMonthMarks, toDateKey, type MonthMark } from '../../lib/schedule';

interface Props {
  dateKey: string; // 当前选中日期，决定默认显示哪个月
  onSelectDate: (dateKey: string) => void;
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

// 向下推开的月历面板：蓝点=有事项/有记录，星星=有星标事项(替换蓝点)。
export function MonthCalendar({ dateKey, onSelectDate }: Props) {
  const [y, m] = dateKey.split('-').map(Number);
  const [year, setYear] = useState(y);
  const [month0, setMonth0] = useState(m - 1); // 0-indexed
  const [marks, setMarks] = useState<MonthMark[]>([]);

  useEffect(() => {
    fetchMonthMarks(year, month0).then(setMarks);
  }, [year, month0]);

  const markByDate: Record<string, MonthMark> = {};
  for (const mk of marks) markByDate[mk.dateKey] = mk;

  const firstWeekday = new Date(year, month0, 1).getDay();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function prevMonth() {
    if (month0 === 0) {
      setYear(year - 1);
      setMonth0(11);
    } else {
      setMonth0(month0 - 1);
    }
  }
  function nextMonth() {
    if (month0 === 11) {
      setYear(year + 1);
      setMonth0(0);
    } else {
      setMonth0(month0 + 1);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={prevMonth} hitSlop={8}>
          <Text style={styles.nav}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{year}年{month0 + 1}月</Text>
        <Pressable onPress={nextMonth} hitSlop={8}>
          <Text style={styles.nav}>›</Text>
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((w) => (
          <Text key={w} style={styles.weekLabel}>{w}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={i} style={styles.cell} />;
          const cellDateKey = toDateKey(new Date(year, month0, day));
          const isSelected = cellDateKey === dateKey;
          const mark = markByDate[cellDateKey];
          return (
            <Pressable key={i} style={styles.cell} onPress={() => onSelectDate(cellDateKey)}>
              <View style={[styles.dayCircle, isSelected && styles.dayCircleSelected]}>
                <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>{day}</Text>
              </View>
              {mark && <Text style={styles.mark}>{mark.starred ? '★' : '●'}</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const CELL = 40;

const styles = StyleSheet.create({
  container: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, margin: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  nav: { fontSize: 20, color: colors.purpleDark, fontWeight: '700', paddingHorizontal: spacing.md },
  title: { fontSize: fontSize.cardName, fontWeight: '700', color: colors.textPrimary },
  weekRow: { flexDirection: 'row' },
  weekLabel: { width: CELL, textAlign: 'center', fontSize: fontSize.tiny, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 28, height: 28, borderRadius: radius.avatar, alignItems: 'center', justifyContent: 'center' },
  dayCircleSelected: { backgroundColor: colors.purpleDark },
  dayText: { fontSize: fontSize.secondary, color: colors.textPrimary },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  mark: { position: 'absolute', bottom: 1, fontSize: 8, color: colors.yellowDark },
});
