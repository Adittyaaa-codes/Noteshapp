import { create } from 'zustand';
import { api, type Stats, type AnalysisResult } from '../services/api';

interface DashboardStore {
  stats: Stats | null;
  analysis: AnalysisResult | null;
  timeframe: string;
  loadingStats: boolean;
  loadingAnalysis: boolean;
  error: string | null;

  setTimeframe: (tf: string) => void;
  fetchStats: () => Promise<void>;
  fetchAnalysis: () => Promise<void>;
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  stats: null,
  analysis: null,
  timeframe: 'this_week',
  loadingStats: false,
  loadingAnalysis: false,
  error: null,

  setTimeframe: (tf) => {
    set({ timeframe: tf, analysis: null });
    get().fetchAnalysis();
  },

  fetchStats: async () => {
    set({ loadingStats: true, error: null });
    try {
      const stats = await api.dashboard.getStats();
      set({ stats, loadingStats: false });
    } catch (err: any) {
      set({ error: err.message, loadingStats: false });
    }
  },

  fetchAnalysis: async () => {
    const { timeframe } = get();
    set({ loadingAnalysis: true, error: null });
    try {
      const analysis = await api.dashboard.getAnalysis(timeframe);
      set({ analysis, loadingAnalysis: false });
    } catch (err: any) {
      set({ error: err.message, loadingAnalysis: false });
    }
  },
}));
