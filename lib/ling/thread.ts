import { create } from 'zustand';
import { db } from '../localdb';
import type { AIAction } from '../../types';

// 和灵的一条不断的对话线。存本地 ling_messages 表（跟旧聊天的 messages 表分开，旧聊天不并进来）。

export type LingKind =
  | 'chat' // 普通聊天
  | 'miss_you' // 想你了
  | 'mention' // 顺口一提
  | 'reminder' // 约定提醒
  | 'catch' // 接住你
  | 'play_end' // 娱乐出口到点
  | 'divider' // 翻篇分隔线
  | 'note'; // App 自己插的小提示（比如"记下了：铲屎"）

export interface LingMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  kind: LingKind;
  /** 主动消息为什么发：长按能看到 */
  trigger: string | null;
  /** 她给这条标的判词：套话 / 死板 / 你又重置了 / 不像人 */
  feedback: string | null;
  /** 这条里灵给了小建议：下面显示快捷回复 */
  suggest: boolean;
  actions: AIAction[] | null;
  /** 备用文案（没走模型）：设置页的统计用 */
  fallback: boolean;
  created_at: string;
}

const TABLE = 'ling_messages';

export async function loadAllMessages(): Promise<LingMessage[]> {
  const { data } = await db.from(TABLE).select('*').order('created_at', { ascending: true });
  return (data ?? []) as LingMessage[];
}

export async function appendMessage(m: Partial<LingMessage> & Pick<LingMessage, 'role' | 'content'>): Promise<LingMessage> {
  const row: Omit<LingMessage, 'id'> & { id?: string } = {
    id: m.id,
    role: m.role,
    content: m.content,
    kind: m.kind ?? 'chat',
    trigger: m.trigger ?? null,
    feedback: null,
    suggest: m.suggest ?? false,
    actions: m.actions ?? null,
    fallback: m.fallback ?? false,
    created_at: m.created_at ?? new Date().toISOString(),
  };
  const { data, error } = await db.from(TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  return data as LingMessage;
}

export async function setMessageFeedback(id: string, feedback: string | null): Promise<void> {
  await db.from(TABLE).update({ feedback }).eq('id', id);
}

/** 最近被她标过判词的灵的话，带进提示词里（最多 5 条） */
export function recentFeedback(messages: LingMessage[]): string[] {
  return messages
    .filter((m) => m.role === 'assistant' && m.feedback)
    .slice(-5)
    .map((m) => `你说「${m.content.slice(0, 40)}」，她觉得${m.feedback}`);
}

/** 喂给模型的对话历史：最后一条分隔线之后的内容，最多 30 条，去掉 App 自己的小提示 */
export function historyForModel(messages: LingMessage[], limit = 30): { role: 'user' | 'assistant'; content: string }[] {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].kind === 'divider') {
      start = i + 1;
      break;
    }
  }
  return messages
    .slice(start)
    .filter((m) => m.role !== 'system' && m.kind !== 'note' && m.content.trim())
    .slice(-limit)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
}

interface ThreadState {
  messages: LingMessage[];
  loaded: boolean;
  typing: boolean;
  load: () => Promise<void>;
  add: (m: Partial<LingMessage> & Pick<LingMessage, 'role' | 'content'>) => Promise<LingMessage>;
  setTyping: (v: boolean) => void;
  feedback: (id: string, tag: string | null) => Promise<void>;
}

export const useLingThread = create<ThreadState>((set, get) => ({
  messages: [],
  loaded: false,
  typing: false,

  load: async () => {
    const messages = await loadAllMessages();
    set({ messages, loaded: true });
  },

  add: async (m) => {
    const saved = await appendMessage(m);
    // 补投的主动消息带的是当时发出的时间，可能比最后一条早：按时间插到对的位置，跟重新打开时的顺序一致
    const messages = [...get().messages, saved];
    if (messages.length > 1 && Date.parse(saved.created_at) < Date.parse(messages[messages.length - 2].created_at)) {
      messages.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    }
    set({ messages });
    return saved;
  },

  setTyping: (v) => set({ typing: v }),

  feedback: async (id, tag) => {
    await setMessageFeedback(id, tag);
    set({ messages: get().messages.map((m) => (m.id === id ? { ...m, feedback: tag } : m)) });
  },
}));
