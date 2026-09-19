import { create } from 'zustand';
import type { Action, Card } from '../types';
import { completeAction, fetchActions, fetchCards, fetchLastCompletions, undoCompletion } from './cards';

interface CardStoreState {
  cards: Card[];
  actions: Action[];
  lastCompletions: Record<string, string>; // action_id -> completed_at
  loading: boolean;
  error: string | null;
  lastCompletionIds: Record<string, string>; // action_id -> completion_id（用于撤销）

  fetchAll: () => Promise<void>;
  doComplete: (action: Action, card: Card, options?: { selectedCats?: string[]; notes?: string }) => Promise<void>;
  doUndo: (actionId: string) => Promise<void>;
}

export const useCardStore = create<CardStoreState>((set, get) => ({
  cards: [],
  actions: [],
  lastCompletions: {},
  lastCompletionIds: {},
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const [cards, actions, lastCompletions] = await Promise.all([
        fetchCards(),
        fetchActions(),
        fetchLastCompletions(),
      ]);
      set({ cards, actions, lastCompletions, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  doComplete: async (action, card, options) => {
    const prevCompletions = get().lastCompletions;
    const prevIds = get().lastCompletionIds;

    // 乐观更新
    const now = new Date().toISOString();
    const targets = [action.id, ...(action.linked_action_ids ?? [])];
    set({
      lastCompletions: { ...prevCompletions, ...Object.fromEntries(targets.map((id) => [id, now])) },
    });

    try {
      const inserted = await completeAction(action, card, options);
      set({
        lastCompletionIds: {
          ...prevIds,
          ...Object.fromEntries(inserted.map((c) => [c.action_id, c.id])),
        },
      });
    } catch (err) {
      set({ lastCompletions: prevCompletions, error: err instanceof Error ? err.message : String(err) });
    }
  },

  doUndo: async (actionId) => {
    const completionId = get().lastCompletionIds[actionId];
    if (!completionId) return;

    const prevCompletions = get().lastCompletions;
    const next = { ...prevCompletions };
    delete next[actionId];
    set({ lastCompletions: next });

    try {
      await undoCompletion(completionId);
    } catch (err) {
      set({ lastCompletions: prevCompletions, error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
