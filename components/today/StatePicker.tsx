import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { STATE_WORDS, type StateWord } from '../../lib/states';

// 「现在怎么样」：一排状态词（D8：Notion 状态日志那 7 个 + 内耗）。
// 点一下就记；长按可以顺手选强度 1–5、补一句发生了什么（需求文档 §8.4 S-1、S-2）。

interface Props {
  onPick: (state: StateWord, intensity: number | null, note: string | null) => void;
}

export function StatePicker({ onPick }: Props) {
  const [detail, setDetail] = useState<StateWord | null>(null);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [note, setNote] = useState('');

  function openDetail(s: StateWord) {
    setDetail(s);
    setIntensity(null);
    setNote('');
  }

  function submitDetail() {
    if (!detail) return;
    onPick(detail, intensity, note.trim() || null);
    setDetail(null);
  }

  return (
    <View>
      <View style={styles.chips}>
        {STATE_WORDS.map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, detail === s && styles.chipActive]}
            onPress={() => (detail ? openDetail(s) : onPick(s, null, null))}
            onLongPress={() => openDetail(s)}
            delayLongPress={350}
            testID={`state-${s}`}
          >
            <Text style={[styles.chipText, detail === s && styles.chipTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>
      {detail ? (
        <View style={styles.detail}>
          <View style={styles.row}>
            <Text style={styles.detailLabel}>多强</Text>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} style={[styles.level, intensity === n && styles.levelActive]} onPress={() => setIntensity(intensity === n ? null : n)} testID={`state-level-${n}`}>
                <Text style={[styles.levelText, intensity === n && styles.levelTextActive]}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="顺手补一句发生了什么（可以不写）"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={submitDetail}
          />
          <View style={styles.row}>
            <Pressable style={styles.btn} onPress={submitDetail}>
              <Text style={styles.btnText}>记下「{detail}」</Text>
            </Pressable>
            <Pressable onPress={() => setDetail(null)} hitSlop={8}>
              <Text style={styles.cancel}>算了</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.button, backgroundColor: colors.background },
  chipActive: { backgroundColor: colors.purpleDark },
  chipText: { fontSize: fontSize.body, color: colors.textPrimary },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  detail: { marginTop: spacing.sm, gap: spacing.sm, backgroundColor: colors.background, borderRadius: radius.widget, padding: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabel: { fontSize: fontSize.secondary, color: colors.textSecondary, marginRight: 2 },
  level: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  levelActive: { backgroundColor: colors.purpleDark },
  levelText: { fontSize: fontSize.body, color: colors.textPrimary },
  levelTextActive: { color: '#fff', fontWeight: '700' },
  input: { backgroundColor: colors.card, borderRadius: radius.widget, paddingHorizontal: 10, paddingVertical: 8, fontSize: fontSize.body, color: colors.textPrimary },
  btn: { backgroundColor: colors.purpleDark, borderRadius: radius.widget, paddingHorizontal: 14, paddingVertical: 8 },
  btnText: { color: '#fff', fontSize: fontSize.body, fontWeight: '600' },
  cancel: { color: colors.textMuted, fontSize: fontSize.body },
});
