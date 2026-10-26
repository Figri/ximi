import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { previewSystemPrompt } from '../lib/ling/brain';
import { fetchMemory, saveMemory } from '../lib/memory';
import { colors, fontSize, radius, spacing } from '../constants/theme';

// 「让灵一直记住的事」：只存在这台手机上，灵每次开口都会读到（提示词里「你记得的她」那段）。
// 下面能看灵现在读到的整段提示词——和聊天时拼的是同一份，记忆那段用这里还没存的草稿。

export default function MemoryScreen() {
  const [memory, setMemory] = useState('');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    fetchMemory()
      .then((m) => {
        setMemory(m);
        setDraft(m);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveMemory(draft.trim());
      setMemory(draft.trim());
      setDraft(draft.trim());
    } catch (err) {
      setError(`没存上：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function togglePreview() {
    if (preview != null) {
      setPreview(null);
      return;
    }
    try {
      setPreview(await previewSystemPrompt(draft));
    } catch (err) {
      setPreview(`没拼出来：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const unchanged = draft.trim() === memory;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>让灵记住的事</Text>
        <View style={{ width: 48 }} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.hint}>
            写在这里的，灵每次开口都会带上——人设、习惯、偏好、最近在做的项目、想让灵一直记得的事……只存在这台手机上。
          </Text>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              setError(null);
            }}
            placeholder="比如：我是西米，INTP，喜欢直白但温柔的语气……"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            testID="memory-input"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.saveButton, (saving || unchanged) && styles.saveButtonOff]} onPress={handleSave} disabled={saving || unchanged} testID="memory-save">
            <Text style={styles.saveButtonText}>{saving ? '保存中…' : unchanged && memory ? '已存好 ✓' : '保存'}</Text>
          </Pressable>

          <Pressable style={styles.previewToggle} onPress={togglePreview} testID="memory-preview">
            <Text style={styles.previewToggleText}>{preview != null ? '收起' : '看看灵现在读到的整段提示词'}</Text>
          </Pressable>
          {preview != null ? (
            <View style={styles.previewBox}>
              <Text style={styles.previewText} selectable>
                {preview}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  back: { fontSize: fontSize.body, color: colors.purpleDark, width: 48 },
  title: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
  content: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl * 2 },
  hint: {
    fontSize: fontSize.secondary,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    minHeight: 140,
    marginBottom: spacing.md,
  },
  error: { fontSize: fontSize.secondary, color: colors.redDark, marginBottom: spacing.sm },
  saveButton: {
    backgroundColor: colors.purpleDark,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonOff: { opacity: 0.5 },
  saveButtonText: { color: '#fff', fontSize: fontSize.cardName, fontWeight: '600' },
  previewToggle: { marginTop: spacing.lg, alignItems: 'center' },
  previewToggleText: { fontSize: fontSize.secondary, color: colors.blueDark },
  previewBox: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  previewText: {
    fontSize: fontSize.tiny,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
