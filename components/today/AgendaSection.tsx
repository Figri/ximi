import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { SLOT_LABEL, type AgendaRow } from '../../lib/today';
import type { ScheduleSlot } from '../../types';

// 「作息和事项」：全天 + 各个时段，作息（例行）是方框，事项是圆圈；顺延的灰字标「顺延自 X」，不标红。
// 点框就勾（今天页给 5 秒撤销）。没东西的时段不占地方。

const ORDER: ScheduleSlot[] = ['allday', '08', '10', '12', '14', '16', '18', '20', '22'];

interface Props {
  rows: Record<ScheduleSlot, AgendaRow[]>;
  onToggle: (row: AgendaRow) => void;
}

export function AgendaSection({ rows, onToggle }: Props) {
  const slots = ORDER.filter((s) => rows[s]?.length);
  if (!slots.length) return <Text style={styles.empty}>还没排什么。想到要做的，点右下角 ＋ 说一句就行。</Text>;
  return (
    <View style={styles.wrap}>
      {slots.map((slot) => (
        <View key={slot} style={styles.slot}>
          <Text style={styles.slotLabel}>{SLOT_LABEL[slot]}</Text>
          <View style={styles.slotRows}>
            {rows[slot].map((r) => (
              <Pressable key={r.key} style={styles.row} onPress={() => onToggle(r)} hitSlop={4} testID={`agenda-${r.title}`}>
                <View style={[r.kind === 'routine' ? styles.square : styles.circle, r.done && styles.boxDone]}>
                  {r.done ? <Text style={styles.tick}>✓</Text> : null}
                </View>
                <Text style={[styles.title, r.done && styles.titleDone, r.carriedFrom && !r.done && styles.titleCarried]} numberOfLines={2}>
                  {r.time ? `${r.time} ` : ''}
                  {r.title}
                </Text>
                {r.starred ? <Text style={styles.star}>★</Text> : null}
                {r.carriedFrom ? <Text style={styles.tag}>顺延自 {r.carriedFrom}</Text> : r.kind === 'routine' ? <Text style={styles.tag}>例行</Text> : r.repeatLabel ? <Text style={styles.tag}>{r.repeatLabel}</Text> : null}
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const BOX = 18;

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  empty: { fontSize: fontSize.body, color: colors.textMuted, lineHeight: 19 },
  slot: { flexDirection: 'row', gap: spacing.sm },
  slotLabel: { width: 34, fontSize: fontSize.secondary, color: colors.textMuted, paddingTop: 2 },
  slotRows: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  square: { width: BOX, height: BOX, borderRadius: 4, borderWidth: 1.5, borderColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  circle: { width: BOX, height: BOX, borderRadius: BOX / 2, borderWidth: 1.5, borderColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  boxDone: { backgroundColor: colors.purpleDark, borderColor: colors.purpleDark },
  tick: { color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 13 },
  title: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 18 },
  titleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  titleCarried: { color: colors.textSecondary },
  star: { color: colors.yellowDark, fontSize: fontSize.secondary },
  tag: { fontSize: fontSize.tiny, color: colors.textMuted, backgroundColor: colors.background, borderRadius: radius.button, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
});
