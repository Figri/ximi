import { useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Fragment } from '../../lib/fragments';
import type { MoodFace } from '../../lib/moods';
import { MoodPicker } from './MoodPicker';

// 「随心记」：今天随手的一句话，直接在这儿写，回车就记下。晚上写进 Notion 日记的「今日碎片」。
// 输入框左边的表情按钮：选一个「现在怎么样」，可以只记表情，也可以表情 + 一段话（也记进状态日志）。
// 新的在上面，多了先收着；长按一条删掉（有撤销）。

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const FOLD = 5;

interface Props {
  fragments: Fragment[];
  /** mood 是选着的表情（没选是 null）；text 可以是空的（只记表情） */
  onAdd: (text: string, mood: MoodFace | null) => Promise<void>;
  onDelete: (f: Fragment) => void;
}

export function FragmentsSection({ fragments, onAdd, onDelete }: Props) {
  const [text, setText] = useState('');
  const [mood, setMood] = useState<MoodFace | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const [all, setAll] = useState(false);
  const newestFirst = [...fragments].reverse();
  const shown = all ? newestFirst : newestFirst.slice(0, FOLD);

  const canSend = !!text.trim() || !!mood;

  async function submit() {
    const t = text.trim();
    if (!canSend || busy) return;
    setBusy(true);
    try {
      await onAdd(t, mood);
      setText('');
      setMood(null);
    } finally {
      setBusy(false);
    }
  }

  function openPicker() {
    Keyboard.dismiss();
    setPickerOpen(true);
  }

  /** 选了表情：弹窗关掉，光标回到输入框，想写就接着写，不写直接点「记」 */
  function pick(m: MoodFace | null) {
    setMood(m);
    setPickerOpen(false);
    if (m) setTimeout(() => inputRef.current?.focus(), 300);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <Pressable style={[styles.moodBtn, mood && styles.moodBtnOn]} onPress={openPicker} hitSlop={4} testID="fragment-mood">
          <Text style={[styles.moodBtnText, !mood && styles.moodBtnIdle]}>{mood ? mood.face : '🙂'}</Text>
        </Pressable>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={mood ? `${mood.label}，想说就接着写…` : '想到什么，随手记一句…'}
          placeholderTextColor={colors.textMuted}
          returnKeyType="send"
          onSubmitEditing={submit}
          blurOnSubmit={false}
          testID="fragment-input"
        />
        <Pressable style={[styles.send, !canSend && styles.sendOff]} onPress={submit} disabled={!canSend || busy} testID="fragment-send">
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
      <MoodPicker visible={pickerOpen} selected={mood} onPick={pick} onClose={() => setPickerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  moodBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, borderWidth: 2, borderColor: 'transparent' },
  moodBtnOn: { backgroundColor: colors.purpleLight, borderColor: colors.purpleDark },
  moodBtnText: { fontSize: 20, lineHeight: 24 },
  moodBtnIdle: { opacity: 0.45 },
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
