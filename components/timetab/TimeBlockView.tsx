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
import { AddLogModal } from './AddLogModal';
import type { TimeCategory, TimeLog } from '../../types';

/** 按住不动这么久算长按：已经记了的格子长按直接打开编辑（光标在描述里） */
const LONG_PRESS_MS = 450;
/** 手指挪了这么多就是在拖选区，不算长按 */
const MOVE_SLOP = 8;

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
  key: string;
  top: number;
  left: number;
  width: number;
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
  const [editing, setEditing] = useState<TimeLog | null>(null);
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; moved: boolean }>({ timer: null, moved: false });

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
  const sortedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order);

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  // 格子高度按轨道实测高度精确铺满24行，不追求正方形——这是最早交接文档就
  // 定下的规矩："格子高度＝轨道容器实测高度÷24，让24小时正好铺满一屏不留白"。
  // 之前"正方形优先"的写法（宽度算出的格子比高度算的小时，改按高度算导致
  // 24行摞不到可用高度的底）破坏了这条规矩，原app截图里的格子本身也不是
  // 正方形、是稍扁的长方形，铺满比方正更重要
  const ROW_H = areaHeight > 0 ? areaHeight / 24 : 0;
  // 格子宽度单独按轨道实测宽度算，不再跟高度绑定成正方形
  const cellWidth = trackWidth > 0 ? trackWidth / CELLS_PER_ROW : 0;

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

  /** 这一格（5 分钟）落在哪条记录里：有好几条叠着的取后记的那条 */
  function logAtCell(idx: number): TimeLog | null {
    const m = idx * CELL_MINUTES;
    let hit: TimeLog | null = null;
    for (const log of logs) {
      const a = minutesSinceMidnight(new Date(log.start_time), dayStart);
      const b = minutesSinceMidnight(new Date(log.end_time), dayStart);
      if (m >= a && m < b) hit = log;
    }
    return hit;
  }

  function clearPress() {
    if (press.current.timer) clearTimeout(press.current.timer);
    press.current.timer = null;
  }

  // 每次渲染都重建，避免回调闭包锁死在首次渲染的状态上
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const i = cellFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      clearPress();
      press.current.moved = false;
      if (i != null) {
        setAnchor(i);
        setCurrent(i);
        // 按在已经记了的格子上、一直不动：打开这条记录来改
        const log = logAtCell(i);
        if (log) {
          press.current.timer = setTimeout(() => {
            press.current.timer = null;
            if (press.current.moved) return;
            setAnchor(null);
            setCurrent(null);
            setEditing(log);
          }, LONG_PRESS_MS);
        }
      }
    },
    onPanResponderMove: (evt, g) => {
      if (Math.abs(g.dx) > MOVE_SLOP || Math.abs(g.dy) > MOVE_SLOP) {
        press.current.moved = true;
        clearPress();
      }
      const i = cellFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      if (i != null && !editing) setCurrent(i);
    },
    onPanResponderRelease: clearPress,
    onPanResponderTerminate: clearPress,
  });

  useEffect(() => clearPress, []);

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
    if (ROW_H <= 0 || cellWidth <= 0) return [];
    const pxPerMin = cellWidth / CELL_MINUTES;
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
        // 格子上写「分类-描述」，没描述就只写分类
        const label = cat ? (log.description?.trim() ? `${cat.name}-${log.description.trim()}` : cat.name) : log.description?.trim() || undefined;
        rects.push({
          key: `${log.id}-${row}`,
          top: row * ROW_H,
          left,
          width,
          height: ROW_H,
          color,
          text: first ? label : undefined,
        });
        cursor = segEnd;
        first = false;
      }
    }
    return rects;
  }, [logs, categories, cellWidth, ROW_H, dayStart]);

  // 网格分隔线位置：行线/列线的坐标直接用 ROW_H/cellWidth 单独算，不靠一个个
  // 格子的宽度首尾相接拼出来——12列累计取整误差拼不齐导致右边缘留白条，就是
  // 栽在"拼接"这个方式上。背景本身还是一整块100%宽的矩形（没有拼接），线条只是
  // 叠在它上面的装饰，每条线独立计算位置，不存在谁得为前面的误差买单
  const colDividers = useMemo(() => {
    if (cellWidth <= 0) return [];
    return Array.from({ length: CELLS_PER_ROW - 1 }, (_, i) => (i + 1) * cellWidth);
  }, [cellWidth]);

  const rowDividers = useMemo(() => {
    if (ROW_H <= 0) return [];
    return Array.from({ length: 24 - 1 }, (_, i) => (i + 1) * ROW_H);
  }, [ROW_H]);

  // 选中的格子：在原有内容上叠一层半透明黑——有色块盖着的深一点，空格子浅一点。
  // 同一行里挨着的、深浅一样的并成一条矩形，不再一格一个：一格一个的话，相邻两块半透明叠在
  // 小数像素的接缝上会多出一道深色细线（格子缝一会儿白一会儿黑就是这么来的）
  const selectionRects = useMemo<SelectionRect[]>(() => {
    if (ROW_H <= 0 || cellWidth <= 0 || selected.size === 0) return [];
    const idxs = Array.from(selected).sort((a, b) => a - b);
    const filledAt = (idx: number) => {
      const m = idx * CELL_MINUTES;
      return logRanges.some((r) => m >= r.startMin && m < r.endMin);
    };
    const rects: SelectionRect[] = [];
    let runStart = idxs[0];
    let prev = idxs[0];
    const flush = (a: number, b: number) => {
      const row = Math.floor(a / CELLS_PER_ROW);
      const col = a % CELLS_PER_ROW;
      rects.push({ key: `${a}-${b}`, top: row * ROW_H, left: col * cellWidth, width: (b - a + 1) * cellWidth, opacity: filledAt(a) ? 0.3 : 0.2 });
    };
    for (let k = 1; k < idxs.length; k++) {
      const i = idxs[k];
      const sameRow = Math.floor(i / CELLS_PER_ROW) === Math.floor(prev / CELLS_PER_ROW);
      if (i !== prev + 1 || !sameRow || filledAt(i) !== filledAt(prev)) {
        flush(runStart, prev);
        runStart = i;
      }
      prev = i;
    }
    flush(runStart, prev);
    return rects;
  }, [selected, logRanges, cellWidth, ROW_H]);

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
                <View key={h} style={{ height: ROW_H, alignItems: 'flex-end', paddingRight: 2 }}>
                  <Text style={styles.hourLabel} numberOfLines={1}>
                    {h}
                  </Text>
                </View>
              ))}
            </View>

            <View
              ref={trackRef}
              style={styles.trackCol}
              onLayout={handleTrackLayout}
              {...panResponder.panHandlers}
            >
              {/* 底层：一整块矩形背景（不是288个拼接的小格子，右边缘天然不会留白条） */}
              <View style={[styles.gridBackground, { height: 24 * ROW_H }]} pointerEvents="none" />

              {/* 色块：每条记录一个（跨行拆成几个）绝对定位矩形，不再逐格拼色 */}
              {logBlocks.map((rect) => (
                <View
                  key={rect.key}
                  style={[
                    styles.logBlock,
                    { top: rect.top, left: rect.left, width: rect.width, height: rect.height, backgroundColor: rect.color },
                  ]}
                  pointerEvents="none"
                />
              ))}

              {/* 选中的格子：压暗遮罩（一行里挨着的并成一块） */}
              {selectionRects.map((rect) => (
                <View
                  key={rect.key}
                  style={{
                    position: 'absolute',
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: ROW_H,
                    backgroundColor: `rgba(0,0,0,${rect.opacity})`,
                  }}
                  pointerEvents="none"
                />
              ))}

              {/* 24行×12列的格子线画在最上面：空格子、记了的、选中的，缝都是一样的白 */}
              {rowDividers.map((y, i) => (
                <View key={`rd${i}`} style={[styles.gridLineH, { top: y }]} pointerEvents="none" />
              ))}
              {colDividers.map((x, i) => (
                <View
                  key={`cd${i}`}
                  style={[styles.gridLineV, { left: x, height: 24 * ROW_H }]}
                  pointerEvents="none"
                />
              ))}

              {/* 字压在格子线上面，不被线切断 */}
              {logBlocks.map((rect) =>
                rect.text ? (
                  <View
                    key={`t-${rect.key}`}
                    style={[styles.logLabelBox, { top: rect.top, left: rect.left, width: rect.width, height: rect.height }]}
                    pointerEvents="none"
                  >
                    <Text style={[styles.logBlockText, noEllipsisWebStyle]} numberOfLines={1} ellipsizeMode="clip">
                      {rect.text}
                    </Text>
                  </View>
                ) : null
              )}
            </View>
          </>
        )}
      </View>

      <View style={styles.palette}>
        <ScrollView contentContainerStyle={styles.paletteContent}>
          {sortedCategories.map((c) => (
            <Pressable key={c.id} style={[styles.paletteChip, { backgroundColor: c.color }]} onPress={() => fillWith(c)} testID={`palette-${c.name}`}>
              <Text style={styles.paletteChipText} numberOfLines={1}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <AddLogModal
        visible={!!editing}
        log={editing}
        focusDescription
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
        onDeleted={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // 外边距/小时列/色卡列这几处加起来是网格能用宽度的主要"税"——缩窄它们
  // 才能让网格贴近原app的宽度比例
  container: { flex: 1, flexDirection: 'row', paddingLeft: 2, paddingRight: 6 },
  axisArea: { flex: 1, flexDirection: 'row' },
  hourCol: { width: 16 },
  // fontSize 10 + paddingRight 2 时，两位数(含"08"/"20"/"23"这类)的实测宽度
  // 都在 20px 列宽内，不会触发默认的 numberOfLines 截断出"…"——这条必须是
  // RN 组件的真实宽度/字号，css专属的nowrap/ellipsis覆盖在原生端不生效
  hourLabel: { fontSize: 10, color: colors.textMuted },
  trackCol: { flex: 1, position: 'relative', marginLeft: 2 },
  gridBackground: { width: '100%', backgroundColor: '#DCEBF7', borderRadius: 4 },
  gridLineH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#fff' },
  gridLineV: { position: 'absolute', top: 0, width: StyleSheet.hairlineWidth, backgroundColor: '#fff' },
  logBlock: { position: 'absolute', borderRadius: 4 },
  logLabelBox: { position: 'absolute', overflow: 'hidden', paddingLeft: 4, paddingTop: 2 },
  logBlockText: { color: '#fff', fontSize: 10, fontWeight: '600', includeFontPadding: false },
  palette: { width: 58, marginLeft: 6 },
  paletteContent: { paddingBottom: spacing.sm, gap: 4 },
  paletteChip: {
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    marginBottom: 2,
  },
  paletteChipText: { fontSize: 13, color: '#fff', fontWeight: '700', includeFontPadding: false },
});
