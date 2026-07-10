import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeStore {
  isDark: boolean;
  toggleTheme: () => void;
  initTheme: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      isDark: false,

      initTheme: () => {
        // Check persisted preference first, then OS preference
        const stored = localStorage.getItem('theme-storage');
        if (!stored) {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          set({ isDark: prefersDark });
        }
        // If stored, the persist middleware already restored it
      },

      toggleTheme: () => set((state) => ({ isDark: !state.isDark })),
    }),
    {
      name: 'theme-storage',
    }
  )
);
