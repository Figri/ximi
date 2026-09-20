import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { AI_MODELS, buildSystemPrompt, type AIModel } from '../lib/ai';
import { getApiKey, getSelectedModel, maskKey, setApiKey, setSelectedModel } from '../lib/aiSettings';
import { buildCardContextSummary } from '../lib/chatInstructions';
import { fetchMemory, saveMemory } from '../lib/memory';
import { useCardStore } from '../lib/store';
import { colors, fontSize, radius, spacing } from '../constants/theme';

function shortId(id: string | null) {
  if (!id) return '无（当前是安装包自带版本）';
  return id.slice(0, 8);
}

function formatTime(date: Date | null) {
  if (!date) return '未知';
  return date.toLocaleString('zh-CN', { hour12: false });
}

export default function SettingsScreen() {
  const { cards, actions, cats, lastCompletions, fetchAll } = useCardStore();
  const [selected, setSelected] = useState<AIModel>('claude-sonnet');
  const [savedKeys, setSavedKeys] = useState<Partial<Record<AIModel, string>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<AIModel, string>>>({});
  const [expanded, setExpanded] = useState<AIModel | null>(null);
  const [checking, setChecking] = useState(false);
  const [memory, setMemory] = useState('');
  const [memoryDraft, setMemoryDraft] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  useEffect(() => {
    load();
    fetchAll();
    fetchMemory().then((m) => {
      setMemory(m);
      setMemoryDraft(m);
    });
  }, []);

  async function load() {
    const model = (await getSelectedModel()) ?? 'claude-sonnet';
    setSelected(model);

    const entries = await Promise.all(AI_MODELS.map(async (m) => [m.id, await getApiKey(m.id)] as const));
    const map: Partial<Record<AIModel, string>> = {};
    for (const [id, key] of entries) if (key) map[id] = key;
    setSavedKeys(map);
  }

  async function handleSelect(model: AIModel) {
    setSelected(model);
    await setSelectedModel(model);
  }

  async function handleSaveKey(model: AIModel) {
    const draft = drafts[model] ?? '';
    await setApiKey(model, draft);
    await load();
    setExpanded(null);
    setDrafts((prev) => ({ ...prev, [model]: '' }));
  }

  async function handleSaveMemory() {
    setSavingMemory(true);
    try {
      await saveMemory(memoryDraft.trim());
      setMemory(memoryDraft.trim());
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSavingMemory(false);
    }
  }

  async function handleCheckUpdate() {
    if (checking) return;
    setChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        Alert.alert('已是最新版本', '没有可用的新更新');
        return;
      }
      await Updates.fetchUpdateAsync();
      Alert.alert('更新已下载', '现在重启应用来应用新版本', [
        { text: '稍后', style: 'cancel' },
        { text: '立即重启', onPress: () => Updates.reloadAsync() },
      ]);
    } catch (err) {
      Alert.alert('检查更新失败', err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }

  function handleClearKey(model: AIModel) {
    const label = AI_MODELS.find((m) => m.id === model)?.label;
    Alert.alert(`清除 ${label} 的 key？`, '清除后这个模型没法用了，随时可以重新填', [
      { text: '取消', style: 'cancel' },
      {
        text: '清除',
        style: 'destructive',
        onPress: async () => {
          await setApiKey(model, '');
          await load();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          每个 key 只存在这台手机本地（系统安全存储），不会传到 Supabase 或者任何服务器。换 APP/清数据要重新填。
        </Text>

        <Text style={styles.label}>当前用哪个模型聊天</Text>
        {AI_MODELS.map((m) => {
          const hasKey = !!savedKeys[m.id];
          const isSelected = selected === m.id;
          const isExpanded = expanded === m.id;

          return (
            <View key={m.id} style={styles.providerCard}>
              <Pressable style={styles.providerRow} onPress={() => handleSelect(m.id)}>
                <View style={[styles.radio, isSelected && styles.radioActive]} />
                <View style={styles.providerInfo}>
                  <Text style={styles.providerName}>{m.label}</Text>
                  <Text style={styles.providerStatus}>
                    {hasKey ? `已设置 ${maskKey(savedKeys[m.id]!)}` : '还没填 key'}
                  </Text>
                </View>
                <Pressable
                  style={styles.editButton}
                  onPress={() => setExpanded(isExpanded ? null : m.id)}
                >
                  <Text style={styles.editButtonText}>{hasKey ? '修改' : '设置'}</Text>
                </Pressable>
              </Pressable>

              {isExpanded && (
                <View style={styles.editArea}>
                  <TextInput
                    style={styles.input}
                    placeholder={m.keyHint}
                    placeholderTextColor={colors.textMuted}
                    value={drafts[m.id] ?? ''}
                    onChangeText={(text) => setDrafts((prev) => ({ ...prev, [m.id]: text }))}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View style={styles.editActions}>
                    {hasKey && (
                      <Pressable style={styles.clearButton} onPress={() => handleClearKey(m.id)}>
                        <Text style={styles.clearButtonText}>清除</Text>
                      </Pressable>
                    )}
                    <Pressable style={styles.saveButton} onPress={() => handleSaveKey(m.id)}>
                      <Text style={styles.saveButtonText}>保存</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        <Text style={[styles.label, { marginTop: spacing.lg }]}>AI 记忆</Text>
        <View style={styles.memoryCard}>
          <Text style={styles.memoryHint}>
            写在这里的东西，每次跟灵聊天都会带上（人设、习惯、偏好、长期要记住的事……）
          </Text>
          <TextInput
            style={styles.memoryInput}
            value={memoryDraft}
            onChangeText={setMemoryDraft}
            placeholder="比如：我是西米，INTP，喜欢直白但温柔的语气……"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />
          <Pressable style={styles.saveButton} onPress={handleSaveMemory} disabled={savingMemory || memoryDraft === memory}>
            <Text style={styles.saveButtonText}>{savingMemory ? '保存中…' : '保存'}</Text>
          </Pressable>

          <Pressable style={styles.previewToggle} onPress={() => setShowPromptPreview((v) => !v)}>
            <Text style={styles.previewToggleText}>
              {showPromptPreview ? '收起' : '查看现在会发给 AI 的完整提示词'}
            </Text>
          </Pressable>
          {showPromptPreview && (
            <Text style={styles.promptPreview} selectable>
              {buildSystemPrompt(
                `现在是 ${new Date().toLocaleString('zh-CN', { hour12: false })}。\n\n${buildCardContextSummary(cards, actions, cats, lastCompletions, memory)}`
              )}
            </Text>
          )}
        </View>

        <Text style={[styles.label, { marginTop: spacing.lg }]}>版本信息</Text>
        <View style={styles.versionCard}>
          <View style={styles.versionRow}>
            <Text style={styles.versionKey}>更新 ID</Text>
            <Text style={styles.versionValue}>{shortId(Updates.updateId)}</Text>
          </View>
          <View style={styles.versionRow}>
            <Text style={styles.versionKey}>更新时间</Text>
            <Text style={styles.versionValue}>{formatTime(Updates.createdAt)}</Text>
          </View>
          <View style={styles.versionRow}>
            <Text style={styles.versionKey}>发布渠道</Text>
            <Text style={styles.versionValue}>{Updates.channel ?? '未知'}</Text>
          </View>
          {Updates.isEmbeddedLaunch && (
            <Text style={styles.versionWarning}>
              ⚠️ 当前运行的是安装包自带版本，还没有应用过任何 OTA 更新
            </Text>
          )}
          <Pressable
            style={styles.checkButton}
            onPress={handleCheckUpdate}
            disabled={checking}
          >
            {checking ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.checkButtonText}>检查更新</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  intro: {
    fontSize: fontSize.secondary,
    color: colors.textMuted,
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  label: {
    fontSize: fontSize.secondary,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  providerCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: radius.avatar,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  radioActive: {
    borderColor: colors.purpleDark,
    backgroundColor: colors.purpleDark,
  },
  providerInfo: { flex: 1 },
  providerName: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600' },
  providerStatus: { fontSize: fontSize.secondary, color: colors.textMuted, marginTop: 2 },
  editButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.button,
    backgroundColor: colors.blueLight,
  },
  editButtonText: { fontSize: fontSize.secondary, color: colors.blueDark },
  editArea: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  clearButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  clearButtonText: { color: colors.redDark, fontSize: fontSize.body },
  saveButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.widget,
    backgroundColor: colors.purpleDark,
  },
  saveButtonText: { color: '#fff', fontSize: fontSize.body, fontWeight: '600' },
  memoryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  memoryHint: {
    fontSize: fontSize.secondary,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  memoryInput: {
    backgroundColor: colors.background,
    borderRadius: radius.widget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    minHeight: 100,
    marginBottom: spacing.sm,
  },
  previewToggle: { marginTop: spacing.md, alignItems: 'center' },
  previewToggleText: { fontSize: fontSize.secondary, color: colors.blueDark },
  promptPreview: {
    marginTop: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.widget,
    padding: spacing.sm,
    fontSize: fontSize.tiny,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  versionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  versionKey: { fontSize: fontSize.secondary, color: colors.textMuted },
  versionValue: { fontSize: fontSize.secondary, color: colors.textPrimary, fontWeight: '600' },
  versionWarning: {
    fontSize: fontSize.secondary,
    color: colors.redDark,
    lineHeight: 18,
  },
  checkButton: {
    marginTop: spacing.xs,
    backgroundColor: colors.purpleDark,
    borderRadius: radius.widget,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  checkButtonText: { color: '#fff', fontSize: fontSize.body, fontWeight: '600' },
});
