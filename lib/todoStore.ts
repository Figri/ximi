import { create } from 'zustand';
import type { TodoCategory } from '../types';
import { loadCategories, saveCategories } from './todoLocal';
import { enqueueSync } from './timelogSync';

interface TodoStoreState {
  categories: TodoCategory[];
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
  upsertCategory: (c: TodoCategory) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
}

export const useTodoStore = create<TodoStoreState>((set, get) => ({
  categories: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const categories = await loadCategories();
      set({ categories, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  upsertCategory: async (cat) => {
    const cur = get().categories;
    const next = cur.some((c) => c.id === cat.id) ? cur.map((c) => (c.id === cat.id ? cat : c)) : [...cur, cat];
    await saveCategories(next);
    set({ categories: next });
    enqueueSync({ table: 'todo_categories', op: 'upsert', row: cat });
  },
  removeCategory: async (id) => {
    const next = get().categories.filter((c) => c.id !== id);
    await saveCategories(next);
    set({ categories: next });
    enqueueSync({ table: 'todo_categories', op: 'delete', row: { id } });
  },
}));
