import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { applySelectionFill, fetchLogsForDate } from '../../lib/timelog';
import { useTimeLogStore } from '../../lib/timelogStore';
import type { TimeCategory, TimeLog } from '../../types';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const CELLS_PER_ROW = 12; // 每行12格，每格5分钟，写死
const CELL_MINUTES = 5;

function minutesSinceMidnight(date: Date, dayStart: Date): number {
  return Math.max(0, Math.min(24 * 60, (date.getTime() - dayStart.getTime()) / 60000));
}

interface TimeBlockViewProps {
  date: Date;
  refreshKey: number;
  onChanged: () => void;
}

export function TimeBlockView({ date, refreshKey, onChanged }: TimeBlockViewProps) {
  const { categories, fetchAll } = useTimeLogStore();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [areaHeight, setAreaHeight] = useState(0);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [current, setCurrent] = useState<number | null>(null);

  const trackRef = useRef<View>(null);
  const trackRect = useRef({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    if (categories.length === 0) fetchAll();
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchLogsForDate(date)
      .then(setLogs)
      .finally(() => setLoading(false));
  }, [date, refreshKey]);

  const categoryById: Record<string, TimeCategory> = {};
  for (const c of categories) categoryById[c.id] = c;

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  // 时间轴容器自己实际分到的高度(onLayout量) ÷ 24 = 每小时行高
  const ROW_H = areaHeight > 0 ? areaHeight / 24 : 0;

  function measureTrack() {
    trackRef.current?.measureInWindow((x, y, w, h) => {
      trackRect.current = { x, y, w, h };
    });
  }

  // pageX/pageY 绝对坐标 - 轨道屏幕位置 = 真实局部坐标（不用 locationY，那个在不同容器嵌套下不可靠）
  function cellFromTouch(pageX: number, pageY: number): number | null {
    const { x, y, w, h } = trackRect.current;
    if (w <= 0 || h <= 0 || ROW_H <= 0) return null;
    const lx = pageX - x;
    const ly = pageY - y;
    const row = Math.max(0, Math.min(23, Math.floor(ly / ROW_H)));
    const cw = w / CELLS_PER_ROW;
    const col = Math.max(0, Math.min(CELLS_PER_ROW - 1, Math.floor(lx / cw)));
    return row * CELLS_PER_ROW + col;
  }

  // 每次渲染都重建，避免回调闭包锁死在首次渲染的状态上
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const i = cellFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      if (i != null) {
        setAnchor(i);
        setCurrent(i);
      }
    },
    onPanResponderMove: (evt) => {
      const i = cellFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      if (i != null) setCurrent(i);
    },
    onPanResponderRelease: () => {},
    onPanResponderTerminate: () => {},
  });

  // 选区 = anchor..current 之间所有 index（连续区间，实心矩形，不是涂抹出来的散点）
  const selected = useMemo(() => {
    if (anchor == null || current == null) return new Set<number>();
    const lo = Math.min(anchor, current);
    const hi = Math.max(anchor, current);
    const s = new Set<number>();
    for (let i = lo; i <= hi; i++) s.add(i);
    return s;
  }, [anchor, current]);

  function idxToRun(lo: number, hi: number): { start: Date; end: Date } {
    return {
      start: new Date(dayStart.getTime() + lo * CELL_MINUTES * 60_000),
      end: new Date(dayStart.getTime() + (hi + 1) * CELL_MINUTES * 60_000),
    };
  }

  async function fillWith(cat: TimeCategory) {
    if (selected.size === 0) return;
    const idxs = Array.from(selected).sort((a, b) => a - b);
    const runs: { start: Date; end: Date }[] = [];
    let runStart = idxs[0];
    let prev = idxs[0];
    for (let k = 1; k < idxs.length; k++) {
      if (idxs[k] !== prev + 1) {
        runs.push(idxToRun(runStart, prev));
        runStart = idxs[k];
      }
      prev = idxs[k];
    }
    runs.push(idxToRun(runStart, prev));
    const existing = await fetchLogsForDate(date);
    await applySelectionFill(runs, cat.id, null, existing);
    setAnchor(null);
    setCurrent(null);
    onChanged();
  }

  function handleAreaLayout(e: LayoutChangeEvent) {
    setAreaHeight(e.nativeEvent.layout.height);
  }

  function handleTrackLayout() {
    measureTrack();
  }

  if (loading) {
    return <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.axisArea} onLayout={handleAreaLayout}>
        {areaHeight > 0 && (
          <>
            <View style={styles.hourCol}>
              {HOURS.map((h) => (
                <View key={h} style={{ height: ROW_H, alignItems: 'flex-end', paddingRight: 6 }}>
                  <Text style={styles.hourLabel}>{h}</Text>
                </View>
              ))}
            </View>

            <View
              ref={trackRef}
              style={styles.trackCol}
              onLayout={handleTrackLayout}
              {...panResponder.panHandlers}
            >
              {logs.map((log) => {
                const cat = log.category_id ? categoryById[log.category_id] : null;
                const top = (minutesSinceMidnight(new Date(log.start_time), dayStart) / 60) * ROW_H;
                const bottom = (minutesSinceMidnight(new Date(log.end_time), dayStart) / 60) * ROW_H;
                const height = Math.max(2, bottom - top);
                return (
                  <View
                    key={log.id}
                    pointerEvents="none"
                    style={[styles.block, { top, height, backgroundColor: cat?.color ?? colors.textMuted }]}
                  />
                );
              })}

              {HOURS.map((h) => (
                <View key={h} style={[styles.gridRow, { height: ROW_H }]} pointerEvents="none">
                  {Array.from({ length: CELLS_PER_ROW }, (_, col) => {
                    const idx = h * CELLS_PER_ROW + col;
                    const on = selected.has(idx);
                    return <View key={col} style={[styles.gridCell, on && styles.gridCellSelected]} />;
                  })}
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={styles.palette}>
        <ScrollView contentContainerStyle={styles.paletteContent}>
          {categories
            .filter((c) => !c.parent_id)
            .map((c) => (
              <Pressable key={c.id} style={[styles.paletteChip, { backgroundColor: c.color }]} onPress={() => fillWith(c)}>
                <Text style={styles.paletteChipText} numberOfLines={1}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', paddingHorizontal: spacing.lg },
  axisArea: { flex: 1, flexDirection: 'row' },
  hourCol: { width: 28 },
  hourLabel: { fontSize: 13, color: colors.textMuted },
  trackCol: { flex: 1, position: 'relative', marginLeft: 6, backgroundColor: '#DCEBF7' },
  block: { position: 'absolute', left: 0, right: 0, borderRadius: 3, borderWidth: 1, borderColor: '#fff' },
  gridRow: { flexDirection: 'row' },
  gridCell: { flex: 1, backgroundColor: 'transparent', borderWidth: 0.5, borderColor: '#fff' },
  gridCellSelected: { backgroundColor: '#9AA3B2' },
  palette: { width: 72, marginLeft: spacing.sm },
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
