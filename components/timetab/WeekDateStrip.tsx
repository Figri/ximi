import { useEffect, useRef, useState } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

const SWIPE_THRESHOLD = 50;

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
  // 这周7天各自的"有几条"数字，不传就不显示——time模块传time_logs条数，
  // todo模块传当天事项数，让这个组件不跟任何一个模块的数据源绑死
  fetchCounts: (dates: Date[]) => Promise<Record<string, number>>;
  /** 「今」落在哪天。今天页按「一天从 5 点算起」传进来，凌晨还算前一天；不传就是日历上的今天 */
  today?: Date;
  /** 今天页自己的页头已经写了日期，这里就不再显示那一行 */
  hideDateRow?: boolean;
}

export function WeekDateStrip({ date, onDateChange, refreshKey, fetchCounts, today: todayProp, hideDateRow }: WeekDateStripProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const today = todayProp ?? new Date();
  const weekStart = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  useEffect(() => {
    fetchCounts(days).then(setCounts);
  }, [weekStart.getTime(), refreshKey]);

  // 左右滑切周：直接读手指的原始触摸事件（onTouchStart/Move/End 会从被按的那个数字一路冒泡上来），
  // 不走 PanResponder 的「抢不抢响应」那一套。以前用 PanResponder：手指按在日期数字上时外层收不到「按下」，
  // 「这次已经切过了」的标记清不掉，滑动距离还会接着上一次累加——所以切过一次就切不动，
  // 往左滑过再往右滑也回不去。现在每次按下都从头算，一次滑动只切一周。
  const touch = useRef<{ x: number; y: number; done: boolean } | null>(null);
  // 手机上 nativeEvent 自己带 pageX；网页上原始的 TouchEvent 要从 touches[0] 里取
  function pointOf(e: GestureResponderEvent): { x: number; y: number } {
    const n = e.nativeEvent as any;
    const t = n.touches?.[0] ?? n.changedTouches?.[0] ?? n;
    return { x: t.pageX, y: t.pageY };
  }
  function onTouchStart(e: GestureResponderEvent) {
    const p = pointOf(e);
    touch.current = { x: p.x, y: p.y, done: false };
  }
  function onTouchMove(e: GestureResponderEvent) {
    const st = touch.current;
    if (!st || st.done) return;
    const p = pointOf(e);
    const dx = p.x - st.x;
    const dy = p.y - st.y;
    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      st.done = true;
      const next = new Date(date);
      next.setDate(next.getDate() + (dx < 0 ? 7 : -7));
      onDateChange(next);
    }
  }
  function onTouchEnd() {
    touch.current = null;
  }

  return (
    <View style={styles.container} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      {hideDateRow ? null : (
      <View style={styles.dateRow}>
        <Text style={styles.dateLabel}>
          {date.getMonth() + 1}月{date.getDate()}日
        </Text>
        <Pressable style={styles.todayButton} onPress={() => onDateChange(todayProp ?? new Date())}>
          <Text style={styles.todayButtonText}>今</Text>
        </Pressable>
      </View>
      )}

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
