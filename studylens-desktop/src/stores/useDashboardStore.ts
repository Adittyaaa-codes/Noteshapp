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

// Prompt-contamination signals — these strings should NEVER appear in a user-facing narrative
const PROMPT_CONTAMINATION = [
  'Respond ONLY with', 'JSON schema', 'You are StudyLens',
  '{"narrative"', '"narrative":', '<2-3 engaging',
  'exact schema', 'actionable report',
];

function sanitizeNarrative(narrative: string): string {
  if (!narrative || typeof narrative !== 'string') return '';
  for (const sig of PROMPT_CONTAMINATION) {
    if (narrative.includes(sig)) {
      console.warn('[Dashboard] Prompt contamination detected in narrative — suppressing');
      return 'Unable to generate today\'s summary. Please make sure Ollama is running and try again.';
    }
  }
  return narrative;
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  stats: null,
  analysis: null,
  timeframe: 'this_week',
  loadingStats: false,
  loadingAnalysis: false,
  error: null,

  setTimeframe: (tf) => {
    // Set the timeframe but keep the existing analysis visible until the new one loads.
    // This prevents the flash-to-empty that previously caused the prompt to be visible
    // during the loading window.
    set({ timeframe: tf });
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
      const raw = await api.dashboard.getAnalysis(timeframe) as any;
      // Backend returns session_count & topics; normalize to AnalysisResult shape
      const analysis: AnalysisResult = {
        sessions_analyzed: raw.sessions_analyzed ?? raw.session_count ?? 0,
        narrative: sanitizeNarrative(raw.narrative ?? ''),
        key_insights: raw.key_insights ?? raw.insights ?? [],
        recommendations: raw.recommendations ?? [],
        top_topics: raw.top_topics ?? raw.topics ?? [],
      };
      set({ analysis, loadingAnalysis: false });
    } catch (err: any) {
      set({ error: err.message, loadingAnalysis: false });
    }
  },
}));

