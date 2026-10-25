import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { daysBetween, ongoingPeriod, type BodyRecord } from '../../lib/body';

// 今天页「身体」：最近的体重、经期第几天，不用跳去别的页面。记体重弹小面板；经期一下「来了」/「结束了」。
// 改日期、删记录、看曲线还在「身体」那页（右上角「全部 ›」）。经期只在这台手机里，不进灵的提示词。

function md(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}`;
}

interface Props {
  todayKey: string;
  weights: BodyRecord[];
  periods: BodyRecord[];
  onWeigh: () => void;
  onPeriodStart: () => void;
  onPeriodEnd: (r: BodyRecord) => void;
}

export function BodySection({ todayKey, weights, periods, onWeigh, onPeriodStart, onPeriodEnd }: Props) {
  const w = weights[0] ?? null;
  const prev = weights[1] ?? null;
  const diff = w?.value != null && prev?.value != null ? Math.round((w.value - prev.value) * 10) / 10 : null;
  const on = ongoingPeriod(periods, todayKey);
  const last = periods[0] ?? null;

  let periodText: string;
  if (on) periodText = `第 ${daysBetween(on.date, todayKey) + 1} 天（${md(on.date)} 来的）`;
  else if (last) {
    const n = daysBetween(last.date, todayKey);
    const range = last.end_date && last.end_date !== last.date ? `${md(last.date)}–${md(last.end_date)}` : md(last.date);
    periodText = n <= 0 ? `今天来的，今天结束` : `上次 ${range}，离上次来过了 ${n} 天`;
  } else periodText = '还没记过';

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>体重</Text>
        <Text style={styles.value} numberOfLines={1}>
          {w?.value != null ? `${w.value} kg` : '还没记过'}
          {w ? <Text style={styles.sub}>{`  ${w.date === todayKey ? '今天' : md(w.date)}${diff != null && diff !== 0 ? ` · ${diff > 0 ? '+' : ''}${diff}` : ''}`}</Text> : null}
        </Text>
        <Pressable style={styles.btn} onPress={onWeigh} testID="body-weigh">
          <Text style={styles.btnText}>记体重</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>经期</Text>
        <Text style={styles.value} numberOfLines={1}>
          {periodText}
        </Text>
        {on ? (
          <Pressable style={styles.btnGhost} onPress={() => onPeriodEnd(on)} testID="body-period-end">
            <Text style={styles.btnGhostText}>结束了</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.btnGhost} onPress={onPeriodStart} testID="body-period-start">
            <Text style={styles.btnGhostText}>来了</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { width: 34, fontSize: fontSize.secondary, color: colors.textMuted },
  value: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  sub: { fontSize: fontSize.secondary, color: colors.textMuted, fontWeight: '400' },
  btn: { backgroundColor: colors.purpleDark, borderRadius: radius.widget, paddingHorizontal: 12, paddingVertical: 6 },
  btnText: { color: '#fff', fontSize: fontSize.secondary, fontWeight: '700' },
  btnGhost: { borderWidth: 1, borderColor: colors.purple, borderRadius: radius.widget, paddingHorizontal: 12, paddingVertical: 5, minWidth: 52, alignItems: 'center' },
  btnGhostText: { color: colors.purpleDark, fontSize: fontSize.secondary },
});
