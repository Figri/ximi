import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchLastLogEnd, fetchLogsForDate } from '../../lib/timelog';
import { useTimeLogStore } from '../../lib/timelogStore';
import { AddLogModal } from './AddLogModal';
import type { TimeCategory, TimeLog } from '../../types';

const HOUR_HEIGHT = 44;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function minutesSinceMidnight(date: Date, dayStart: Date): number {
  return Math.max(0, Math.min(24 * 60, (date.getTime() - dayStart.getTime()) / 60000));
}

function minutesFromY(y: number): number {
  const raw = (y / HOUR_HEIGHT) * 60;
  const rounded = Math.round(raw / 5) * 5;
  return Math.max(0, Math.min(24 * 60, rounded));
}

interface DayGanttViewProps {
  date: Date;
  refreshKey: number;
}

interface ModalState {
  log: TimeLog | null;
  categoryId: string | null;
  start: Date;
  end: Date;
}

export function DayGanttView({ date, refreshKey }: DayGanttViewProps) {
  const { categories, fetchAll: fetchCategoriesAndTags } = useTimeLogStore();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [localRefresh, setLocalRefresh] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [dragState, setDragState] = useState<{ startY: number; currentY: number } | null>(null);
  const [modalState, setModalState] = useState<ModalState | null>(null);

  useEffect(() => {
    if (categories.length === 0) fetchCategoriesAndTags();
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchLogsForDate(date)
      .then(setLogs)
      .finally(() => setLoading(false));
  }, [date, refreshKey, localRefresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const categoryById: Record<string, TimeCategory> = {};
  for (const c of categories) categoryById[c.id] = c;
  const topLevelCategories = categories.filter((c) => !c.parent_id);

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const isToday = isSameDay(date, now);
  const nowMinutes = isToday ? minutesSinceMidnight(now, dayStart) : -1;
  const nowLabel = now.toLocaleTimeString('zh-CN', { hour12: false });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: (evt) => {
        setScrollEnabled(false);
        const y = evt.nativeEvent.locationY;
        setDragState({ startY: y, currentY: y });
      },
      onPanResponderMove: (evt) => {
        setDragState((prev) => (prev ? { ...prev, currentY: evt.nativeEvent.locationY } : prev));
      },
      onPanResponderRelease: () => {
        setScrollEnabled(true);
        setDragState((prev) => {
          if (prev) finalizeDrag(prev);
          return null;
        });
      },
      onPanResponderTerminate: () => {
        setScrollEnabled(true);
        setDragState(null);
      },
    })
  ).current;

  function finalizeDrag(drag: { startY: number; currentY: number }) {
    const startMin = minutesFromY(Math.min(drag.startY, drag.currentY));
    const endMin = minutesFromY(Math.max(drag.startY, drag.currentY));
    if (endMin - startMin < 5) return;
    setModalState({
      log: null,
      categoryId: null,
      start: new Date(dayStart.getTime() + startMin * 60_000),
      end: new Date(dayStart.getTime() + endMin * 60_000),
    });
  }

  async function handleQuickContinue(categoryId: string) {
    const lastEnd = await fetchLastLogEnd();
    const fallbackStart = new Date(Date.now() - 15 * 60_000);
    const start = lastEnd && lastEnd.getTime() < Date.now() ? lastEnd : fallbackStart;
    setModalState({ log: null, categoryId, start, end: new Date() });
  }

  function handleBlockPress(log: TimeLog) {
    setModalState({
      log,
      categoryId: log.category_id,
      start: new Date(log.start_time),
      end: new Date(log.end_time),
    });
  }

  function handleModalClosed() {
    setModalState(null);
  }

  function handleModalSaved() {
    setModalState(null);
    setLocalRefresh((k) => k + 1);
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />
      ) : (
        <View style={styles.body}>
          <ScrollView scrollEnabled={scrollEnabled} contentContainerStyle={{ height: HOUR_HEIGHT * 24 + spacing.lg }}>
            <View style={styles.grid}>
              <View style={styles.hourCol}>
                {HOURS.map((h) => (
                  <View key={h} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
                    <Text style={styles.hourLabel}>{h}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.trackCol} {...panResponder.panHandlers}>
                {HOURS.map((h) => (
                  <View key={h} style={[styles.emptySlot, { height: HOUR_HEIGHT, top: h * HOUR_HEIGHT }]} />
                ))}

                {logs.map((log) => {
                  const cat = log.category_id ? categoryById[log.category_id] : null;
                  const top = (minutesSinceMidnight(new Date(log.start_time), dayStart) / 60) * HOUR_HEIGHT;
                  const bottom = (minutesSinceMidnight(new Date(log.end_time), dayStart) / 60) * HOUR_HEIGHT;
                  const height = Math.max(4, bottom - top);
                  return (
                    <Pressable
                      key={log.id}
                      onPress={() => handleBlockPress(log)}
                      style={[styles.block, { top, height, backgroundColor: cat?.color ?? colors.textMuted }]}
                    >
                      {height >= 16 && (
                        <Text style={styles.blockText} numberOfLines={height >= 34 ? 2 : 1}>
                          {cat?.name ?? '未分类'}
                          {height >= 34 && log.description ? `\n${log.description}` : ''}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}

                {dragState && (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.dragOverlay,
                      {
                        top: Math.min(dragState.startY, dragState.currentY),
                        height: Math.abs(dragState.currentY - dragState.startY),
                      },
                    ]}
                  />
                )}

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

          <ScrollView style={styles.palette} contentContainerStyle={styles.paletteContent}>
            {topLevelCategories.map((c) => (
              <Pressable
                key={c.id}
                style={[styles.paletteChip, { backgroundColor: c.color }]}
                onPress={() => handleQuickContinue(c.id)}
              >
                <Text style={styles.paletteChipText} numberOfLines={1}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <AddLogModal
        visible={!!modalState}
        log={modalState?.log}
        initialCategoryId={modalState?.categoryId}
        initialStart={modalState?.start}
        initialEnd={modalState?.end}
        onClose={handleModalClosed}
        onSaved={handleModalSaved}
        onDeleted={handleModalSaved}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, flexDirection: 'row' },
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
  dragOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(142,115,179,0.35)',
    borderWidth: 1.5,
    borderColor: colors.purpleDark,
    borderRadius: 4,
  },
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
  palette: { width: 64, paddingRight: spacing.sm },
  paletteContent: { paddingTop: spacing.sm, paddingBottom: spacing.xl * 2, gap: spacing.xs },
  paletteChip: {
    borderRadius: radius.widget,
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  paletteChipText: { fontSize: fontSize.tiny, color: '#fff', fontWeight: '700', includeFontPadding: false },
});
