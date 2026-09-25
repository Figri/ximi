import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { applySelectionFill, fetchLastLogEnd, fetchLogsForDate } from '../../lib/timelog';
import { fetchDailySummary } from '../../lib/dailySummary';
import { setDaySummary } from '../../lib/timeline';
import { useTimeLogStore } from '../../lib/timelogStore';
import { AddLogModal } from './AddLogModal';
import { PromptModal } from '../PromptModal';
import type { TimeCategory, TimeLog } from '../../types';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const CELLS_PER_ROW = 12; // 每小时固定12格，每格5分钟
const CELL_MINUTES = 60 / CELLS_PER_ROW;

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function minutesSinceMidnight(date: Date, dayStart: Date): number {
  return Math.max(0, Math.min(24 * 60, (date.getTime() - dayStart.getTime()) / 60000));
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}时`;
  return `${h}时${m}分`;
}

function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface DayGanttViewProps {
  date: Date;
  refreshKey: number;
  gridMode: boolean;
  onChanged?: () => void;
}

interface ModalState {
  log: TimeLog | null;
  categoryId: string | null;
  start: Date;
  end: Date;
}

export function DayGanttView({ date, refreshKey, gridMode, onChanged }: DayGanttViewProps) {
  const { categories, fetchAll: fetchCategoriesAndTags } = useTimeLogStore();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [localRefresh, setLocalRefresh] = useState(0);
  const [selectedCells, setSelectedCells] = useState<Set<number>>(new Set());
  const [areaHeight, setAreaHeight] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [summaryText, setSummaryText] = useState('');
  const [editingSummary, setEditingSummary] = useState(false);

  useEffect(() => {
    if (categories.length === 0) fetchCategoriesAndTags();
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchLogsForDate(date)
      .then(setLogs)
      .finally(() => setLoading(false));
    fetchDailySummary(date).then((s) => setSummaryText(s?.summary ?? ''));
  }, [date, refreshKey, localRefresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const categoryById: Record<string, TimeCategory> = {};
  for (const c of categories) categoryById[c.id] = c;
  const topLevelCategories = categories.filter((c) => !c.parent_id);

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const isToday = isSameDay(date, now);
  const nowMinutes = isToday ? minutesSinceMidnight(now, dayStart) : -1;

  // 时间轴容器自己实际分到的高度 ÷ 24 = 每小时行高。绝不用「屏幕高÷24」。
  const ROW_H = areaHeight > 0 ? areaHeight / 24 : 0;
  const cellWidth = trackWidth / CELLS_PER_ROW;

  function notifyChanged() {
    setLocalRefresh((k) => k + 1);
    onChanged?.();
  }

  function handleAreaLayout(evt: LayoutChangeEvent) {
    setAreaHeight(evt.nativeEvent.layout.height);
  }

  function handleTrackWidthLayout(evt: LayoutChangeEvent) {
    setTrackWidth(evt.nativeEvent.layout.width);
  }

  function addCellFromTouch(x: number, y: number) {
    if (ROW_H <= 0 || cellWidth <= 0) return;
    const row = Math.max(0, Math.min(23, Math.floor(y / ROW_H)));
    const col = Math.max(0, Math.min(CELLS_PER_ROW - 1, Math.floor(x / cellWidth)));
    const index = row * CELLS_PER_ROW + col;
    setSelectedCells((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }

  // 每次渲染都重建，避免回调闭包锁死在首次渲染的 gridMode/ROW_H 上
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => gridMode,
    onMoveShouldSetPanResponder: () => gridMode,
    onPanResponderGrant: (evt) => addCellFromTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
    onPanResponderMove: (evt) => addCellFromTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
    onPanResponderRelease: () => {},
    onPanResponderTerminate: () => {},
  });

  useEffect(() => {
    // 切进/切出网格图时清空选区
    setSelectedCells(new Set());
  }, [gridMode]);

  const selectionRuns = (() => {
    if (selectedCells.size === 0) return [];
    const sorted = Array.from(selectedCells).sort((a, b) => a - b);
    const runs: { startIdx: number; endIdx: number }[] = [];
    let runStart = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === prev + 1) {
        prev = sorted[i];
        continue;
      }
      runs.push({ startIdx: runStart, endIdx: prev });
      runStart = sorted[i];
      prev = sorted[i];
    }
    runs.push({ startIdx: runStart, endIdx: prev });
    return runs;
  })();

  const selectionTotalMinutes = selectedCells.size * CELL_MINUTES;
  const selectionRangeLabel =
    selectionRuns.length > 0
      ? `${formatHM(selectionRuns[0].startIdx * CELL_MINUTES)}-${formatHM((selectionRuns[selectionRuns.length - 1].endIdx + 1) * CELL_MINUTES)}`
      : '还没划选';

  async function handleFillCategory(categoryId: string) {
    if (selectionRuns.length === 0) return;
    const cat = categoryById[categoryId];
    const runs = selectionRuns.map((r) => ({
      start: new Date(dayStart.getTime() + r.startIdx * CELL_MINUTES * 60_000),
      end: new Date(dayStart.getTime() + (r.endIdx + 1) * CELL_MINUTES * 60_000),
    }));
    try {
      await applySelectionFill(runs, categoryId, cat?.default_description ?? null, logs);
      setSelectedCells(new Set());
      notifyChanged();
    } catch (err) {
      Alert.alert('记录失败', err instanceof Error ? err.message : String(err));
    }
  }

  /** 色块图下点色卡 = 从上一条记录结束接到现在，快速记一笔 */
  async function handleQuickContinue(categoryId: string) {
    const lastEnd = await fetchLastLogEnd();
    const fallbackStart = new Date(Date.now() - 15 * 60_000);
    const start = lastEnd && lastEnd.getTime() < Date.now() ? lastEnd : fallbackStart;
    setModalState({ log: null, categoryId, start, end: new Date() });
  }

  function handlePalettePress(categoryId: string) {
    if (gridMode) {
      handleFillCategory(categoryId);
    } else {
      handleQuickContinue(categoryId);
    }
  }

  function handleBlockPress(log: TimeLog) {
    if (gridMode) return;
    setModalState({
      log,
      categoryId: log.category_id,
      start: new Date(log.start_time),
      end: new Date(log.end_time),
    });
  }

  function handleModalSaved() {
    setModalState(null);
    notifyChanged();
  }

  async function handleSaveSummary(text: string) {
    setEditingSummary(false);
    await setDaySummary(date, text);
    setSummaryText(text.trim());
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.summaryRow} onPress={() => setEditingSummary(true)}>
        <Text style={styles.summaryText} numberOfLines={1}>
          {summaryText || '点这里写一行摘要（给月历用）'}
        </Text>
      </Pressable>
      <PromptModal
        visible={editingSummary}
        title="这天的一行摘要"
        initialValue={summaryText}
        placeholder="给月历格子用的一行字"
        onCancel={() => setEditingSummary(false)}
        onSubmit={handleSaveSummary}
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />
      ) : (
        <View style={styles.body}>
          <View style={styles.leftCol}>
            {gridMode && (
              <View style={styles.selectionCard}>
                <Text style={styles.selectionCardTitle}>
                  选区（{selectionTotalMinutes > 0 ? formatDuration(selectionTotalMinutes) : '0'}）
                </Text>
                <Text style={styles.selectionCardRange}>{selectionRangeLabel}</Text>
              </View>
            )}

            <View style={styles.axisArea} onLayout={handleAreaLayout}>
              {areaHeight > 0 && (
                <>
                  <View style={styles.hourCol}>
                    {HOURS.map((h) => (
                      <View key={h} style={{ height: ROW_H }}>
                        <Text style={styles.hourLabel}>{h}</Text>
                      </View>
                    ))}
                  </View>

                  <View
                    style={styles.trackCol}
                    onLayout={handleTrackWidthLayout}
                    {...(gridMode ? panResponder.panHandlers : {})}
                  >
                    {gridMode
                      ? HOURS.map((h) => (
                          <View key={h} style={[styles.gridRow, { height: ROW_H }]}>
                            {Array.from({ length: CELLS_PER_ROW }, (_, col) => {
                              const index = h * CELLS_PER_ROW + col;
                              const selected = selectedCells.has(index);
                              return <View key={col} style={[styles.gridCell, selected && styles.gridCellSelected]} />;
                            })}
                          </View>
                        ))
                      : (
                          <>
                            {HOURS.map((h) => (
                              <View key={h} style={[styles.emptySlot, { height: ROW_H, top: h * ROW_H }]}>
                                <View style={styles.emptySlotDots}>
                                  {Array.from({ length: 8 }, (_, i) => (
                                    <View key={i} style={styles.emptyDot} />
                                  ))}
                                </View>
                              </View>
                            ))}

                            {logs.map((log) => {
                              const cat = log.category_id ? categoryById[log.category_id] : null;
                              const top = (minutesSinceMidnight(new Date(log.start_time), dayStart) / 60) * ROW_H;
                              const bottom = (minutesSinceMidnight(new Date(log.end_time), dayStart) / 60) * ROW_H;
                              const height = Math.max(2, bottom - top);
                              return (
                                <Pressable
                                  key={log.id}
                                  onPress={() => handleBlockPress(log)}
                                  style={[
                                    styles.block,
                                    { top, height, backgroundColor: cat?.color ?? colors.textMuted },
                                  ]}
                                >
                                  {height >= 14 && (
                                    <Text style={styles.blockText} numberOfLines={1}>
                                      {cat?.name ?? '未分类'}
                                    </Text>
                                  )}
                                </Pressable>
                              );
                            })}

                            {isToday && nowMinutes >= 0 && (
                              <View style={[styles.nowMarker, { top: (nowMinutes / 60) * ROW_H }]} pointerEvents="none">
                                <View style={styles.nowCaret} />
                                <Text style={styles.nowLabel}>
                                  {now.toLocaleTimeString('zh-CN', { hour12: false })}
                                </Text>
                              </View>
                            )}
                          </>
                        )}
                  </View>
                </>
              )}
            </View>
          </View>

          <View style={styles.rightCol}>
            <ScrollView style={styles.palette} contentContainerStyle={styles.paletteContent}>
              {topLevelCategories.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.paletteChip, { backgroundColor: c.color }]}
                  onPress={() => handlePalettePress(c.id)}
                >
                  <Text style={styles.paletteChipText} numberOfLines={1}>
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      <AddLogModal
        visible={!!modalState}
        log={modalState?.log}
        initialCategoryId={modalState?.categoryId}
        initialStart={modalState?.start}
        initialEnd={modalState?.end}
        onClose={() => setModalState(null)}
        onSaved={handleModalSaved}
        onDeleted={handleModalSaved}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summaryRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  summaryText: { fontSize: fontSize.tiny, color: colors.textMuted, textAlign: 'center' },
  body: { flex: 1, flexDirection: 'row', paddingHorizontal: spacing.lg },
  leftCol: { flex: 1 },
  axisArea: { flex: 1, flexDirection: 'row' },
  hourCol: { width: 24 },
  hourLabel: { fontSize: fontSize.tiny, color: colors.textMuted, includeFontPadding: false },
  trackCol: { flex: 1, position: 'relative', marginLeft: spacing.xs },
  emptySlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#D6EAF8',
    borderTopWidth: 1,
    borderTopColor: '#EAF4FA',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  emptySlotDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 8 },
  emptyDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#fff' },
  block: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  blockText: { fontSize: fontSize.tiny, color: '#fff', fontWeight: '600', includeFontPadding: false },
  nowMarker: { position: 'absolute', left: -6, flexDirection: 'row', alignItems: 'center', gap: 2 },
  nowCaret: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 7,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.blueDark,
  },
  nowLabel: {
    fontSize: 9,
    color: '#fff',
    fontWeight: '700',
    backgroundColor: colors.blueDark,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    includeFontPadding: false,
  },
  selectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    borderWidth: 1.5,
    borderColor: colors.textPrimary,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  selectionCardTitle: { fontSize: fontSize.secondary, color: colors.textPrimary, fontWeight: '600' },
  selectionCardRange: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: 2 },
  gridRow: { flexDirection: 'row' },
  gridCell: {
    flex: 1,
    backgroundColor: '#D6EAF8',
    borderWidth: 0.5,
    borderColor: '#EAF4FA',
  },
  gridCellSelected: { backgroundColor: '#8A94A6' },
  rightCol: { width: 68, marginLeft: spacing.sm },
  palette: { flex: 1 },
  paletteContent: { paddingBottom: spacing.sm, gap: spacing.xs },
  paletteChip: {
    borderRadius: radius.widget,
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: spacing.xs,
  },
  paletteChipText: { fontSize: fontSize.tiny, color: '#fff', fontWeight: '700', includeFontPadding: false },
});
