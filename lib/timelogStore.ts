import { create } from 'zustand';
import type { TimeCategory, TimeTag } from '../types';
import { fetchCategories, fetchTags, seedDefaultsIfNeeded } from './timelog';

interface TimeLogStoreState {
  categories: TimeCategory[];
  tags: TimeTag[];
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
}

export const useTimeLogStore = create<TimeLogStoreState>((set) => ({
  categories: [],
  tags: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      await seedDefaultsIfNeeded();
      const [categories, tags] = await Promise.all([fetchCategories(), fetchTags()]);
      set({ categories, tags, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },
}));
