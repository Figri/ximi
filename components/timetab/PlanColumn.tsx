import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/theme';
import { daySlotsOf, HOURS_PER_DAY, mergeBlocks, planInk, planTint, uniformSlot, usePlanStore, type PlanSlot } from '../../lib/plan';
import type { TimeCategory } from '../../types';

/** 点一块剧本、或在剧本列上划一段，交给页面去弹「改剧本」 */
export interface PlanPick {
  keys: string[];
  from: number;
  to: number;
  /** 点的是已经排好的一块：改的时候先把原来那段清掉（缩短、挪动都对） */
  origin?: { from: number; to: number } | null;
  slot: PlanSlot | null;
}

const MOVE_SLOP = 8;

function useNowMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

interface PlanColumnProps {
  dateKey: string;
  rowHeight: number;
  isToday: boolean;
  categoryById: Record<string, TimeCategory>;
  onPick: (pick: PlanPick) => void;
}

/** 「对照」左边那列：每个钟头一条剧本，连着一样的并成一块；浅色底 + 左边一道分类色 */
export function PlanColumn({ dateKey, rowHeight, isToday, categoryById, onPick }: PlanColumnProps) {
  const days = usePlanStore((s) => s.days);
  const slots = daySlotsOf(days, dateKey);
  const blocks = mergeBlocks(slots);
  const now = useNowMinute();
  const nowHour = now.getHours();

  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const selRef = useRef(sel);
  selRef.current = sel;
  const moved = useRef(false);
  // 按下时手指在哪：挪了多远自己算（网页上鼠标拖动时 gestureState 的 dx/dy 一直是 0，靠它判断会把划当成点）
  const startPt = useRef({ x: 0, y: 0 });
  const viewRef = useRef<View>(null);
  const rect = useRef({ y: 0, h: 0 });

  function measure() {
    viewRef.current?.measureInWindow((_x, y, _w, h) => {
      rect.current = { y, h };
    });
  }
  useEffect(measure, [rowHeight]);

  function hourAt(pageY: number): number {
    const { y } = rect.current;
    return Math.max(0, Math.min(HOURS_PER_DAY - 1, Math.floor((pageY - y) / rowHeight)));
  }

  function finish() {
    const s = selRef.current;
    setSel(null);
    if (!s) return;
    const lo = Math.min(s.a, s.b);
    const hi = Math.max(s.a, s.b);
    if (!moved.current) {
      const blk = blocks.find((b) => lo >= b.start && lo < b.end);
      if (blk) onPick({ keys: [dateKey], from: blk.start, to: blk.end, origin: { from: blk.start, to: blk.end }, slot: blk.slot });
      else onPick({ keys: [dateKey], from: lo, to: lo + 1, origin: null, slot: null });
      return;
    }
    onPick({ keys: [dateKey], from: lo, to: hi + 1, origin: null, slot: uniformSlot(days, [dateKey], lo, hi + 1) });
  }

  // 每次渲染都重建，回调里读到的都是这一次的数据
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      moved.current = false;
      startPt.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      measure();
      const h = hourAt(e.nativeEvent.pageY);
      setSel({ a: h, b: h });
    },
    onPanResponderMove: (e) => {
      const dx = e.nativeEvent.pageX - startPt.current.x;
      const dy = e.nativeEvent.pageY - startPt.current.y;
      if (Math.abs(dx) > MOVE_SLOP || Math.abs(dy) > MOVE_SLOP) moved.current = true;
      const h = hourAt(e.nativeEvent.pageY);
      setSel((s) => (s ? { a: s.a, b: h } : s));
    },
    onPanResponderRelease: finish,
    // 手指划出格子（划到底栏上）也不交出去：松手时照样算这一段
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => setSel(null),
  });

  const empty = blocks.length === 0;

  return (
    <View
      ref={viewRef}
      style={[styles.col, { height: rowHeight * HOURS_PER_DAY }]}
      onLayout={measure}
      {...pan.panHandlers}
      testID="plan-column"
    >
      {Array.from({ length: HOURS_PER_DAY }, (_, h) => (
        <View key={h} style={[styles.emptyCell, { top: h * rowHeight + 1, height: rowHeight - 2 }]} pointerEvents="none" />
      ))}

      {blocks.map((b) => {
        const cat = categoryById[b.slot.c];
        const color = cat?.color ?? colors.textMuted;
        const height = (b.end - b.start) * rowHeight - 2;
        const lines = Math.max(1, Math.floor((height - 4) / 13));
        const current = isToday && nowHour >= b.start && nowHour < b.end;
        return (
          <View
            key={`${b.start}`}
            style={[
              styles.block,
              { top: b.start * rowHeight + 1, height, backgroundColor: planTint(color), borderLeftColor: color },
              current && { borderColor: color, borderWidth: 2, borderLeftWidth: 4 },
            ]}
            pointerEvents="none"
            testID={`plan-block-${b.start}`}
          >
            <Text style={[styles.blockText, { color: planInk(color) }]} numberOfLines={lines}>
              <Text style={styles.blockCat}>{cat?.name ?? '?'}</Text>
              {b.slot.d ? ` ${b.slot.d}` : ''}
            </Text>
            {current ? (
              <View style={styles.nowTag}>
                <Text style={styles.nowTagText}>现在</Text>
              </View>
            ) : null}
          </View>
        );
      })}

      {empty ? (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>还没排剧本{'\n'}点一下或划一段</Text>
        </View>
      ) : null}

      {sel ? (
        <View
          style={[styles.sel, { top: Math.min(sel.a, sel.b) * rowHeight, height: (Math.abs(sel.b - sel.a) + 1) * rowHeight }]}
          pointerEvents="none"
        />
      ) : null}

      {isToday ? (
        <View style={[styles.nowLine, { top: ((now.getHours() * 60 + now.getMinutes()) / 60) * rowHeight - 1 }]} pointerEvents="none" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { width: 84, marginLeft: 2, marginRight: 2, position: 'relative' },
  emptyCell: { position: 'absolute', left: 0, right: 0, backgroundColor: '#EEEAF3', borderRadius: 4 },
  block: { position: 'absolute', left: 0, right: 0, borderLeftWidth: 4, borderRadius: 5, paddingHorizontal: 4, paddingTop: 2, overflow: 'hidden' },
  blockText: { fontSize: 10.5, lineHeight: 13, includeFontPadding: false },
  blockCat: { fontWeight: '800' },
  nowTag: { position: 'absolute', right: 2, top: 2, backgroundColor: '#E5484D', borderRadius: 6, paddingHorizontal: 3 },
  nowTagText: { color: '#fff', fontSize: 8, fontWeight: '700' },
  hint: { position: 'absolute', left: 0, right: 0, top: 8, alignItems: 'center' },
  hintText: { fontSize: 10, lineHeight: 14, color: colors.textMuted, textAlign: 'center' },
  sel: { position: 'absolute', left: -1, right: -1, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.purpleDark, borderRadius: 6, backgroundColor: 'rgba(142,115,179,0.12)' },
  nowLine: { position: 'absolute', left: 0, right: -4, height: 2, backgroundColor: '#E5484D' },
});
