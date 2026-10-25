import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { NextStep } from '../../lib/notion/sync';

// 「项目的下一步」：来自 Notion 计划与待办（有下一步、不在想法池和已完成）。
// 点「这一步做完了」：Notion 那条的下一步清空，备注里追加一行带日期的记录（5 秒内可以撤销，撤销就不写）。

interface Props {
  steps: NextStep[];
  pendingId: string | null;
  error: string | null;
  onDone: (step: NextStep) => void;
}

export function NextStepsSection({ steps, pendingId, error, onDone }: Props) {
  return (
    <View style={styles.wrap}>
      {steps.map((s) => (
        <View key={s.id} style={styles.item}>
          <Text style={styles.project} numberOfLines={1}>
            Notion · {s.title || '没起名的项目'}
          </Text>
          <Text style={[styles.step, pendingId === s.id && styles.stepDone]}>{s.step}</Text>
          <View style={styles.actions}>
            {pendingId === s.id ? (
              <Text style={styles.muted}>做完了，5 秒后写进 Notion</Text>
            ) : (
              <Pressable style={styles.doneBtn} onPress={() => onDone(s)} testID={`next-done-${s.title}`}>
                <Text style={styles.doneText}>这一步做完了</Text>
              </Pressable>
            )}
            {s.url ? (
              <Pressable onPress={() => Linking.openURL(s.url).catch(() => {})} hitSlop={6}>
                <Text style={styles.link}>打开 Notion ›</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  item: { backgroundColor: colors.background, borderRadius: radius.widget, padding: spacing.md, gap: 6 },
  project: { fontSize: fontSize.secondary, color: colors.textMuted },
  step: { fontSize: fontSize.cardName, color: colors.textPrimary, lineHeight: 20 },
  stepDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  doneBtn: { backgroundColor: colors.purpleLight, borderRadius: radius.button, paddingHorizontal: 12, paddingVertical: 6 },
  doneText: { color: colors.purpleDark, fontSize: fontSize.body, fontWeight: '600' },
  link: { color: colors.purpleDark, fontSize: fontSize.secondary },
  muted: { color: colors.textMuted, fontSize: fontSize.secondary },
  error: { color: colors.redDark, fontSize: fontSize.secondary },
});
