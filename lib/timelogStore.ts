import { create } from 'zustand';
import type { TimeCategory, TimeTag } from '../types';
import { loadCategories, loadTags, saveCategories, saveTags } from './timelogLocal';
import { enqueueSync } from './timelogSync';

interface TimeLogStoreState {
  categories: TimeCategory[];
  tags: TimeTag[];
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
  upsertCategory: (c: TimeCategory) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
  upsertTag: (t: TimeTag) => Promise<void>;
  removeTag: (id: string) => Promise<void>;
}

export const useTimeLogStore = create<TimeLogStoreState>((set, get) => ({
  categories: [],
  tags: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const [categories, tags] = await Promise.all([loadCategories(), loadTags()]);
      set({ categories, tags, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  upsertCategory: async (cat) => {
    const cur = get().categories;
    const next = cur.some((c) => c.id === cat.id) ? cur.map((c) => (c.id === cat.id ? cat : c)) : [...cur, cat];
    await saveCategories(next);
    set({ categories: next });
    enqueueSync({ table: 'time_categories', op: 'upsert', row: cat });
  },
  removeCategory: async (id) => {
    const next = get().categories.filter((c) => c.id !== id);
    await saveCategories(next);
    set({ categories: next });
    enqueueSync({ table: 'time_categories', op: 'delete', row: { id } });
  },
  upsertTag: async (tag) => {
    const cur = get().tags;
    const next = cur.some((t) => t.id === tag.id) ? cur.map((t) => (t.id === tag.id ? tag : t)) : [...cur, tag];
    await saveTags(next);
    set({ tags: next });
    enqueueSync({ table: 'time_tags', op: 'upsert', row: tag });
  },
  removeTag: async (id) => {
    const next = get().tags.filter((t) => t.id !== id);
    await saveTags(next);
    set({ tags: next });
    enqueueSync({ table: 'time_tags', op: 'delete', row: { id } });
  },
}));
