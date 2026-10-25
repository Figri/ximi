import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';
import type { Fragment } from '../../lib/fragments';

// 「今日碎片」：当天的一句话记录，晚上写进 Notion 日记的「今日碎片」。长按删除（有撤销）。

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface Props {
  fragments: Fragment[];
  onAdd: () => void;
  onDelete: (f: Fragment) => void;
}

export function FragmentsSection({ fragments, onAdd, onDelete }: Props) {
  return (
    <View style={styles.wrap}>
      {fragments.map((f) => (
        <Pressable key={f.id} style={styles.row} onLongPress={() => onDelete(f)} delayLongPress={450}>
          <Text style={styles.time}>{hhmm(f.at)}</Text>
          <Text style={styles.text}>{f.text}</Text>
        </Pressable>
      ))}
      <Pressable onPress={onAdd} hitSlop={6} testID="fragment-add">
        <Text style={styles.add}>＋ 记一句</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
  time: { width: 40, fontSize: fontSize.secondary, color: colors.textMuted, paddingTop: 1 },
  text: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 18 },
  add: { fontSize: fontSize.body, color: colors.purpleDark, paddingVertical: 2 },
});
