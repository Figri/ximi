import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ChatBubble } from '../../components/ChatBubble';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { AI_MODELS, sendChatMessage, type AIModel } from '../../lib/ai';
import { getApiKey, getSelectedModel, setSelectedModel } from '../../lib/aiSettings';
import { buildCardContextSummary, resolveComplete } from '../../lib/chatInstructions';
import { pickImage, uploadChatImage } from '../../lib/chatImages';
import { fetchMemory } from '../../lib/memory';
import { addTimelineEntry, deleteTimelineEntry } from '../../lib/timeline';
import { createCard } from '../../lib/cards';
import { generateDailySummary } from '../../lib/dailySummary';
import { useCardStore } from '../../lib/store';
import type { ChatMessage, TimelineCategory } from '../../types';

interface Confirmation {
  kind: 'complete' | 'timeline' | 'create_card';
  id: string;
  label: string;
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [dreaming, setDreaming] = useState(false);
  const [model, setModel] = useState<AIModel>('claude-sonnet');
  const [memory, setMemory] = useState('');
  const [confirmations, setConfirmations] = useState<Record<string, Confirmation[]>>({});
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const { cards, actions, cats, lastCompletions, fetchAll, doComplete, doUndo } = useCardStore();

  useEffect(() => {
    loadHistory();
    if (cards.length === 0) fetchAll();
  }, []);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    });
    return () => sub.remove();
  }, []);

  // 每次回到聊天页都重新读一下选中的模型（比如刚从设置页切换回来）
  useFocusEffect(
    useCallback(() => {
      getSelectedModel().then((m) => {
        if (m) setModel(m);
      });
      fetchMemory()
        .then(setMemory)
        .catch(() => {});
    }, [])
  );

  async function loadHistory() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(200);
    if (data) setMessages(data);
  }

  async function handleModelCycle() {
    const next = nextModel(model);
    setModel(next);
    await setSelectedModel(next);
  }

  function handleOpenMenu() {
    const currentLabel = AI_MODELS.find((m) => m.id === model)?.label ?? model;
    Alert.alert('灵', undefined, [
      { text: `切换模型（当前：${currentLabel}）`, onPress: handleModelCycle },
      { text: '🌙 手动做梦（生成今日总结）', onPress: handleManualDream },
      { text: 'AI 记忆', onPress: () => router.push('/memory') },
      { text: '设置', onPress: () => router.push('/settings') },
      { text: '取消', style: 'cancel' },
    ]);
  }

  async function handleManualDream() {
    if (dreaming) return;
    setDreaming(true);
    try {
      const apiKey = await getApiKey(model);
      const summary = await generateDailySummary(new Date(), model, apiKey);
      Alert.alert(
        '🌙 做梦做完了',
        `身体：${summary.body_summary ?? '—'}\n睡眠：${summary.sleep_summary ?? '—'}\n饮食：${summary.food_summary ?? '—'}\n情绪：${summary.emotion_summary ?? '—'}\n烦恼：${summary.worry_summary ?? '—'}\n计划：${summary.plan_summary ?? '—'}\n\nHP ${summary.hp ?? '—'} · MP ${summary.mp ?? '—'}\n\n已存进记录tab的AI总结卡片里`
      );
    } catch (err) {
      Alert.alert('做梦失败', err instanceof Error ? err.message : String(err));
    } finally {
      setDreaming(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const userMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      model: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const { data: savedUser } = await supabase
        .from('messages')
        .insert({ role: 'user', content: text })
        .select()
        .single();

      const apiKey = await getApiKey(model);
      const history = [...messages, savedUser ?? userMessage].slice(-20);
      const modelInfo = AI_MODELS.find((m) => m.id === model);
      if (!modelInfo?.supportsImages && history.some((m) => m.image_url)) {
        Alert.alert('这个模型看不了图片', 'DeepSeek暂不支持图片识别，去⋯菜单切换到Claude/GPT/Gemini才能让AI看到图片');
      }
      const contextSummary = buildContextSummary();
      const reply = await sendChatMessage(history, contextSummary, model, apiKey);

      const { data: savedAssistant } = await supabase
        .from('messages')
        .insert({ role: 'assistant', content: reply.text, model })
        .select()
        .single();

      const assistantMessage: ChatMessage = savedAssistant ?? {
        id: `local-${Date.now()}-a`,
        role: 'assistant',
        content: reply.text,
        model,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== userMessage.id),
        savedUser ?? userMessage,
        assistantMessage,
      ]);

      // 执行 AI 回复里携带的指令，并记下确认行给这条消息展示
      const results: Confirmation[] = [];
      for (const action of reply.actions ?? []) {
        if (action.type === 'complete') {
          const resolved = resolveComplete(action, cards, actions);
          if (!resolved) continue;
          await doComplete(resolved.action, resolved.card);
          results.push({
            kind: 'complete',
            id: resolved.action.id,
            label: `${resolved.card.name} 已更新（${resolved.action.name}）`,
          });
        } else if (action.type === 'timeline' && action.description) {
          const durationMs = (action.duration_min ?? 0) * 60_000;
          const endTime = new Date();
          const startTime = new Date(endTime.getTime() - durationMs);
          const entry = await addTimelineEntry({
            category: (action.category as TimelineCategory) ?? 'other',
            description: action.description,
            start_time: startTime.toISOString(),
            end_time: durationMs > 0 ? endTime.toISOString() : undefined,
            hp_change: action.hp_change,
            mp_change: action.mp_change,
            source: 'chat',
          });
          const delta = [
            action.duration_min ? `${action.duration_min}min` : null,
            action.hp_change ? `HP${action.hp_change > 0 ? '+' : ''}${action.hp_change}` : null,
            action.mp_change ? `MP${action.mp_change > 0 ? '+' : ''}${action.mp_change}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          results.push({
            kind: 'timeline',
            id: entry.id,
            label: `${action.description}${delta ? ` · ${delta}` : ''} 已记录`,
          });
        } else if (action.type === 'create_card' && action.card_name && action.action_name) {
          const newCard = await createCard(
            { name: action.card_name, type: 'habit', tags: action.card_tags ?? [], notes: null },
            [
              {
                name: action.action_name,
                is_primary: true,
                frequency_type: action.frequency_type ?? 'interval',
                interval_days: action.frequency_type === 'interval' ? (action.interval_days ?? 3) : null,
                fixed_days: action.frequency_type === 'fixed_day' ? (action.fixed_days ?? null) : null,
                suggested_interval: action.frequency_type === 'interval' ? (action.interval_days ?? 3) : null,
                max_delay: action.frequency_type === 'interval' ? (action.interval_days ?? 3) * 1.5 : null,
                requires_selection: false,
              },
            ]
          );
          results.push({ kind: 'create_card', id: newCard.id, label: `新卡片「${newCard.name}」已建好` });
        }
      }
      if (results.length) {
        await fetchAll();
        setConfirmations((prev) => ({ ...prev, [assistantMessage.id]: results }));
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `local-error-${Date.now()}`,
          role: 'assistant',
          content: `唔，出错了：${err instanceof Error ? err.message : String(err)}`,
          model: null,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }

  function buildContextSummary(): string {
    return buildCardContextSummary(cards, actions, cats, lastCompletions, memory);
  }

  async function handleSendImage(source: 'camera' | 'library') {
    if (sendingImage) return;
    setSendingImage(true);
    try {
      const localUri = await pickImage(source);
      if (!localUri) return; // 取消了，或者没给权限

      const imageUrl = await uploadChatImage(localUri);

      const { data: saved } = await supabase
        .from('messages')
        .insert({ role: 'user', content: '', image_url: imageUrl })
        .select()
        .single();

      const message: ChatMessage = saved ?? {
        id: `local-${Date.now()}`,
        role: 'user',
        content: '',
        model: null,
        image_url: imageUrl,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, message]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      Alert.alert('发图片失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSendingImage(false);
    }
  }

  function handleUndoConfirmation(messageId: string, confirmation: Confirmation) {
    if (confirmation.kind === 'complete') doUndo(confirmation.id);
    else if (confirmation.kind === 'timeline') deleteTimelineEntry(confirmation.id);
    setConfirmations((prev) => ({
      ...prev,
      [messageId]: (prev[messageId] ?? []).filter((c) => c.id !== confirmation.id),
    }));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.push('/life')} hitSlop={8}>
          <Text style={styles.menuButtonText}>‹</Text>
        </Pressable>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>灵</Text>
        </View>
        <View style={styles.headerNameBlock}>
          <Text style={styles.headerName}>灵</Text>
          <Text style={styles.headerStatus}>在线</Text>
        </View>
        <Pressable style={styles.menuButton} onPress={handleOpenMenu}>
          <Text style={styles.menuButtonText}>⋯</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList
          ref={listRef}
          style={styles.list}
          removeClippedSubviews={false}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item, index }) => {
            const prev = index > 0 ? messages[index - 1] : null;
            const showDateDivider =
              !prev || new Date(prev.created_at).toDateString() !== new Date(item.created_at).toDateString();
            const itemConfirmations = confirmations[item.id];
            return (
              <View>
                <ChatBubble message={item} showDateDivider={showDateDivider} />
                {itemConfirmations?.map((c) => (
                  <View key={c.id} style={styles.confirmRow}>
                    <Text style={styles.confirmText}>✓ {c.label}</Text>
                    {c.kind !== 'create_card' && (
                      <Pressable onPress={() => handleUndoConfirmation(item.id, c)}>
                        <Text style={styles.confirmUndo}>˟ 撤销</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            );
          }}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        <View style={styles.inputBar}>
          <Pressable style={styles.iconButton} onPress={() => handleSendImage('camera')} disabled={sendingImage}>
            {sendingImage ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={styles.icon}>📷</Text>
            )}
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => handleSendImage('library')} disabled={sendingImage}>
            <Text style={styles.icon}>🖼</Text>
          </Pressable>
          <Pressable style={styles.iconButton} onPress={handleOpenMenu}>
            <Text style={styles.icon}>＋</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="跟灵说点什么…"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            cursorColor={colors.purpleDark}
            selectionColor={colors.purple}
          />
          <Pressable onPress={handleSend} style={styles.sendButton} disabled={sending}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendText}>↑</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function nextModel(current: AIModel): AIModel {
  const idx = AI_MODELS.findIndex((m) => m.id === current);
  return AI_MODELS[(idx + 1) % AI_MODELS.length].id;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.avatar,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  headerNameBlock: { flex: 1 },
  headerName: { fontSize: fontSize.cardName, color: colors.textPrimary, fontWeight: '600' },
  headerStatus: { fontSize: fontSize.tiny, color: colors.greenDark },
  backButton: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  menuButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  menuButtonText: { fontSize: 20, color: colors.textSecondary, fontWeight: '700' },
  flexOne: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingVertical: spacing.md },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.lg,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.greenDark + '1A',
    borderRadius: radius.widget,
  },
  confirmText: { fontSize: fontSize.secondary, color: colors.greenDark, flexShrink: 1 },
  confirmUndo: { fontSize: fontSize.secondary, color: colors.textMuted, marginLeft: spacing.sm },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.card,
  },
  iconButton: { padding: 4 },
  icon: { fontSize: 20, includeFontPadding: false },
  input: {
    flex: 1,
    fontSize: fontSize.body,
    lineHeight: fontSize.body + 6,
    color: colors.textPrimary,
    minHeight: 36,
    maxHeight: 100,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    includeFontPadding: false,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: radius.avatar,
    backgroundColor: colors.purpleDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
