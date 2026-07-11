import { create } from 'zustand';
import { api, type Capsule } from '../services/api';

interface CapsulesStore {
  capsules: Capsule[];
  loading: boolean;
  error: string | null;

  fetchCapsules: () => Promise<void>;
  createCapsule: (data: Partial<Capsule>) => Promise<Capsule | null>;
  updateCapsule: (id: string, data: Partial<Capsule>) => Promise<void>;
  deleteCapsule: (id: string) => Promise<void>;
  regenerateCapsule: (id: string) => Promise<void>;
}

export const useCapsulesStore = create<CapsulesStore>((set, get) => ({
  capsules: [],
  loading: false,
  error: null,

  fetchCapsules: async () => {
    set({ loading: true, error: null });
    try {
      const capsules = await api.capsules.list();
      set({ capsules, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  createCapsule: async (data) => {
    try {
      const res = await api.capsules.create(data);
      await get().fetchCapsules();
      return get().capsules.find(c => c.id === res.id) ?? null;
    } catch (err: any) {
      set({ error: err.message });
      return null;
    }
  },

  updateCapsule: async (id, data) => {
    // Optimistic update
    set(state => ({
      capsules: state.capsules.map(c => c.id === id ? { ...c, ...data } : c),
    }));
    try {
      await api.capsules.update(id, data);
    } catch (err: any) {
      set({ error: err.message });
      await get().fetchCapsules(); // rollback
    }
  },

  deleteCapsule: async (id) => {
    set(state => ({ capsules: state.capsules.filter(c => c.id !== id) }));
    try {
      await api.capsules.delete(id);
    } catch (err: any) {
      set({ error: err.message });
      await get().fetchCapsules();
    }
  },

  regenerateCapsule: async (id) => {
    try {
      await api.capsules.regenerate(id);
      await get().fetchCapsules();
    } catch (err: any) {
      set({ error: err.message });
    }
  },
}));
