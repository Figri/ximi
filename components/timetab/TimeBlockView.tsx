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
import { colors, fontSize, spacing } from '../../constants/theme';
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
  const [firstLoad, setFirstLoad] = useState(true);
  const [areaHeight, setAreaHeight] = useState(0);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [current, setCurrent] = useState<number | null>(null);

  const trackRef = useRef<View>(null);
  const trackRect = useRef({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    if (categories.length === 0) fetchAll();
  }, []);

  useEffect(() => {
    fetchLogsForDate(date)
      .then(setLogs)
      .finally(() => setFirstLoad(false));
  }, [date, refreshKey]);

  const categoryById: Record<string, TimeCategory> = {};
  for (const c of categories) categoryById[c.id] = c;

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  // 时间轴容器自己实际分到的高度(onLayout量) ÷ 24 = 每小时行高，取整避免24行堆叠时的浮点累积误差
  const ROW_H = areaHeight > 0 ? Math.floor(areaHeight / 24) : 0;

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

  // 每个格子归属哪条记录（后写覆盖先写），颜色/白线/文字都从这里派生
  const cellLogByIndex = useMemo(() => {
    const map = new Map<number, TimeLog>();
    for (const log of logs) {
      const startMin = minutesSinceMidnight(new Date(log.start_time), dayStart);
      const endMin = minutesSinceMidnight(new Date(log.end_time), dayStart);
      const loIdx = Math.floor(startMin / CELL_MINUTES);
      const hiIdx = Math.ceil(endMin / CELL_MINUTES) - 1;
      for (let i = Math.max(0, loIdx); i <= hiIdx && i < 24 * CELLS_PER_ROW; i++) map.set(i, log);
    }
    return map;
  }, [logs, date]);

  // 每个格子的分类颜色
  const cellColorByIndex = useMemo(() => {
    const map = new Map<number, string>();
    for (const [idx, log] of cellLogByIndex) {
      const cat = log.category_id ? categoryById[log.category_id] : null;
      map.set(idx, cat?.color ?? colors.textMuted);
    }
    return map;
  }, [cellLogByIndex, categories]);

  // 每条记录起始格的分类名（起始格被别的记录覆盖了就不标）
  const cellTextByIndex = useMemo(() => {
    const map = new Map<number, string>();
    for (const log of logs) {
      const cat = log.category_id ? categoryById[log.category_id] : null;
      if (!cat) continue;
      const startMin = minutesSinceMidnight(new Date(log.start_time), dayStart);
      const idx = Math.floor(startMin / CELL_MINUTES);
      if (cellLogByIndex.get(idx)?.id === log.id) map.set(idx, cat.name);
    }
    return map;
  }, [cellLogByIndex, categories]);

  // 格子颜色：选区灰 > 记录分类色 > 空蓝
  function cellColor(idx: number): string {
    if (selected.has(idx)) return '#9AA3B2';
    return cellColorByIndex.get(idx) ?? '#DCEBF7';
  }

  // 相邻格子属于同一条记录时不画白线，视觉上连成一片
  function sameLog(a: number, b: number): boolean {
    const la = cellLogByIndex.get(a);
    return la != null && cellLogByIndex.get(b)?.id === la.id;
  }

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

  if (firstLoad) {
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
              {/* 格子填色：有记录染分类色，同记录相邻格去白线连成一片，起始格左上角写分类名 */}
              {HOURS.map((h) => (
                <View key={h} style={[styles.gridRow, { height: ROW_H }]} pointerEvents="none">
                  {Array.from({ length: CELLS_PER_ROW }, (_, col) => {
                    const idx = h * CELLS_PER_ROW + col;
                    const text = cellTextByIndex.get(idx);
                    // 文字宽度 = 本行里同一条记录往右连着的格子数（至少2格，两个字放得下）
                    let runCells = 1;
                    while (col + runCells < CELLS_PER_ROW && sameLog(idx, idx + runCells)) runCells++;
                    const sameLeft = col > 0 && sameLog(idx, idx - 1);
                    const sameRight = col < CELLS_PER_ROW - 1 && sameLog(idx, idx + 1);
                    const sameTop = h > 0 && sameLog(idx, idx - CELLS_PER_ROW);
                    const sameBottom = h < 23 && sameLog(idx, idx + CELLS_PER_ROW);
                    return (
                      <View
                        key={col}
                        style={[
                          styles.gridCell,
                          {
                            backgroundColor: cellColor(idx),
                            borderLeftWidth: sameLeft ? 0 : 0.5,
                            borderRightWidth: sameRight ? 0 : 0.5,
                            borderTopWidth: sameTop ? 0 : 0.5,
                            borderBottomWidth: sameBottom ? 0 : 0.5,
                          },
                          text ? styles.gridCellLabeled : null,
                        ]}
                      >
                        {text ? (
                          <Text style={[styles.cellText, { width: `${Math.max(2, runCells) * 100}%` }]} numberOfLines={1}>
                            {text}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={styles.palette}>
        <ScrollView contentContainerStyle={styles.paletteContent}>
          {categories.map((c) => (
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
  trackCol: { flex: 1, position: 'relative', marginLeft: 6 },
  gridRow: { flexDirection: 'row' },
  // 边框宽度在 JSX 里按相邻格是否同一条记录动态算
  gridCell: { flex: 1, borderColor: '#fff', position: 'relative', overflow: 'visible' },
  // 带文字的格子抬到同行后续格子上面，文字才能溢出到右边格子而不被盖住
  gridCellLabeled: { zIndex: 1 },
  cellText: {
    position: 'absolute',
    left: 2,
    top: 1,
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
    includeFontPadding: false,
  },
  palette: { width: 72, marginLeft: spacing.sm },
  paletteContent: { paddingBottom: spacing.sm, gap: 2 },
  paletteChip: {
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    marginBottom: 2,
  },
  paletteChipText: { fontSize: fontSize.tiny, color: '#fff', fontWeight: '700', includeFontPadding: false },
});
