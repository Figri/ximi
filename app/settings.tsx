import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AI_MODELS, type AIModel } from '../lib/ai';
import { getApiKey, getSelectedModel, maskKey, setApiKey, setSelectedModel } from '../lib/aiSettings';
import { colors, fontSize, radius, spacing } from '../constants/theme';

export default function SettingsScreen() {
  const [selected, setSelected] = useState<AIModel>('claude-sonnet');
  const [savedKeys, setSavedKeys] = useState<Partial<Record<AIModel, string>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<AIModel, string>>>({});
  const [expanded, setExpanded] = useState<AIModel | null>(null);

  useEffect(() => {
    load();
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
});
