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
import { colors, spacing } from '../../constants/theme';
import { applySelectionFill, fetchLogsForDate } from '../../lib/timelog';
import { useTimeLogStore } from '../../lib/timelogStore';
import type { TimeCategory, TimeLog } from '../../types';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const CELLS_PER_ROW = 12; // 每行12格，每格5分钟，写死
const CELL_MINUTES = 5;

function minutesSinceMidnight(date: Date, dayStart: Date): number {
  return Math.max(0, Math.min(24 * 60, (date.getTime() - dayStart.getTime()) / 60000));
}

// react-native-web 的 Text 不认 ellipsizeMode="clip"——实测 numberOfLines={1}
// 时无论 ellipsizeMode 传什么，react-native-web 生成的 computed CSS 都是
// text-overflow: ellipsis（用 getComputedStyle 核对过），照样会冒出"…"。
// 只能额外塞一个 web 专属的原始 CSS 覆盖它；原生端会忽略这两个未知 style key，无副作用
const noEllipsisWebStyle = { textOverflow: 'clip', whiteSpace: 'nowrap' } as any;

interface LogBlockRect {
  key: string;
  top: number;
  left: number;
  width: number;
  height: number;
  color: string;
  text?: string;
}

interface SelectionRect {
  key: number;
  top: number;
  left: number;
  opacity: number;
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
  const [trackWidth, setTrackWidth] = useState(0);
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

  // 格子必须是正方形：默认用宽度算(trackWidth/12)，如果24行这个高度塞不进
  // areaHeight，才改用高度算(Math.floor(areaHeight/24))，此时网格不占满
  // 宽度、右侧留空——但依然是正方形，不会被拉成长方形
  const rawCellFromWidth = trackWidth > 0 ? trackWidth / CELLS_PER_ROW : 0;
  let cellSize = rawCellFromWidth;
  if (areaHeight > 0 && rawCellFromWidth > 0 && areaHeight < 24 * rawCellFromWidth) {
    cellSize = Math.floor(areaHeight / 24);
  }
  const ROW_H = cellSize;

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

  // 每条记录的时间区间（分钟），只用来判断某一刻是不是被记录覆盖，给选区压暗判断深浅用
  const logRanges = useMemo(
    () =>
      logs.map((log) => ({
        startMin: minutesSinceMidnight(new Date(log.start_time), dayStart),
        endMin: minutesSinceMidnight(new Date(log.end_time), dayStart),
      })),
    [logs, dayStart]
  );

  // 每条记录画成一个（或跨行时拆成几个）绝对定位的色块矩形，不再逐格填色
  const logBlocks = useMemo<LogBlockRect[]>(() => {
    if (cellSize <= 0) return [];
    const pxPerMin = cellSize / CELL_MINUTES;
    const rects: LogBlockRect[] = [];
    for (const log of logs) {
      const cat = log.category_id ? categoryById[log.category_id] : null;
      const color = cat?.color ?? colors.textMuted;
      const startMin = minutesSinceMidnight(new Date(log.start_time), dayStart);
      const endMin = minutesSinceMidnight(new Date(log.end_time), dayStart);
      if (endMin <= startMin) continue;
      let cursor = startMin;
      let first = true;
      while (cursor < endMin) {
        const row = Math.floor(cursor / 60);
        const rowStartMin = row * 60;
        const rowEndMin = rowStartMin + 60;
        const segEnd = Math.min(endMin, rowEndMin);
        const left = (cursor - rowStartMin) * pxPerMin;
        const width = (segEnd - cursor) * pxPerMin;
        rects.push({
          key: `${log.id}-${row}`,
          top: row * ROW_H,
          left,
          width,
          height: ROW_H,
          color,
          text: first ? (cat?.name ?? undefined) : undefined,
        });
        cursor = segEnd;
        first = false;
      }
    }
    return rects;
  }, [logs, categories, cellSize, ROW_H, dayStart]);

  // 选中的格子：在原有内容上叠一层半透明黑——有色块盖着的深一点，空格子浅一点
  const selectionRects = useMemo<SelectionRect[]>(() => {
    if (cellSize <= 0 || selected.size === 0) return [];
    const rects: SelectionRect[] = [];
    for (const idx of selected) {
      const row = Math.floor(idx / CELLS_PER_ROW);
      const col = idx % CELLS_PER_ROW;
      const cellStartMin = idx * CELL_MINUTES;
      const filled = logRanges.some((r) => cellStartMin >= r.startMin && cellStartMin < r.endMin);
      rects.push({
        key: idx,
        top: row * ROW_H,
        left: col * cellSize,
        opacity: filled ? 0.3 : 0.2,
      });
    }
    return rects;
  }, [selected, logRanges, cellSize, ROW_H]);

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

  function handleTrackLayout(e: LayoutChangeEvent) {
    measureTrack();
    setTrackWidth(e.nativeEvent.layout.width);
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
              {/* 底层：正方形空格子，只做纹理背景和承接划选手势 */}
              {HOURS.map((h) => (
                <View key={h} style={[styles.gridRow, { height: ROW_H }]} pointerEvents="none">
                  {Array.from({ length: CELLS_PER_ROW }, (_, col) => (
                    <View key={col} style={[styles.gridCell, { width: cellSize, height: ROW_H }]} />
                  ))}
                </View>
              ))}

              {/* 中层：每条记录一个（跨行拆成几个）绝对定位色块，不再逐格拼色 */}
              {logBlocks.map((rect) => (
                <View
                  key={rect.key}
                  style={[
                    styles.logBlock,
                    { top: rect.top, left: rect.left, width: rect.width, height: rect.height, backgroundColor: rect.color },
                  ]}
                  pointerEvents="none"
                >
                  {rect.text ? (
                    <Text
                      style={[styles.logBlockText, noEllipsisWebStyle]}
                      numberOfLines={1}
                      ellipsizeMode="clip"
                    >
                      {rect.text}
                    </Text>
                  ) : null}
                </View>
              ))}

              {/* 顶层：选中格子的压暗遮罩 */}
              {selectionRects.map((rect) => (
                <View
                  key={rect.key}
                  style={{
                    position: 'absolute',
                    top: rect.top,
                    left: rect.left,
                    width: cellSize,
                    height: ROW_H,
                    backgroundColor: `rgba(0,0,0,${rect.opacity})`,
                  }}
                  pointerEvents="none"
                />
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
  hourCol: { width: 20 },
  hourLabel: { fontSize: 11, color: colors.textMuted },
  trackCol: { flex: 1, position: 'relative', marginLeft: 6 },
  gridRow: { flexDirection: 'row' },
  gridCell: { borderWidth: 0.5, borderColor: '#fff', borderRadius: 2, backgroundColor: '#DCEBF7' },
  logBlock: {
    position: 'absolute',
    borderRadius: 4,
    overflow: 'hidden',
    paddingLeft: 4,
    paddingTop: 2,
  },
  logBlockText: { color: '#fff', fontSize: 10, fontWeight: '600', includeFontPadding: false },
  palette: { width: 60, marginLeft: spacing.sm },
  paletteContent: { paddingBottom: spacing.sm, gap: 2 },
  paletteChip: {
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30,
    marginBottom: 2,
  },
  paletteChipText: { fontSize: 9, color: '#fff', fontWeight: '700', includeFontPadding: false },
});
