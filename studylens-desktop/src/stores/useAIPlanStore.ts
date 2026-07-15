import { create } from 'zustand';
import { api, type AIPlan } from '../services/api';
import { useTodosStore } from './useTodosStore';

interface AIPlanStore {
  plan: AIPlan | null;
  loading: boolean;
  error: string | null;
  _lastFetchedAt: number | null;   // timestamp of last successful fetch

  fetchPlan: () => Promise<void>;
  acceptPlan: () => Promise<void>;
  rejectPlan: () => Promise<void>;
}

// Only re-fetch the AI plan if it's older than 30 minutes or doesn't exist yet
const PLAN_CACHE_MS = 30 * 60 * 1000;

export const useAIPlanStore = create<AIPlanStore>((set, get) => ({
  plan: null,
  loading: false,
  error: null,
  _lastFetchedAt: null,

  fetchPlan: async () => {
    const { plan, _lastFetchedAt } = get();

    // Return cached plan if it's fresh and already in a non-pending terminal state
    if (plan && _lastFetchedAt) {
      const age = Date.now() - _lastFetchedAt;
      // Skip re-fetch if within cache window AND plan is already settled (not pending)
      if (age < PLAN_CACHE_MS && plan.status !== 'pending') return;
      // If plan is pending, still avoid refetching within 2 minutes (AI generation is slow)
      if (age < 2 * 60 * 1000 && plan.status === 'pending') return;
    }

    set({ loading: true, error: null });
    try {
      const data = await api.aiPlan.get();
      set({ plan: data, loading: false, _lastFetchedAt: Date.now() });
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
