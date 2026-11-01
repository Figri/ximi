import { useEffect, useRef, useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/theme';
import { dateOfKey, daySlotsOf, HOURS_PER_DAY, mergeBlocks, planInk, planTint, uniformSlot, usePlanStore, WEEKDAY_CN } from '../../lib/plan';
import type { TimeCategory } from '../../types';
import type { PlanPick } from './PlanColumn';

const GAP = 2;
const HOUR_COL = 18;
const MOVE_SLOP = 8;
const SWIPE = 50;

function useNowMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

interface PlanWeekViewProps {
  /** 周一到周日 7 个日期 key */
  weekKeys: string[];
  todayKey: string;
  categoryById: Record<string, TimeCategory>;
  onPick: (pick: PlanPick) => void;
  /** 长按星期几 */
  onDayLongPress: (key: string) => void;
  /** 在星期那一行左右滑：-1 上一周、+1 下一周 */
  onSwipeWeek: (delta: number) => void;
}

/**
 * 周日程：一到日 7 列 × 0–23 点，一屏放下。
 * 格子上竖着划 = 一天里选几个钟头；横着划 = 一次选好几天的同一段；点一块 = 改那块。
 */
export function PlanWeekView({ weekKeys, todayKey, categoryById, onPick, onDayLongPress, onSwipeWeek }: PlanWeekViewProps) {
  const days = usePlanStore((s) => s.days);
  const now = useNowMinute();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const rowH = size.h > 0 ? size.h / HOURS_PER_DAY : 0;
  const colW = size.w > 0 ? (size.w - GAP * 6) / 7 : 0;

  const [sel, setSel] = useState<{ d0: number; h0: number; d1: number; h1: number } | null>(null);
  const selRef = useRef(sel);
  selRef.current = sel;
  const moved = useRef(false);
  // 按下时手指在哪：挪了多远自己算（网页上鼠标拖动时 gestureState 的 dx/dy 一直是 0，靠它判断会把划当成点）
  const startPt = useRef({ x: 0, y: 0 });
  const gridRef = useRef<View>(null);
  const rect = useRef({ x: 0, y: 0 });

  function measure() {
    gridRef.current?.measureInWindow((x, y) => {
      rect.current = { x, y };
    });
  }

  function onGridLayout(e: LayoutChangeEvent) {
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
    measure();
  }

  function cellAt(pageX: number, pageY: number): { d: number; h: number } {
    const lx = pageX - rect.current.x;
    const ly = pageY - rect.current.y;
    const d = Math.max(0, Math.min(6, Math.floor(lx / (colW + GAP))));
    const h = Math.max(0, Math.min(HOURS_PER_DAY - 1, Math.floor(ly / (rowH || 1))));
    return { d, h };
  }

  function finish() {
    const s = selRef.current;
    setSel(null);
    if (!s) return;
    const dLo = Math.min(s.d0, s.d1);
    const dHi = Math.max(s.d0, s.d1);
    const hLo = Math.min(s.h0, s.h1);
    const hHi = Math.max(s.h0, s.h1);
    if (!moved.current) {
      const key = weekKeys[s.d0];
      const blk = mergeBlocks(daySlotsOf(days, key)).find((b) => s.h0 >= b.start && s.h0 < b.end);
      if (blk) onPick({ keys: [key], from: blk.start, to: blk.end, origin: { from: blk.start, to: blk.end }, slot: blk.slot });
      else onPick({ keys: [key], from: s.h0, to: s.h0 + 1, origin: null, slot: null });
      return;
    }
    const keys = weekKeys.slice(dLo, dHi + 1);
    onPick({ keys, from: hLo, to: hHi + 1, origin: null, slot: uniformSlot(days, keys, hLo, hHi + 1) });
  }

  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      moved.current = false;
      startPt.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      measure();
      const c = cellAt(e.nativeEvent.pageX, e.nativeEvent.pageY);
      setSel({ d0: c.d, h0: c.h, d1: c.d, h1: c.h });
    },
    onPanResponderMove: (e) => {
      const dx = e.nativeEvent.pageX - startPt.current.x;
      const dy = e.nativeEvent.pageY - startPt.current.y;
      if (Math.abs(dx) > MOVE_SLOP || Math.abs(dy) > MOVE_SLOP) moved.current = true;
      const c = cellAt(e.nativeEvent.pageX, e.nativeEvent.pageY);
      setSel((s) => (s ? { ...s, d1: c.d, h1: c.h } : s));
    },
    onPanResponderRelease: finish,
    // 手指划出格子（划到底栏上）也不交出去：松手时照样算这一段
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => setSel(null),
  });

  // 星期那一行左右滑切周（跟日期条一样读原始触摸，一次滑动只切一周）
  const touch = useRef<{ x: number; y: number; done: boolean } | null>(null);
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
    if (Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(p.y - st.y) * 1.5) {
      st.done = true;
      onSwipeWeek(dx < 0 ? 1 : -1);
    }
  }

  const todayIdx = weekKeys.indexOf(todayKey);
  const weekEmpty = weekKeys.every((k) => !days[k]);
  const xOf = (i: number) => i * (colW + GAP);

  return (
    <View style={styles.container}>
      <View
        style={styles.headRow}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => (touch.current = null)}
        onTouchCancel={() => (touch.current = null)}
        testID="week-head"
      >
        <View style={{ width: HOUR_COL }} />
        {weekKeys.map((k, i) => {
          const isToday = k === todayKey;
          return (
            <Pressable
              key={k}
              style={[styles.headCell, isToday && styles.headToday, i < 6 && { marginRight: GAP }]}
              onLongPress={() => onDayLongPress(k)}
              delayLongPress={400}
              testID={`week-day-${i}`}
            >
              <Text style={[styles.headWd, isToday && styles.headTextToday]}>{WEEKDAY_CN[i]}</Text>
              <Text style={[styles.headNum, isToday && styles.headTextToday]}>{dateOfKey(k).getDate()}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.body}>
        <View style={{ width: HOUR_COL }}>
          {rowH > 0
            ? Array.from({ length: HOURS_PER_DAY }, (_, h) => (
                <Text
                  key={h}
                  style={[styles.hour, { height: rowH, lineHeight: rowH }, todayIdx >= 0 && h === now.getHours() && styles.hourNow]}
                >
                  {h}
                </Text>
              ))
            : null}
        </View>

        <View ref={gridRef} style={styles.grid} onLayout={onGridLayout} {...pan.panHandlers} testID="week-grid">
          {rowH > 0 && colW > 0 ? (
            <>
              {todayIdx >= 0 ? <View style={[styles.todayBg, { left: xOf(todayIdx) - 1, width: colW + 2, height: rowH * 24 }]} pointerEvents="none" /> : null}
              {weekKeys.map((k, i) =>
                Array.from({ length: HOURS_PER_DAY }, (_, h) => (
                  <View
                    key={`${k}-${h}`}
                    style={[styles.cell, { left: xOf(i), top: h * rowH + 1, width: colW, height: rowH - 2 }]}
                    pointerEvents="none"
                  />
                ))
              )}
              {weekKeys.map((k, i) =>
                mergeBlocks(daySlotsOf(days, k)).map((b) => {
                  const cat = categoryById[b.slot.c];
                  const color = cat?.color ?? colors.textMuted;
                  const height = (b.end - b.start) * rowH - 2;
                  const lines = Math.max(1, Math.floor((height - 3) / 12));
                  return (
                    <View
                      key={`${k}-b${b.start}`}
                      style={[styles.block, { left: xOf(i), top: b.start * rowH + 1, width: colW, height, backgroundColor: planTint(color), borderLeftColor: color }]}
                      pointerEvents="none"
                      testID={`week-block-${i}-${b.start}`}
                    >
                      <Text style={[styles.blockText, { color: planInk(color) }]} numberOfLines={lines}>
                        {b.slot.d || cat?.name || '?'}
                      </Text>
                    </View>
                  );
                })
              )}
              {sel ? (
                <View
                  style={[
                    styles.sel,
                    {
                      left: xOf(Math.min(sel.d0, sel.d1)) - 1,
                      top: Math.min(sel.h0, sel.h1) * rowH,
                      width: (Math.abs(sel.d1 - sel.d0) + 1) * (colW + GAP) - GAP + 2,
                      height: (Math.abs(sel.h1 - sel.h0) + 1) * rowH,
                    },
                  ]}
                  pointerEvents="none"
                />
              ) : null}
              {todayIdx >= 0 ? (
                <View
                  style={[styles.nowLine, { left: xOf(todayIdx), width: colW, top: ((now.getHours() * 60 + now.getMinutes()) / 60) * rowH - 1 }]}
                  pointerEvents="none"
                />
              ) : null}
              {weekEmpty ? (
                <View style={styles.hint} pointerEvents="none">
                  <Text style={styles.hintText}>这周还没排剧本{'\n'}在格子上划一段，或者点右上「模板」</Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingLeft: 2, paddingRight: 6 },
  headRow: { flexDirection: 'row', paddingBottom: 4 },
  headCell: { flex: 1, alignItems: 'center', paddingVertical: 3, borderRadius: 8 },
  headToday: { backgroundColor: colors.purpleDark },
  headWd: { fontSize: 11, color: colors.textMuted },
  headNum: { fontSize: 15, color: colors.textPrimary, fontWeight: '600' },
  headTextToday: { color: '#fff' },
  body: { flex: 1, flexDirection: 'row', paddingBottom: 6 },
  hour: { fontSize: 10, color: colors.textMuted, textAlign: 'right', paddingRight: 3 },
  hourNow: { color: '#E5484D', fontWeight: '700' },
  grid: { flex: 1, position: 'relative' },
  todayBg: { position: 'absolute', top: 0, backgroundColor: '#E7DEF4', borderRadius: 6 },
  cell: { position: 'absolute', backgroundColor: '#ECE7F2', borderRadius: 3 },
  block: { position: 'absolute', borderLeftWidth: 3, borderRadius: 4, paddingHorizontal: 2, paddingTop: 1, overflow: 'hidden' },
  blockText: { fontSize: 9.5, lineHeight: 12, includeFontPadding: false },
  sel: { position: 'absolute', borderWidth: 2, borderStyle: 'dashed', borderColor: colors.purpleDark, borderRadius: 6, backgroundColor: 'rgba(142,115,179,0.14)' },
  nowLine: { position: 'absolute', height: 2, backgroundColor: '#E5484D' },
  hint: { position: 'absolute', left: 0, right: 0, top: '38%', alignItems: 'center' },
  hintText: { fontSize: 12, lineHeight: 19, color: colors.textMuted, textAlign: 'center', backgroundColor: 'rgba(246,244,248,0.9)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
});
