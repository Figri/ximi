import { useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, lh, radius, spacing } from '../../constants/theme';
import type { Fragment } from '../../lib/fragments';
import type { MoodFace } from '../../lib/moods';
import { MoodPicker } from './MoodPicker';
import { growInputProps } from './growInput';

// 「随心记」：今天随手的一句话，直接在这儿写，回车就记下。晚上写进 Notion 日记的「今日碎片」。
// 输入框左边的表情按钮：选一个「现在怎么样」，可以只记表情，也可以表情 + 一段话（也记进状态日志）。
// 新的在上面，多了先收着；长按一条打开编辑弹窗。
// 写的时候字多了输入框往下长，最多 7 行（再多在框里滚），回车还是「记」。
// 空着的时候框按提示字的长短长，提示字写短，大字号窄屏上也是一行。

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const FOLD = 5;

interface Props {
  fragments: Fragment[];
  /** mood 是选着的表情（没选是 null）；text 可以是空的（只记表情） */
  onAdd: (text: string, mood: MoodFace | null) => Promise<void>;
  onEdit: (f: Fragment) => void;
  /** 翻到以前的日子：只看（长按编辑），不显示输入框 */
  readOnly?: boolean;
}

export function FragmentsSection({ fragments, onAdd, onEdit, readOnly }: Props) {
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
      {readOnly ? null : (
      <View style={styles.inputRow}>
        <Pressable style={[styles.moodBtn, mood && styles.moodBtnOn]} onPress={openPicker} hitSlop={4} testID="fragment-mood">
          <Text style={[styles.moodBtnText, !mood && styles.moodBtnIdle]}>{mood ? mood.face : '🙂'}</Text>
        </Pressable>
        <TextInput
          ref={inputRef}
          style={[styles.input, Platform.OS === 'web' && WEB_GROW]}
          value={text}
          onChangeText={setText}
          placeholder={mood ? `${mood.label}，接着写…` : '想到什么记一句…'}
          placeholderTextColor={colors.textMuted}
          returnKeyType="send"
          {...growInputProps(submit)}
          testID="fragment-input"
        />
        <Pressable style={[styles.send, !canSend && styles.sendOff]} onPress={submit} disabled={!canSend || busy} testID="fragment-send">
          <Text style={styles.sendText}>记</Text>
        </Pressable>
      </View>
      )}
      {readOnly && !fragments.length ? <Text style={styles.hint}>这天没写随心记</Text> : null}
      {shown.map((f) => (
        <Pressable key={f.id} style={styles.row} onLongPress={() => onEdit(f)} delayLongPress={450} testID={`fragment-${f.id}`}>
          <Text style={styles.time}>{hhmm(f.at)}</Text>
          <Text style={styles.text}>{f.text}</Text>
        </Pressable>
      ))}
      {newestFirst.length > FOLD ? (
        <Pressable onPress={() => setAll((v) => !v)} hitSlop={6}>
          <Text style={styles.more}>{all ? '收起' : `还有 ${newestFirst.length - FOLD} 条 ›`}</Text>
        </Pressable>
      ) : null}
      <MoodPicker visible={pickerOpen} selected={mood} onPick={pick} onClose={() => setPickerOpen(false)} />
    </View>
  );
}

/** 输入框一行的行高（跟下面一条条的字一样）；最多长到 7 行 */
const LINE = lh(22);
const PAD = 9;
/** 网页上的 textarea 不会自己长高，让它按内容长（安卓上 multiline 本来就会） */
const WEB_GROW = { fieldSizing: 'content' } as any;

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginBottom: 2 },
  moodBtn: { width: 38, height: 38, marginBottom: (LINE + PAD * 2 - 38) / 2, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, borderWidth: 2, borderColor: 'transparent' },
  moodBtnOn: { backgroundColor: colors.purpleLight, borderColor: colors.purpleDark },
  moodBtnText: { fontSize: 20, lineHeight: 24 },
  moodBtnIdle: { opacity: 0.45 },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.background,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingTop: PAD,
    paddingBottom: PAD,
    fontSize: fontSize.reading,
    lineHeight: LINE,
    minHeight: LINE * 2 + PAD * 2,
    maxHeight: LINE * 7 + PAD * 2 + 2,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  send: { height: LINE + PAD * 2, justifyContent: 'center', backgroundColor: colors.purpleDark, borderRadius: radius.widget, paddingHorizontal: 14 },
  sendOff: { opacity: 0.4 },
  sendText: { color: '#fff', fontSize: fontSize.body, fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 6 },
  time: { width: lh(40), fontSize: fontSize.secondary, color: colors.textMuted, paddingTop: 3 },
  text: { flex: 1, fontSize: fontSize.reading, color: colors.textPrimary, lineHeight: lh(22) },
  more: { fontSize: fontSize.secondary, color: colors.purpleDark },
  hint: { fontSize: fontSize.tiny, color: colors.textMuted },
});
