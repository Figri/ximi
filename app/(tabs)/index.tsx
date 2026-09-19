import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { buildCardContextSummary, resolveInstruction } from '../../lib/chatInstructions';
import { useCardStore } from '../../lib/store';
import type { ChatMessage } from '../../types';

interface Confirmation {
  actionId: string;
  cardName: string;
  actionName: string;
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [model, setModel] = useState<AIModel>('claude-sonnet');
  const [confirmations, setConfirmations] = useState<Record<string, Confirmation[]>>({});
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const { cards, actions, cats, lastCompletions, fetchAll, doComplete, doUndo } = useCardStore();

  useEffect(() => {
    loadHistory();
    if (cards.length === 0) fetchAll();
  }, []);

  // 每次回到聊天页都重新读一下选中的模型（比如刚从设置页切换回来）
  useFocusEffect(
    useCallback(() => {
      getSelectedModel().then((m) => {
        if (m) setModel(m);
      });
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

      // 执行 AI 回复里携带的指令（比如"完成了 铲屎 的 铲了"），并记下确认行给这条消息展示
      const results: Confirmation[] = [];
      for (const instruction of reply.instructions ?? []) {
        const resolved = resolveInstruction(instruction, cards, actions);
        if (!resolved) continue;
        await doComplete(resolved.action, resolved.card, { notes: instruction.notes });
        results.push({ actionId: resolved.action.id, cardName: resolved.card.name, actionName: resolved.action.name });
      }
      if (results.length) {
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
    const now = new Date();
    const formatted = now.toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `现在是 ${formatted}。\n\n${buildCardContextSummary(cards, actions, cats, lastCompletions)}`;
  }

  function handleUndoConfirmation(messageId: string, actionId: string) {
    doUndo(actionId);
    setConfirmations((prev) => ({
      ...prev,
      [messageId]: (prev[messageId] ?? []).filter((c) => c.actionId !== actionId),
    }));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>灵</Text>
        </View>
        <View style={styles.headerNameBlock}>
          <Text style={styles.headerName}>灵</Text>
          <Text style={styles.headerStatus}>在线</Text>
        </View>
        <Pressable style={styles.menuButton} onPress={() => router.push('/settings')}>
          <Text style={styles.menuButtonText}>⋯</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        style={styles.list}
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
                <View key={c.actionId} style={styles.confirmRow}>
                  <Text style={styles.confirmText}>
                    ✓ {c.cardName} 已更新（{c.actionName}）
                  </Text>
                  <Pressable onPress={() => handleUndoConfirmation(item.id, c.actionId)}>
                    <Text style={styles.confirmUndo}>˟ 撤销</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputBar}>
          <Pressable style={styles.iconButton} onPress={() => Alert.alert('还没做', '拍照发消息在第二版加，先用文字跟灵说吧')}>
            <Text style={styles.icon}>📷</Text>
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => Alert.alert('还没做', '发图片在第二版加，先用文字跟灵说吧')}>
            <Text style={styles.icon}>🖼</Text>
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
          <Pressable onPress={handleModelCycle} style={styles.modelTag}>
            <Text style={styles.modelTagText}>{AI_MODELS.find((m) => m.id === model)?.label}</Text>
          </Pressable>
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
  menuButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  menuButtonText: { fontSize: 20, color: colors.textSecondary, fontWeight: '700' },
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
  iconButton: { padding: spacing.xs },
  icon: { fontSize: 18 },
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
  modelTag: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radius.widget,
    backgroundColor: colors.blueLight,
  },
  modelTagText: { fontSize: fontSize.tiny, color: colors.blueDark },
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
