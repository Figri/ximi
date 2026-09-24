import { useEffect, useRef, useState } from 'react';
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
import { router } from 'expo-router';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { applySelectionFill, fetchLogsForDate } from '../../lib/timelog';
import { fetchDailySummary } from '../../lib/dailySummary';
import { setDaySummary } from '../../lib/timeline';
import { useTimeLogStore } from '../../lib/timelogStore';
import { AddLogModal } from './AddLogModal';
import { PromptModal } from '../PromptModal';
import type { TimeCategory, TimeLog } from '../../types';

const HOUR_HEIGHT_NORMAL = 44;
const HOUR_HEIGHT_EXPANDED = 64;
const GRANULARITY_OPTIONS = [5, 10, 15, 30];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

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
  onChanged?: () => void;
}

interface ModalState {
  log: TimeLog | null;
  categoryId: string | null;
  start: Date;
  end: Date;
}

export function DayGanttView({ date, refreshKey, onChanged }: DayGanttViewProps) {
  const { categories, fetchAll: fetchCategoriesAndTags } = useTimeLogStore();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [localRefresh, setLocalRefresh] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [locked, setLocked] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [granularity, setGranularity] = useState(5);
  const [selectedCells, setSelectedCells] = useState<Set<number>>(new Set());
  const [trackWidth, setTrackWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [summaryText, setSummaryText] = useState('');
  const [editingSummary, setEditingSummary] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const hasScrolledToNow = useRef(false);

  useEffect(() => {
    if (categories.length === 0) fetchCategoriesAndTags();
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchLogsForDate(date)
      .then(setLogs)
      .finally(() => setLoading(false));
    fetchDailySummary(date).then((s) => setSummaryText(s?.summary ?? ''));
    hasScrolledToNow.current = false;
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

  const HOUR_HEIGHT = expanded ? HOUR_HEIGHT_EXPANDED : HOUR_HEIGHT_NORMAL;
  const editRowHeight = editMode ? Math.max(18, viewportHeight / 24) : HOUR_HEIGHT;
  const cellsPerHour = Math.max(1, Math.round(60 / granularity));
  const cellWidth = trackWidth / cellsPerHour;

  function notifyChanged() {
    setLocalRefresh((k) => k + 1);
    onChanged?.();
  }

  function handleTrackLayout(evt: LayoutChangeEvent) {
    setTrackWidth(evt.nativeEvent.layout.width);
    if (!editMode) setViewportHeight(evt.nativeEvent.layout.height);
  }

  function addCellFromTouch(x: number, y: number) {
    if (cellWidth <= 0) return;
    const row = Math.max(0, Math.min(23, Math.floor(y / editRowHeight)));
    const col = Math.max(0, Math.min(cellsPerHour - 1, Math.floor(x / cellWidth)));
    const index = row * cellsPerHour + col;
    setSelectedCells((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => editMode && !locked,
      onMoveShouldSetPanResponder: () => editMode && !locked,
      onPanResponderGrant: (evt) => addCellFromTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
      onPanResponderMove: (evt) => addCellFromTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
      onPanResponderRelease: () => {},
      onPanResponderTerminate: () => {},
    })
  ).current;

  useEffect(() => {
    // 重新进editMode或改粒度时清空选区
    setSelectedCells(new Set());
  }, [editMode, granularity]);

  useEffect(() => {
    if (loading || hasScrolledToNow.current || !isToday || editMode) return;
    hasScrolledToNow.current = true;
    const y = Math.max(0, (nowMinutes / 60) * HOUR_HEIGHT - 120);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: false }));
  }, [loading, isToday, editMode]);

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

  const selectionTotalMinutes = selectedCells.size * granularity;
  const selectionRangeLabel =
    selectionRuns.length > 0
      ? `${formatHM(selectionRuns[0].startIdx * granularity)}-${formatHM((selectionRuns[selectionRuns.length - 1].endIdx + 1) * granularity)}`
      : '还没划选';

  async function handleFillCategory(categoryId: string) {
    if (selectionRuns.length === 0) return;
    const cat = categoryById[categoryId];
    const runs = selectionRuns.map((r) => ({
      start: new Date(dayStart.getTime() + r.startIdx * granularity * 60_000),
      end: new Date(dayStart.getTime() + (r.endIdx + 1) * granularity * 60_000),
    }));
    try {
      await applySelectionFill(runs, categoryId, cat?.default_description ?? null, logs);
      setSelectedCells(new Set());
      notifyChanged();
    } catch (err) {
      Alert.alert('记录失败', err instanceof Error ? err.message : String(err));
    }
  }

  function handleBlockPress(log: TimeLog) {
    if (editMode) return;
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

  function handleOpenSettings() {
    Alert.alert('时间日志设置', undefined, [
      { text: '取消', style: 'cancel' },
      { text: '📁 分类管理', onPress: () => router.push('/timelog-categories') },
      { text: '💭 情绪标签管理', onPress: () => router.push('/timelog-tags') },
    ]);
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
            {editMode && (
              <View style={styles.selectionOverlay}>
                <View style={styles.selectionCard}>
                  <Text style={styles.selectionCardTitle}>
                    选区（{selectionTotalMinutes > 0 ? formatDuration(selectionTotalMinutes) : '0'}）
                  </Text>
                  <Text style={styles.selectionCardRange}>{selectionRangeLabel}</Text>
                </View>
                <View style={styles.selectionCard}>
                  <Text style={styles.selectionCardTitle}>一个块等于{granularity}分钟</Text>
                  <View style={styles.granularityRow}>
                    {GRANULARITY_OPTIONS.map((g) => (
                      <Pressable
                        key={g}
                        style={[styles.granularityChip, granularity === g && styles.granularityChipActive]}
                        onPress={() => setGranularity(g)}
                      >
                        <Text style={[styles.granularityChipText, granularity === g && styles.granularityChipTextActive]}>
                          {g}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            )}
            {editMode && (
              <View style={styles.warnRow}>
                <Text style={styles.warnText}>
                  注：被完全覆盖的事件，会将其删除，备注会丢失。时间部分重叠的事件，会将其截断
                </Text>
                <Pressable style={styles.exitButton} onPress={() => setEditMode(false)}>
                  <Text style={styles.exitButtonText}>✕</Text>
                </Pressable>
              </View>
            )}

            {editMode ? (
              <View style={[styles.gridBody, { height: editRowHeight * 24 }]} onLayout={handleTrackLayout}>
                <View style={styles.hourCol}>
                  {HOURS.map((h) => (
                    <View key={h} style={{ height: editRowHeight, justifyContent: 'flex-start' }}>
                      <Text style={styles.hourLabel}>{h}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.trackCol} {...panResponder.panHandlers}>
                  {HOURS.map((h) => (
                    <View key={h} style={[styles.gridRow, { height: editRowHeight }]}>
                      {Array.from({ length: cellsPerHour }, (_, col) => {
                        const index = h * cellsPerHour + col;
                        const selected = selectedCells.has(index);
                        return (
                          <View
                            key={col}
                            style={[styles.gridCell, selected && styles.gridCellSelected]}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <ScrollView ref={scrollRef} contentContainerStyle={{ height: HOUR_HEIGHT * 24 + spacing.lg }}>
                <View style={styles.grid}>
                  <View style={styles.hourCol}>
                    {HOURS.map((h) => (
                      <View key={h} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
                        <Text style={styles.hourLabel}>{h}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.trackCol} onLayout={handleTrackLayout}>
                    {HOURS.map((h) => (
                      <View key={h} style={[styles.emptySlot, { height: HOUR_HEIGHT, top: h * HOUR_HEIGHT }]}>
                        <View style={styles.emptySlotDots}>
                          {Array.from({ length: 8 }, (_, i) => (
                            <View key={i} style={styles.emptyDot} />
                          ))}
                        </View>
                      </View>
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
                        </Pressable>
                      );
                    })}

                    {isToday && nowMinutes >= 0 && (
                      <View style={[styles.nowMarker, { top: (nowMinutes / 60) * HOUR_HEIGHT }]} pointerEvents="none">
                        <View style={styles.nowCaret} />
                        <Text style={styles.nowLabel}>
                          {now.toLocaleTimeString('zh-CN', { hour12: false })}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </ScrollView>
            )}
          </View>

          <View style={styles.rightCol}>
            <View style={styles.controlCard}>
              <Pressable style={styles.controlHalf} onPress={() => setExpanded((v) => !v)}>
                <Text style={styles.controlIcon}>⇕</Text>
              </Pressable>
              <View style={styles.controlDivider} />
              <Pressable style={styles.controlHalf} onPress={handleOpenSettings}>
                <Text style={styles.controlIcon}>⚙</Text>
              </Pressable>
            </View>
            <View style={styles.controlCard}>
              <Pressable
                style={[styles.controlHalf, editMode && styles.controlHalfActive]}
                onPress={() => setEditMode((v) => !v)}
              >
                <Text style={[styles.controlIcon, editMode && styles.controlIconActive]}>✎</Text>
              </Pressable>
              <View style={styles.controlDivider} />
              <Pressable style={styles.controlHalf} onPress={() => setLocked((v) => !v)}>
                <Text style={[styles.controlIcon, locked && styles.controlIconActive]}>{locked ? '🔒' : '🔓'}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.collapseButton} onPress={() => setPaletteCollapsed((v) => !v)}>
              <Text style={styles.collapseIcon}>{paletteCollapsed ? '∨' : '∧'}</Text>
            </Pressable>

            {!paletteCollapsed && (
              <ScrollView style={styles.palette} contentContainerStyle={styles.paletteContent}>
                {topLevelCategories.map((c) => (
                  <Pressable
                    key={c.id}
                    style={[styles.paletteChip, { backgroundColor: c.color }]}
                    onPress={() => (editMode ? handleFillCategory(c.id) : setEditMode(true))}
                  >
                    <Text style={styles.paletteChipText} numberOfLines={1}>
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
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
  grid: { flexDirection: 'row' },
  hourCol: { width: 24 },
  hourRow: { justifyContent: 'flex-start' },
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
  selectionOverlay: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  selectionCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    borderWidth: 1.5,
    borderColor: colors.textPrimary,
    padding: spacing.sm,
  },
  selectionCardTitle: { fontSize: fontSize.secondary, color: colors.textPrimary, fontWeight: '600' },
  selectionCardRange: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: 2 },
  granularityRow: { flexDirection: 'row', gap: 4, marginTop: 6 },
  granularityChip: {
    flex: 1,
    paddingVertical: 4,
    borderRadius: radius.widget - 2,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  granularityChipActive: { backgroundColor: colors.purpleDark },
  granularityChipText: { fontSize: fontSize.tiny, color: colors.textSecondary },
  granularityChipTextActive: { color: '#fff', fontWeight: '700' },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  warnText: { flex: 1, fontSize: 10, lineHeight: 13, color: '#B8860B' },
  exitButton: {
    width: 36,
    height: 36,
    borderRadius: radius.widget,
    backgroundColor: colors.redDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  gridBody: { flexDirection: 'row' },
  gridRow: { flexDirection: 'row' },
  gridCell: {
    flex: 1,
    backgroundColor: '#D6EAF8',
    borderWidth: 0.5,
    borderColor: '#EAF4FA',
  },
  gridCellSelected: { backgroundColor: '#8B99A8' },
  rightCol: { width: 68, marginLeft: spacing.sm },
  controlCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  controlHalf: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm },
  controlHalfActive: { backgroundColor: colors.purpleLight },
  controlDivider: { width: 1, backgroundColor: colors.background },
  controlIcon: { fontSize: 15, color: colors.textSecondary },
  controlIconActive: { color: colors.purpleDark },
  collapseButton: { alignItems: 'center', paddingVertical: 4, marginBottom: spacing.xs },
  collapseIcon: { fontSize: 13, color: colors.textMuted },
  palette: { flex: 1 },
  paletteContent: { paddingBottom: spacing.xl * 2, gap: spacing.xs },
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
