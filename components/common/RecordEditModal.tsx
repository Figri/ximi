import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../../constants/theme';

/** 记录的统一编辑入口：长按打开，删除只出现在弹窗中。 */
export function RecordEditModal({ visible, title, text, heading, headingLabel, allowEmpty = false, onClose, onSave, onDelete }: {
  visible: boolean; title: string; text: string; heading?: string; headingLabel?: string; allowEmpty?: boolean;
  onClose: () => void; onSave: (text: string, heading?: string) => Promise<void>; onDelete: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(text);
  const [name, setName] = useState(heading ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const working = useRef(false);
  useEffect(() => { if (visible) { setDraft(text); setName(heading ?? ''); setError(''); } }, [visible, text, heading]);
  async function submit(remove: boolean) {
    if (working.current) return;
    if (!remove && !allowEmpty && !draft.trim()) { setError('内容不能为空'); return; }
    working.current = true; setBusy(true); setError('');
    try { if (remove) await onDelete(); else await onSave(draft, name); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { working.current = false; setBusy(false); }
  }
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
    <KeyboardAvoidingView behavior="padding" style={s.backdrop}>
      <View style={s.sheet} testID="record-editor">
        <Text style={s.title}>{title}</Text>
        <ScrollView keyboardShouldPersistTaps="handled">
          {heading !== undefined ? <TextInput testID="record-edit-title" style={s.input} value={name} onChangeText={setName} placeholder={headingLabel ?? '标题'} accessibilityLabel={headingLabel ?? '标题'} /> : null}
          <TextInput testID="record-edit-text" style={[s.input, s.body]} value={draft} onChangeText={setDraft} multiline textAlignVertical="top" />
        </ScrollView>
        {error ? <Text style={s.error}>{error}</Text> : null}
        <View style={s.buttons}>
          <Pressable testID="record-delete" disabled={busy} onPress={() => submit(true)}><Text style={s.error}>删除</Text></Pressable>
          <View style={s.spacer}/>
          <Pressable testID="record-cancel" disabled={busy} onPress={onClose}><Text style={s.link}>取消</Text></Pressable>
          <Pressable testID="record-save" disabled={busy} onPress={() => submit(false)}><Text style={s.link}>{busy ? '保存中…' : '保存'}</Text></Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,53,84,0.3)', justifyContent: 'center', padding: spacing.lg },
  sheet: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.lg, gap: 16, maxHeight: '85%', width: '100%', maxWidth: 600, alignSelf: 'center' },
  title: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
  input: { padding: 12, backgroundColor: colors.background, borderRadius: radius.widget, fontSize: 16, color: colors.textPrimary, marginBottom: 10 },
  body: { minHeight: 180, lineHeight: 25 }, buttons: { flexDirection: 'row', alignItems: 'center', gap: 24, paddingVertical: 8 },
  spacer: { flex: 1 }, error: { color: colors.redDark, fontSize: 15 }, link: { color: colors.purpleDark, fontSize: 15 },
});
