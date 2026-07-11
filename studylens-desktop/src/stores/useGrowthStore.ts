import { create } from 'zustand';
import { api, type GrowthData } from '../services/api';

interface GrowthStore {
  data: GrowthData | null;
  loading: boolean;
  error: string | null;
  days: number;
  fetchGrowthData: (days?: number) => Promise<void>;
}

export const useGrowthStore = create<GrowthStore>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  days: 30,

  fetchGrowthData: async (days = get().days) => {
    set({ loading: true, error: null, days });
    try {
      const data = await api.growth.getData(days);
      set({ data, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },
}));
