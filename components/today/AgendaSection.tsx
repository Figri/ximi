import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { SLOT_LABEL, type AgendaRow } from '../../lib/today';
import type { ScheduleSlot } from '../../types';

// 「作息和事项」：全天 + 各个时段，作息（例行）是方框，事项是圆圈。没东西的时段不占地方。
// 点框就勾（今天页给 5 秒撤销）；长按事项能改（日期、重复、提醒、删掉）。
// 以前没做完的一次性事项（顺延）先收成一行「以前没做完的 N 件」，点开再看，不挤占今天的。

const ORDER: ScheduleSlot[] = ['allday', '08', '10', '12', '14', '16', '18', '20', '22'];

interface Props {
  rows: Record<ScheduleSlot, AgendaRow[]>;
  onToggle: (row: AgendaRow) => void;
  onEdit?: (row: AgendaRow) => void;
}

function Row({ r, onToggle, onEdit }: { r: AgendaRow; onToggle: (row: AgendaRow) => void; onEdit?: (row: AgendaRow) => void }) {
  return (
    <Pressable
      style={styles.row}
      onPress={() => onToggle(r)}
      onLongPress={r.kind === 'todo' && onEdit ? () => onEdit(r) : undefined}
      delayLongPress={400}
      hitSlop={4}
      testID={`agenda-${r.title}`}
    >
      <View style={[r.kind === 'routine' ? styles.square : styles.circle, r.done && styles.boxDone]}>
        {r.done ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={[styles.title, r.done && styles.titleDone, r.carriedFrom && !r.done && styles.titleCarried]} numberOfLines={2}>
        {r.time ? `${r.time} ` : ''}
        {r.title}
      </Text>
      {r.starred ? <Text style={styles.star}>★</Text> : null}
      {r.carriedFrom ? <Text style={styles.tag}>{r.carriedFrom}</Text> : r.kind === 'routine' ? <Text style={styles.tag}>例行</Text> : r.repeatLabel ? <Text style={styles.tag}>{r.repeatLabel}</Text> : null}
    </Pressable>
  );
}

export function AgendaSection({ rows, onToggle, onEdit }: Props) {
  const [showCarried, setShowCarried] = useState(false);
  const carried = (rows.allday ?? []).filter((r) => r.carriedFrom);
  const today: Record<string, AgendaRow[]> = {};
  for (const s of ORDER) today[s] = (rows[s] ?? []).filter((r) => !r.carriedFrom);
  const slots = ORDER.filter((s) => today[s].length);

  return (
    <View style={styles.wrap}>
      {!slots.length ? <Text style={styles.empty}>今天还没排什么。想到要做的，点右下角 ＋ 说一句就行。</Text> : null}
      {slots.map((slot) => (
        <View key={slot} style={styles.slot}>
          <Text style={styles.slotLabel}>{SLOT_LABEL[slot]}</Text>
          <View style={styles.slotRows}>
            {today[slot].map((r) => (
              <Row key={r.key} r={r} onToggle={onToggle} onEdit={onEdit} />
            ))}
          </View>
        </View>
      ))}
      {carried.length ? (
        <View style={styles.carried}>
          <Pressable style={styles.carriedHead} onPress={() => setShowCarried((v) => !v)} hitSlop={4} testID="agenda-carried">
            <Text style={styles.carriedTitle}>以前没做完的 {carried.length} 件</Text>
            <Text style={styles.carriedLink}>{showCarried ? '收起' : '看看 ›'}</Text>
          </Pressable>
          {showCarried ? (
            <View style={styles.slotRows}>
              {carried.map((r) => (
                <Row key={r.key} r={r} onToggle={onToggle} onEdit={onEdit} />
              ))}
              <Text style={styles.hint}>做了就勾掉；不想要了长按它，改日期或者删掉。</Text>
            </View>
          ) : null}
        </View>
      ) : null}
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
  carried: { backgroundColor: colors.background, borderRadius: radius.widget, paddingHorizontal: spacing.md, paddingVertical: 8, gap: 4, marginTop: 2 },
  carriedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  carriedTitle: { fontSize: fontSize.body, color: colors.textSecondary },
  carriedLink: { fontSize: fontSize.secondary, color: colors.purpleDark },
  hint: { fontSize: fontSize.tiny, color: colors.textMuted, marginTop: 2 },
});
