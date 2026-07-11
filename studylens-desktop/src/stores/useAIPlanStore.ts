import { create } from 'zustand';
import { api, type AIPlan } from '../services/api';

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
      const plan = await api.aiPlan.get();
      set({ plan, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  acceptPlan: async () => {
    const { plan } = get();
    if (!plan?.id) return;
    try {
      await api.aiPlan.accept(plan.id);
      set({ plan: { ...plan, status: 'accepted' } });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  rejectPlan: async () => {
    const { plan } = get();
    if (!plan?.id) return;
    try {
      await api.aiPlan.reject(plan.id);
      set({ plan: { ...plan, status: 'rejected' } });
    } catch (err: any) {
      set({ error: err.message });
    }
  },
}));
