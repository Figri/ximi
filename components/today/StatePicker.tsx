import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { MOOD_FACES, STATE_WORDS, type StateWord } from '../../lib/states';

// 「现在怎么样」：先是三个大表情（开心 / 一般 / 难过），点了就一直亮着，不弹撤销；点错了直接点另一个。
// 「更多」里是状态日志那几个细的词（烦躁、焦虑、疲惫……）。长按任何一个能顺手选强度、补一句发生了什么。

interface Props {
  /** 今天最近一次点的（亮着的那个），没点过是 null */
  current: { state: StateWord; at: string } | null;
  onPick: (state: StateWord, intensity: number | null, note: string | null) => void;
}

const MORE_WORDS = STATE_WORDS.filter((s) => !MOOD_FACES.some((f) => f.state === s));

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function StatePicker({ current, onPick }: Props) {
  const [detail, setDetail] = useState<StateWord | null>(null);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const isMoreWord = !!current && !MOOD_FACES.some((f) => f.state === current.state);
  const [moreOpen, setMoreOpen] = useState(false);
  const showMore = moreOpen || isMoreWord;

  function openDetail(s: StateWord) {
    setDetail(s);
    setIntensity(null);
    setNote('');
  }

  function tap(s: StateWord) {
    if (detail) {
      openDetail(s);
      return;
    }
    onPick(s, null, null);
  }

  function submitDetail() {
    if (!detail) return;
    onPick(detail, intensity, note.trim() || null);
    setDetail(null);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.faces}>
        {MOOD_FACES.map(({ state, face }) => {
          const on = current?.state === state;
          return (
            <Pressable
              key={state}
              style={[styles.face, on && styles.faceOn, detail === state && styles.faceDetail]}
              onPress={() => tap(state)}
              onLongPress={() => openDetail(state)}
              delayLongPress={350}
              testID={`mood-${state}`}
              aria-selected={on}
            >
              <Text style={styles.faceEmoji}>{face}</Text>
              <Text style={[styles.faceLabel, on && styles.faceLabelOn]}>{state}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.meta}>{current ? `${hhmm(current.at)} 点的「${current.state}」` : '点一下就记下了'}</Text>
        {!isMoreWord ? (
          <Pressable onPress={() => setMoreOpen((v) => !v)} hitSlop={8} testID="mood-more">
            <Text style={styles.moreLink}>{moreOpen ? '收起' : '更多 ›'}</Text>
          </Pressable>
        ) : null}
      </View>

      {showMore ? (
        <View style={styles.chips}>
          {MORE_WORDS.map((s) => {
            const on = current?.state === s;
            return (
              <Pressable
                key={s}
                style={[styles.chip, on && styles.chipOn, detail === s && styles.chipDetail]}
                onPress={() => tap(s)}
                onLongPress={() => openDetail(s)}
                delayLongPress={350}
                testID={`state-${s}`}
                aria-selected={on}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{s}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

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
  wrap: { gap: spacing.sm },
  faces: { flexDirection: 'row', gap: spacing.sm },
  face: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: radius.card,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  faceOn: { backgroundColor: colors.purpleLight, borderColor: colors.purpleDark },
  faceDetail: { borderColor: colors.purple },
  faceEmoji: { fontSize: 30, lineHeight: 36 },
  faceLabel: { fontSize: fontSize.body, color: colors.textSecondary },
  faceLabelOn: { color: colors.purpleDark, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meta: { fontSize: fontSize.secondary, color: colors.textMuted },
  moreLink: { fontSize: fontSize.secondary, color: colors.purpleDark },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.button, backgroundColor: colors.background, borderWidth: 1.5, borderColor: 'transparent' },
  chipOn: { backgroundColor: colors.purpleLight, borderColor: colors.purpleDark },
  chipDetail: { borderColor: colors.purple },
  chipText: { fontSize: fontSize.body, color: colors.textPrimary },
  chipTextOn: { color: colors.purpleDark, fontWeight: '700' },
  detail: { gap: spacing.sm, backgroundColor: colors.background, borderRadius: radius.widget, padding: spacing.sm },
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
