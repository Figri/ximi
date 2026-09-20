import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { buildSystemPrompt } from '../lib/ai';
import { buildCardContextSummary } from '../lib/chatInstructions';
import { fetchMemory, saveMemory } from '../lib/memory';
import { useCardStore } from '../lib/store';
import { colors, fontSize, radius, spacing } from '../constants/theme';

export default function MemoryScreen() {
  const { cards, actions, cats, lastCompletions, fetchAll } = useCardStore();
  const [memory, setMemory] = useState('');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetchAll();
    fetchMemory().then((m) => {
      setMemory(m);
      setDraft(m);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await saveMemory(draft.trim());
      setMemory(draft.trim());
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const previewText = buildSystemPrompt(
    `现在是 ${new Date().toLocaleString('zh-CN', { hour12: false })}。\n\n${buildCardContextSummary(cards, actions, cats, lastCompletions, draft)}`
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          写在这里的东西，每次跟灵聊天都会带上——人设、习惯、偏好、最近在做的项目、想让她一直记得的事……
        </Text>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="比如：我是西米，INTP，喜欢直白但温柔的语气……"
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
        />
        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving || draft === memory}>
          <Text style={styles.saveButtonText}>{saving ? '保存中…' : '保存'}</Text>
        </Pressable>

        <Pressable style={styles.previewToggle} onPress={() => setShowPreview((v) => !v)}>
          <Text style={styles.previewToggleText}>{showPreview ? '收起' : '查看完整提示词'}</Text>
        </Pressable>
        {showPreview && (
          <View style={styles.previewBox}>
            <Text style={styles.previewText} selectable>
              {previewText}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
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
  saveButton: {
    backgroundColor: colors.purpleDark,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
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
