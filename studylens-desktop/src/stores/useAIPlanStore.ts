import { create } from 'zustand';
import { api, type AIPlan } from '../services/api';
import { useTodosStore } from './useTodosStore';

interface AIPlanStore {
  plan: AIPlan | null;
  loading: boolean;
  error: string | null;

  fetchPlan: () => Promise<void>;
  acceptPlan: () => Promise<void>;
  rejectPlan: () => Promise<void>;
}

export const useAIPlanStore = create<AIPlanStore>((set, get) => ({
  plan: null,
  loading: false,
  error: null,

  fetchPlan: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.aiPlan.get();
      set({ plan: data, loading: false });
    } catch (err: any) {
      console.error('Fetch plan failed:', err);
      set({ error: err.message, loading: false });
    }
  },

  acceptPlan: async () => {
    const { plan } = get();
    if (!plan || !plan.id) return;
    try {
      set({ loading: true, error: null });
      await api.aiPlan.accept(plan.id);
      set({ plan: { ...plan, status: 'accepted' }, loading: false });
      // Refresh the main todos store to show the newly added tasks immediately
      await useTodosStore.getState().fetchTodos();
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  rejectPlan: async () => {
    const { plan } = get();
    if (!plan || !plan.id) return;
    try {
      set({ loading: true, error: null });
      await api.aiPlan.reject(plan.id);
      set({ plan: { ...plan, status: 'rejected' }, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },
}));
