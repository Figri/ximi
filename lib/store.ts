import { create } from 'zustand';
import type { Action, Card, Cat } from '../types';
import { completeAction, fetchActions, fetchCards, fetchCats, fetchLastCompletions, undoCompletions } from './cards';
import { db } from './localdb';
import { isCompletedToday } from './decay';

interface UndoEntry {
  /** 这一下插进去的完成记录（主动作 + 联动的动作） */
  ids: string[];
  /** 点之前这些动作各自的「上次完成时间」：撤销时原样放回去，不能当成从没做过 */
  prev: Record<string, string | null>;
}

interface CardStoreState {
  cards: Card[];
  actions: Action[];
  cats: Cat[];
  lastCompletions: Record<string, string>; // action_id -> completed_at
  loading: boolean;
  error: string | null;
  /** action_id -> 最近这一下的撤销信息 */
  undoInfo: Record<string, UndoEntry>;

  fetchAll: () => Promise<void>;
  doComplete: (action: Action, card: Card, options?: { selectedCats?: string[]; notes?: string }) => Promise<void>;
  doUndo: (actionId: string) => Promise<void>;
}

/** 点完还没写进库就点了撤销：撤销要等这一下写完，不然找不到要撤的那条 */
const pendingCompletes = new Map<string, Promise<void>>();

export const useCardStore = create<CardStoreState>((set, get) => ({
  cards: [],
  actions: [],
  cats: [],
  lastCompletions: {},
  undoInfo: {},
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const [cards, actions, cats, lastCompletions] = await Promise.all([
        fetchCards(),
        fetchActions(),
        fetchCats(),
        fetchLastCompletions(),
      ]);
      set({ cards, actions, cats, lastCompletions, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  doComplete: async (action, card, options) => {
    const prevCompletions = get().lastCompletions;

    // 乐观更新
    const now = new Date().toISOString();
    const targets = [action.id, ...(action.linked_action_ids ?? [])];
    const prev = Object.fromEntries(targets.map((id) => [id, prevCompletions[id] ?? null]));
    set({
      lastCompletions: { ...prevCompletions, ...Object.fromEntries(targets.map((id) => [id, now])) },
    });

    const run = (async () => {
      try {
        const inserted = await completeAction(action, card, options);
        set({ undoInfo: { ...get().undoInfo, [action.id]: { ids: inserted.map((c) => c.id), prev } } });
      } catch (err) {
        const next = { ...get().lastCompletions };
        for (const [id, t] of Object.entries(prev)) {
          if (t) next[id] = t;
          else delete next[id];
        }
        set({ lastCompletions: next, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    pendingCompletes.set(action.id, run);
    await run;
    if (pendingCompletes.get(action.id) === run) pendingCompletes.delete(action.id);
  },

  // 撤销：把这一下的记录标成撤销，「上次完成时间」退回点之前的那次（而不是清空——清空了它就成了
  // 「从没做过」，会变红、在列表里跳到最前面）
  doUndo: async (actionId) => {
    await pendingCompletes.get(actionId)?.catch(() => {});
    let entry: UndoEntry | undefined = get().undoInfo[actionId];
    if (!entry) {
      // 重新打开过 App（内存里没有这一下的记录）：撤今天最近的那一条
      const { data } = await db
        .from('completions')
        .select('id, completed_at')
        .eq('action_id', actionId)
        .eq('undone', false)
        .order('completed_at', { ascending: false })
        .limit(1);
      const last = (data ?? [])[0] as { id: string; completed_at: string } | undefined;
      if (!last || !isCompletedToday(new Date(last.completed_at))) return;
      entry = { ids: [last.id], prev: {} };
    }

    const before = get().lastCompletions;
    const next = { ...before };
    for (const [id, t] of Object.entries(entry.prev)) {
      if (t) next[id] = t;
      else delete next[id];
    }
    const undoInfo = { ...get().undoInfo };
    delete undoInfo[actionId];
    set({ lastCompletions: next, undoInfo });

    try {
      await undoCompletions(entry.ids);
      // 以库里为准再算一遍（重新打开过 App 的那种情况，点之前的时间只有库里知道）
      set({ lastCompletions: await fetchLastCompletions() });
    } catch (err) {
      set({ lastCompletions: before, error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
