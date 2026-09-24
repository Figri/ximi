import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchLogsForDate } from '../../lib/timelog';
import { useTimeLogStore } from '../../lib/timelogStore';
import type { TimeCategory, TimeLog } from '../../types';

const HOUR_HEIGHT = 44;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function minutesSinceMidnight(date: Date, dayStart: Date): number {
  return Math.max(0, Math.min(24 * 60, (date.getTime() - dayStart.getTime()) / 60000));
}

interface DayGanttViewProps {
  date: Date;
  refreshKey: number;
  onBlockPress?: (log: TimeLog) => void;
}

export function DayGanttView({ date, refreshKey, onBlockPress }: DayGanttViewProps) {
  const { categories, fetchAll: fetchCategoriesAndTags } = useTimeLogStore();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (categories.length === 0) fetchCategoriesAndTags();
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchLogsForDate(date)
      .then(setLogs)
      .finally(() => setLoading(false));
  }, [date, refreshKey]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const categoryById: Record<string, TimeCategory> = {};
  for (const c of categories) categoryById[c.id] = c;

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const isToday = isSameDay(date, now);
  const nowMinutes = isToday ? minutesSinceMidnight(now, dayStart) : -1;
  const nowLabel = now.toLocaleTimeString('zh-CN', { hour12: false });

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />
      ) : (
        <ScrollView contentContainerStyle={{ height: HOUR_HEIGHT * 24 + spacing.lg }}>
          <View style={styles.grid}>
            <View style={styles.hourCol}>
              {HOURS.map((h) => (
                <View key={h} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
                  <Text style={styles.hourLabel}>{h}</Text>
                </View>
              ))}
            </View>

            <View style={styles.trackCol}>
              {HOURS.map((h) => (
                <View key={h} style={[styles.emptySlot, { height: HOUR_HEIGHT, top: h * HOUR_HEIGHT }]} />
              ))}

              {logs.map((log) => {
                const cat = log.category_id ? categoryById[log.category_id] : null;
                const top = (minutesSinceMidnight(new Date(log.start_time), dayStart) / 60) * HOUR_HEIGHT;
                const bottom = (minutesSinceMidnight(new Date(log.end_time), dayStart) / 60) * HOUR_HEIGHT;
                const height = Math.max(4, bottom - top);
                return (
                  <View
                    key={log.id}
                    onTouchEnd={() => onBlockPress?.(log)}
                    style={[
                      styles.block,
                      { top, height, backgroundColor: cat?.color ?? colors.textMuted },
                    ]}
                  >
                    {height >= 16 && (
                      <Text style={styles.blockText} numberOfLines={height >= 34 ? 2 : 1}>
                        {cat?.name ?? '未分类'}
                        {height >= 34 && log.description ? `\n${log.description}` : ''}
                      </Text>
                    )}
                  </View>
                );
              })}

              {isToday && nowMinutes >= 0 && (
                <View style={[styles.nowLine, { top: (nowMinutes / 60) * HOUR_HEIGHT }]} pointerEvents="none">
                  <View style={styles.nowDot} />
                  <View style={styles.nowLineBar} />
                  <Text style={styles.nowLabel}>{nowLabel}</Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  grid: { flexDirection: 'row', paddingHorizontal: spacing.lg },
  hourCol: { width: 28 },
  hourRow: { justifyContent: 'flex-start' },
  hourLabel: { fontSize: fontSize.tiny, color: colors.textMuted, includeFontPadding: false },
  trackCol: { flex: 1, position: 'relative', marginLeft: spacing.sm },
  emptySlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.blueLight,
    borderTopWidth: 1,
    borderTopColor: '#E4EEF5',
  },
  block: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  blockText: { fontSize: fontSize.tiny, color: '#fff', fontWeight: '600', includeFontPadding: false },
  nowLine: { position: 'absolute', left: -4, right: 0, flexDirection: 'row', alignItems: 'center' },
  nowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.redDark },
  nowLineBar: { flex: 1, height: 1.5, backgroundColor: colors.redDark },
  nowLabel: {
    fontSize: fontSize.tiny,
    color: colors.redDark,
    fontWeight: '700',
    backgroundColor: colors.background,
    paddingHorizontal: 3,
  },
});
