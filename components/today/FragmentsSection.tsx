import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Fragment } from '../../lib/fragments';

// 「碎碎念」：今天随手的一句话，直接在这儿写，回车就记下。晚上写进 Notion 日记的「今日碎片」。
// 新的在上面，多了先收着；长按一条删掉（有撤销）。

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const FOLD = 5;

interface Props {
  fragments: Fragment[];
  onAdd: (text: string) => Promise<void>;
  onDelete: (f: Fragment) => void;
}

export function FragmentsSection({ fragments, onAdd, onDelete }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const newestFirst = [...fragments].reverse();
  const shown = all ? newestFirst : newestFirst.slice(0, FOLD);

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onAdd(t);
      setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="想到什么，随手记一句…"
          placeholderTextColor={colors.textMuted}
          returnKeyType="send"
          onSubmitEditing={submit}
          blurOnSubmit={false}
          testID="fragment-input"
        />
        <Pressable style={[styles.send, !text.trim() && styles.sendOff]} onPress={submit} disabled={!text.trim() || busy} testID="fragment-send">
          <Text style={styles.sendText}>记</Text>
        </Pressable>
      </View>
      {shown.map((f) => (
        <Pressable key={f.id} style={styles.row} onLongPress={() => onDelete(f)} delayLongPress={450} testID={`fragment-${f.id}`}>
          <Text style={styles.time}>{hhmm(f.at)}</Text>
          <Text style={styles.text}>{f.text}</Text>
        </Pressable>
      ))}
      {newestFirst.length > FOLD ? (
        <Pressable onPress={() => setAll((v) => !v)} hitSlop={6}>
          <Text style={styles.more}>{all ? '收起' : `还有 ${newestFirst.length - FOLD} 条 ›`}</Text>
        </Pressable>
      ) : null}
      {fragments.length ? <Text style={styles.hint}>长按一条能删掉</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  input: { flex: 1, backgroundColor: colors.background, borderRadius: radius.widget, paddingHorizontal: spacing.md, paddingVertical: 9, fontSize: fontSize.body, color: colors.textPrimary },
  send: { backgroundColor: colors.purpleDark, borderRadius: radius.widget, paddingHorizontal: 14, paddingVertical: 9 },
  sendOff: { opacity: 0.4 },
  sendText: { color: '#fff', fontSize: fontSize.body, fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
  time: { width: 40, fontSize: fontSize.secondary, color: colors.textMuted, paddingTop: 1 },
  text: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 18 },
  more: { fontSize: fontSize.secondary, color: colors.purpleDark },
  hint: { fontSize: fontSize.tiny, color: colors.textMuted },
});
