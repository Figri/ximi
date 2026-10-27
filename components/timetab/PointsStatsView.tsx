import { useEffect, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { fetchPointsDetail, fetchPointsSummary } from '../../lib/points';
import { formatPoints, type PointsDay, type PointsSummary, type ScoredLog } from '../../lib/pointsCalc';
import { useTimeLogStore } from '../../lib/timelogStore';
import { AddLogModal } from './AddLogModal';
import { PointsBadge } from './PointsBadge';
import type { TimeLog } from '../../types';

// 积分统计：今天 / 本周 / 本月 / 总共；近 7 天或 30 天每天一根柱子（正分往上绿、扣分往下红）；
// 点哪根柱子下面就换成那天的明细；分从哪来按分类加减两组；这几天里最好的一天。
// 不做连续天数、断了提醒、排行——不催，不算账。

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const PLOT_H = 112; // 柱子能用的高度（基线上下加起来）
const LABEL_H = 14; // 柱子顶上/底下写数的地方

function parts(dayKey: string) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return { m, d, wd: new Date(y, m - 1, d, 12).getDay() };
}

function dayLabel(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) return '今天';
  const { m, d, wd } = parts(dayKey);
  return `${m}月${d}日 周${WEEKDAYS[wd]}`;
}

function valueColor(n: number | null): string {
  return n == null || n === 0 ? colors.textMuted : n > 0 ? colors.greenDark : colors.redDark;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface Props {
  refreshKey: number;
  onChanged: () => void;
}

export function PointsStatsView({ refreshKey, onChanged }: Props) {
  const { categories, fetchAll } = useTimeLogStore();
  const [range, setRange] = useState<7 | 30>(7);
  const [summary, setSummary] = useState<PointsSummary | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScoredLog[]>([]);
  const [editing, setEditing] = useState<TimeLog | null>(null);
  const [chartW, setChartW] = useState(0);

  useEffect(() => {
    if (categories.length === 0) fetchAll();
  }, []);

  useEffect(() => {
    let alive = true;
    fetchPointsSummary(range).then((s) => alive && setSummary(s));
    return () => {
      alive = false;
    };
  }, [range, refreshKey]);

  const day = selectedDay ?? summary?.todayKey ?? null;
  useEffect(() => {
    if (!day) return;
    let alive = true;
    fetchPointsDetail(day).then((rows) => alive && setDetail(rows));
    return () => {
      alive = false;
    };
  }, [day, refreshKey]);

  if (!summary || !day) {
    return <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.purpleDark} />;
  }

  const catById = new Map(categories.map((c) => [c.id, c]));
  const dayTotal = detail.reduce((s, x) => s + x.points, 0);
  const tiles: [string, number | null, string][] = [
    ['今天', summary.today, 'pts-today'],
    ['本周', summary.week, 'pts-week'],
    ['本月', summary.month, 'pts-month'],
    ['总共', summary.total, 'pts-total'],
  ];

  // 基线放在哪：只有正分就贴底、只有负分就贴顶，两边都有按比例分
  const posMax = Math.max(0, ...summary.series.map((d) => d.net));
  const negMax = Math.max(0, ...summary.series.map((d) => -d.net));
  const upFrac = posMax + negMax > 0 ? posMax / (posMax + negMax) : 0.5;
  const upH = PLOT_H * upFrac;
  const downH = PLOT_H - upH;
  const slotW = chartW > 0 ? chartW / summary.series.length : 0;
  const barW = range === 7 ? Math.min(24, Math.max(4, slotW - 8)) : Math.max(3, slotW - 2);
  const r = Math.min(4, barW / 2);
  const selectedBar = summary.series.find((d) => d.dayKey === day) ?? null;

  function barFor(d: PointsDay) {
    if (!d.has || d.net === 0) return { up: 0, down: 0 };
    if (d.net > 0) return { up: Math.max(2, (upH * d.net) / posMax), down: 0 };
    return { up: 0, down: Math.max(2, (downH * -d.net) / negMax) };
  }

  function xLabel(d: PointsDay, i: number): string {
    const { d: date, wd } = parts(d.dayKey);
    if (range === 7) return d.dayKey === summary!.todayKey ? '今' : WEEKDAYS[wd];
    // 30 天太密：只写今天和往前每隔 5 天的日子
    return (summary!.series.length - 1 - i) % 5 === 0 ? String(date) : '';
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      <View style={styles.tiles}>
        {tiles.map(([label, value, id]) => (
          <View key={id} style={styles.tile}>
            <Text style={styles.tileLabel}>{label}</Text>
            <Text style={[styles.tileValue, { color: valueColor(value) }]} testID={id}>
              {formatPoints(value ?? 0)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>每天的分</Text>
          <View style={styles.segment}>
            {([7, 30] as const).map((n) => (
              <Pressable key={n} style={[styles.segBtn, range === n && styles.segBtnOn]} onPress={() => setRange(n)} testID={`pts-range-${n}`}>
                <Text style={[styles.segText, range === n && styles.segTextOn]}>近 {n} 天</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.hintRow}>
          <Text style={styles.cardHint}>加分往上，扣分往下{range === 30 ? '；点一根看那天' : ''}</Text>
          {/* 30 天的柱子太细写不下数：点中的那天写在这儿 */}
          {range === 30 && selectedBar ? (
            <Text style={styles.selectedInfo} testID="pts-selected">
              {dayLabel(selectedBar.dayKey, summary.todayKey)}{' '}
              <Text style={{ color: valueColor(selectedBar.has ? selectedBar.net : null) }}>{selectedBar.has ? formatPoints(selectedBar.net) : '没有分'}</Text>
            </Text>
          ) : null}
        </View>

        <View style={styles.chart} onLayout={(e: LayoutChangeEvent) => setChartW(e.nativeEvent.layout.width)} testID="pts-chart">
          {/* 0 分那条线 */}
          <View style={[styles.baseline, { top: LABEL_H + upH }]} pointerEvents="none" />
          {summary.series.map((d, i) => {
            const { up, down } = barFor(d);
            const isSel = d.dayKey === day;
            const showValue = d.has && range === 7;
            return (
              <Pressable
                key={d.dayKey}
                style={[styles.col, isSel && styles.colOn]}
                onPress={() => setSelectedDay(d.dayKey)}
                testID={`pts-bar-${d.dayKey}`}
                accessibilityLabel={`${dayLabel(d.dayKey, summary.todayKey)} ${d.has ? formatPoints(d.net) : '没有分'}`}
              >
                <View style={[styles.upArea, { height: LABEL_H + upH }]}>
                  {showValue && d.net >= 0 ? <Text style={styles.barValue} numberOfLines={1}>{formatPoints(d.net)}</Text> : null}
                  {up > 0 ? (
                    <View style={{ width: barW, height: up, backgroundColor: colors.greenDark, borderTopLeftRadius: r, borderTopRightRadius: r }} />
                  ) : null}
                </View>
                <View style={[styles.downArea, { height: LABEL_H + downH }]}>
                  {down > 0 ? (
                    <View style={{ width: barW, height: down, backgroundColor: colors.redDark, borderBottomLeftRadius: r, borderBottomRightRadius: r }} />
                  ) : null}
                  {showValue && d.net < 0 ? <Text style={styles.barValue} numberOfLines={1}>{formatPoints(d.net)}</Text> : null}
                </View>
                <View style={[styles.xLabelBox, range === 30 && styles.xLabelBoxWide]}>
                  <Text style={[styles.xLabel, isSel && styles.xLabelOn]}>{xLabel(d, i)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        {!summary.series.some((d) => d.has) ? <Text style={styles.empty}>这 {range} 天还没有记分</Text> : null}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle} testID="pts-detail-title">
            {dayLabel(day, summary.todayKey)}
          </Text>
        </View>
        {detail.length === 0 ? (
          <Text style={styles.empty}>这天没有记分</Text>
        ) : (
          <>
            {detail.map(({ log, points }) => {
              const cat = log.category_id ? catById.get(log.category_id) : undefined;
              return (
                <Pressable key={log.id} style={styles.row} onPress={() => setEditing(log)} testID={`pts-row-${log.id}`}>
                  <Text style={styles.rowTime}>
                    {hhmm(log.start_time)}–{hhmm(log.end_time)}
                  </Text>
                  <View style={[styles.dot, { backgroundColor: cat?.color ?? colors.textMuted }]} />
                  <Text style={styles.rowText} numberOfLines={1}>
                    {cat?.name ?? '未分类'}
                    {log.description ? <Text style={styles.rowDesc}>{`  ${log.description}`}</Text> : null}
                  </Text>
                  <PointsBadge points={points} />
                </Pressable>
              );
            })}
            <View style={[styles.row, styles.totalRow]}>
              <Text style={styles.totalLabel}>合计</Text>
              <Text style={[styles.totalValue, { color: valueColor(dayTotal) }]} testID="pts-detail-total">
                {formatPoints(dayTotal)}
              </Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>分从哪来（近 {range} 天）</Text>
        {summary.plus.length === 0 && summary.minus.length === 0 ? (
          <Text style={styles.empty}>这几天还没有分</Text>
        ) : (
          <>
            <View style={styles.groupRow} testID="pts-plus">
              <Text style={styles.groupLabel}>加分</Text>
              <View style={styles.groupItems}>
                {summary.plus.length ? (
                  summary.plus.map((c) => (
                    <View key={c.name} style={styles.groupItem}>
                      <View style={[styles.dot, { backgroundColor: c.color }]} />
                      <Text style={styles.groupText}>
                        {c.name} {formatPoints(c.points)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.groupNone}>没有</Text>
                )}
              </View>
            </View>
            <View style={styles.groupRow} testID="pts-minus">
              <Text style={styles.groupLabel}>扣分</Text>
              <View style={styles.groupItems}>
                {summary.minus.length ? (
                  summary.minus.map((c) => (
                    <View key={c.name} style={styles.groupItem}>
                      <View style={[styles.dot, { backgroundColor: c.color }]} />
                      <Text style={styles.groupText}>
                        {c.name} {formatPoints(c.points)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.groupNone}>没有</Text>
                )}
              </View>
            </View>
          </>
        )}
      </View>

      <Pressable
        style={[styles.card, styles.bestCard]}
        onPress={() => summary.best && setSelectedDay(summary.best.dayKey)}
        disabled={!summary.best}
        testID="pts-best"
      >
        <Text style={styles.cardTitle}>最好的一天</Text>
        {summary.best ? (
          <Text style={styles.bestText}>
            {dayLabel(summary.best.dayKey, summary.todayKey)}{' '}
            <Text style={{ color: valueColor(summary.best.net), fontWeight: '800' }}>{formatPoints(summary.best.net)}</Text>
          </Text>
        ) : (
          <Text style={styles.groupNone}>这 {range} 天还没有</Text>
        )}
      </Pressable>

      <AddLogModal
        visible={!!editing}
        log={editing}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: radius.widget, paddingVertical: spacing.sm, alignItems: 'center' },
  tileLabel: { fontSize: fontSize.secondary, color: colors.textSecondary },
  tileValue: { fontSize: 20, fontWeight: '800', marginTop: 2 },

  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: fontSize.cardName, fontWeight: '700', color: colors.textPrimary },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  cardHint: { fontSize: fontSize.tiny, color: colors.textMuted },
  selectedInfo: { fontSize: fontSize.secondary, color: colors.textSecondary, fontWeight: '700' },
  segment: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: radius.button, padding: 2 },
  segBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.button },
  segBtnOn: { backgroundColor: colors.purpleDark },
  segText: { fontSize: fontSize.secondary, color: colors.textSecondary, fontWeight: '600' },
  segTextOn: { color: '#fff' },

  chart: { flexDirection: 'row', marginTop: spacing.sm, position: 'relative' },
  baseline: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.textMuted },
  col: { flex: 1, alignItems: 'center', borderRadius: 6 },
  colOn: { backgroundColor: colors.purpleLight },
  upArea: { justifyContent: 'flex-end', alignItems: 'center', alignSelf: 'stretch' },
  downArea: { justifyContent: 'flex-start', alignItems: 'center', alignSelf: 'stretch' },
  barValue: { fontSize: 10, lineHeight: LABEL_H, color: colors.textSecondary, fontWeight: '700' },
  xLabelBox: { height: 14, alignItems: 'center' },
  // 30 天一根柱子才十来像素宽：日期字放在比柱子宽的小框里居中，不跟着柱子宽度截断（每隔 5 天才写一个，不会挤）
  xLabelBoxWide: { width: 28 },
  xLabel: { fontSize: 10, color: colors.textMuted, lineHeight: 14 },
  xLabelOn: { color: colors.purpleDark, fontWeight: '700' },
  empty: { fontSize: fontSize.secondary, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.background },
  rowTime: { fontSize: fontSize.secondary, color: colors.textSecondary, width: 78 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowText: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  rowDesc: { color: colors.textSecondary, fontWeight: '400' },
  totalRow: { borderBottomWidth: 0, justifyContent: 'space-between' },
  totalLabel: { fontSize: fontSize.body, color: colors.textSecondary, fontWeight: '700' },
  totalValue: { fontSize: fontSize.cardName, fontWeight: '800' },

  groupRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.sm },
  groupLabel: { width: 36, fontSize: fontSize.secondary, color: colors.textSecondary, marginTop: 1 },
  groupItems: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  groupItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  groupText: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  groupNone: { fontSize: fontSize.secondary, color: colors.textMuted },
  bestCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bestText: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
});
