import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { useCaptureStore } from '../../lib/captureStore';
import { alternativesFor, analyze, convertSaved, KIND_NAME, loadDraft, removeSaved, saveDraft, saveParsed, type SavedCapture } from '../../lib/capture';
import type { CaptureKind } from '../../lib/captureParse';
import { useDataBus } from '../../lib/dataBus';
import { useCardStore } from '../../lib/store';
import { rescheduleAll } from '../../lib/ling/proactive';
import { onStateTapped, undoStateTap, type CatchHandle } from '../../lib/ling/catch';
import { syncIdeasSoon, syncStatesSoon } from '../../lib/notion/sync';
import type { StateWord } from '../../lib/states';

// 右下角 ＋（需求文档 §8.2）：面板一弹出就能打字，回车就存；App 自己判断存到哪，结果显示成小标签，
// 点「改」能换成别的；点外面关掉，没写完的自动存草稿，下次打开还在。

interface Entry {
  saved: SavedCapture;
  /** 存成状态时灵接住的那两条，撤销 / 改成别的时一起拿掉 */
  handle: CatchHandle | null;
}

export function CaptureSheet() {
  const { visible, mode, close } = useCaptureStore();
  const bump = useDataBus((s) => s.bump);
  const [text, setText] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [changing, setChanging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    setEntries([]);
    setChanging(null);
    setError(null);
    if (mode === 'any') loadDraft().then(setText);
    else setText('');
  }, [visible, mode]);

  function onChange(t: string) {
    setText(t);
    if (mode !== 'any') return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => saveDraft(t), 300);
  }

  function dismiss() {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (mode === 'any') saveDraft(text);
    close();
  }

  /** 存好之后的连带动作：有时间的事项让灵到点叫你、例行卡片刷新、状态让灵接住、想法往 Notion 送 */
  async function after(saved: SavedCapture): Promise<CatchHandle | null> {
    bump();
    const k = saved.kind;
    if (k === 'todo' || k === 'routine') rescheduleAll().catch(() => []);
    if (saved.ref.table === 'cards') useCardStore.getState().fetchAll();
    if (k === 'idea') setTimeout(syncIdeasSoon, 6000);
    if (k === 'state' && saved.parsed.state) {
      setTimeout(syncStatesSoon, 6000);
      const handle: CatchHandle = { cancelled: false, ids: [] };
      // 原话就是「有点内耗」这种，不用再当补充说明重复一遍
      onStateTapped(saved.parsed.state as StateWord, null, handle).catch(() => null);
      return handle;
    }
    return null;
  }

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { parsed } = await analyze(t);
      const p = mode === 'fragment' ? { ...parsed, kind: 'fragment' as const, text: t, at: undefined } : parsed;
      const saved = await saveParsed(p);
      const handle = await after(saved);
      setEntries((prev) => [{ saved, handle }, ...prev].slice(0, 5));
      setText('');
      if (mode === 'any') saveDraft('');
    } catch (err) {
      setError(`没存上：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function change(entry: Entry, to: CaptureKind | 'undo') {
    setChanging(null);
    setBusy(true);
    try {
      if (entry.handle) await undoStateTap(entry.handle);
      if (to === 'undo') {
        await removeSaved(entry.saved);
        bump();
        if (entry.saved.kind === 'todo' || entry.saved.kind === 'routine') rescheduleAll().catch(() => []);
        if (entry.saved.ref.table === 'cards') useCardStore.getState().fetchAll();
        setEntries((prev) => prev.filter((e) => e !== entry));
        return;
      }
      const saved = await convertSaved(entry.saved, to);
      if (entry.saved.kind === 'todo' || entry.saved.kind === 'routine') rescheduleAll().catch(() => []);
      if (entry.saved.ref.table === 'cards') useCardStore.getState().fetchAll();
      const handle = await after(saved);
      setEntries((prev) => prev.map((e) => (e === entry ? { saved, handle } : e)));
    } catch (err) {
      setError(`没改成：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss} testID="capture-backdrop">
        <KeyboardAvoidingView behavior="padding" style={styles.avoider}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>{mode === 'fragment' ? '记一句' : '随手记'}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={onChange}
                placeholder={mode === 'fragment' ? '今天的一句话' : '一句话就行，回车就存'}
                placeholderTextColor={colors.textMuted}
                autoFocus
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={submit}
                testID="capture-input"
              />
              <Pressable style={[styles.saveBtn, (!text.trim() || busy) && styles.saveBtnOff]} onPress={submit} disabled={!text.trim() || busy} testID="capture-save">
                <Text style={styles.saveText}>存</Text>
              </Pressable>
            </View>
            {mode === 'any' && !entries.length ? (
              <Text style={styles.hint}>「14:00-16:00 写简历」「周三带皮蛋打疫苗」「每隔3天换猫砂」「想做个人短剧」「有点内耗」都行，判断不了的存成碎片。</Text>
            ) : null}
            {entries.map((e) => (
              <View key={`${e.saved.ref.table}:${e.saved.ref.id}`} style={styles.entry}>
                <View style={styles.entryRow}>
                  <Text style={styles.entryText} numberOfLines={1}>
                    {e.saved.parsed.raw}
                  </Text>
                  <Pressable style={styles.tag} onPress={() => setChanging(changing === e.saved.ref.id ? null : e.saved.ref.id)} testID="capture-tag">
                    <Text style={styles.tagText}>→ {e.saved.label}</Text>
                    <Text style={styles.tagEdit}> 改</Text>
                  </Pressable>
                </View>
                {changing === e.saved.ref.id ? (
                  <View style={styles.alts}>
                    {alternativesFor(e.saved.parsed)
                      .filter((k) => k !== e.saved.kind)
                      .map((k) => (
                        <Pressable key={k} style={styles.alt} onPress={() => change(e, k)} disabled={busy} testID={`capture-to-${k}`}>
                          <Text style={styles.altText}>改成{KIND_NAME[k]}</Text>
                        </Pressable>
                      ))}
                    <Pressable style={styles.alt} onPress={() => change(e, 'undo')} disabled={busy} testID="capture-undo">
                      <Text style={styles.altUndo}>撤销</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,53,84,0.35)', justifyContent: 'flex-end' },
  avoider: { width: '100%' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  title: { fontSize: fontSize.cardName, fontWeight: '700', color: colors.textPrimary },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: { flex: 1, backgroundColor: colors.background, borderRadius: radius.widget, paddingHorizontal: 12, paddingVertical: 10, fontSize: fontSize.cardName, color: colors.textPrimary },
  saveBtn: { backgroundColor: colors.purpleDark, borderRadius: radius.widget, paddingHorizontal: 16, paddingVertical: 10 },
  saveBtnOff: { opacity: 0.4 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: fontSize.body },
  hint: { fontSize: fontSize.secondary, color: colors.textMuted, lineHeight: 17 },
  entry: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.purpleLight, paddingTop: spacing.sm },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  entryText: { flex: 1, fontSize: fontSize.body, color: colors.textSecondary },
  tag: { flexDirection: 'row', backgroundColor: colors.purpleLight, borderRadius: radius.button, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '62%' },
  tagText: { fontSize: fontSize.secondary, color: colors.purpleDark, flexShrink: 1 },
  tagEdit: { fontSize: fontSize.secondary, color: colors.purpleDark, fontWeight: '700' },
  alts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  alt: { borderWidth: 1, borderColor: colors.purple, borderRadius: radius.button, paddingHorizontal: 10, paddingVertical: 4 },
  altText: { fontSize: fontSize.secondary, color: colors.purpleDark },
  altUndo: { fontSize: fontSize.secondary, color: colors.redDark },
  error: { fontSize: fontSize.secondary, color: colors.redDark },
});
