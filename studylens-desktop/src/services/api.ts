/**
 * api.ts — Centralised HTTP client for the StudyLens FastAPI backend.
 *
 * All calls go to http://127.0.0.1:7842.
 * No business logic lives here — only transport.
 */

const BASE_URL = 'http://127.0.0.1:7842';

// ── Types (mirror backend schemas) ──────────────────────────────────────────

export interface Stats {
  total_sessions: number;
  sessions_today: number;
  total_time_seconds: number;
  total_study_seconds: number;
  avg_focus_score: number | null;
  notes_count: number;
  todos_completed: number;
  todos_pending: number;
  capsules_count: number;
  this_week: number;
}

export interface AnalysisResult {
  sessions_analyzed: number;
  narrative: string;
  key_insights: string[];
  recommendations: string[];
  top_topics: string[];
}

export interface StudySession {
  id: string;
  session_type: 'video' | 'reading';
  title: string;
  url: string;
  platform: string;
  clock_time_spent_seconds: number;
  completion_percentage: number | null;
  summary: string | null;
  session_start_ts: string;
  session_end_ts: string;
  topics: string | null;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  created_at: string;
}

export interface Capsule {
  id: string;
  session_id: string | null;
  title: string;
  date: string;
  duration_seconds: number;
  platform: string | null;
  url: string | null;
  ai_notes: string | null;
  key_concepts: string | null;
  important_points: string | null;
  revision_summary: string | null;
  tags: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  status: 'new' | 'in_progress' | 'mastered';
  personal_notes: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface DailyHour {
  date: string;
  label: string;
  hours: number;
  minutes: number;
}

export interface WeeklyHour {
  week: string;
  year: number;
  hours: number;
}

export interface SubjectData {
  topic: string;
  minutes: number;
  seconds: number;
}

export interface PersonalRecords {
  best_day?: { date: string; hours: number; label: string };
  longest_session?: { title: string; date: string; minutes: number; label: string };
  best_week?: { week: string; hours: number; label: string };
  total_sessions: number;
}

export interface GrowthData {
  daily_hours: DailyHour[];
  weekly_hours: WeeklyHour[];
  subject_distribution: SubjectData[];
  streak: number;
  personal_records: PersonalRecords;
  insights: string[];
  total_hours: number;
  avg_daily_hours: number;
}

export interface AIPlanTask {
  text: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

export interface AIPlan {
  id?: string;
  plan_date?: string;
  tasks: AIPlanTask[];
  status: 'pending' | 'accepted' | 'rejected' | 'insufficient_data' | 'no_topics';
  message?: string;
}

export interface HealthStatus {
  status: string;
  ollama_running: boolean;
  model_loaded: boolean;
  setup_phase: string;
}

export interface AIStatus {
  phase: string;
  message: string;
  progress: number;
}

export interface TextActionRequest {
  action: string;
  selected_text: string;
  surrounding_context?: string;
  tone?: string;
}

// ── Generic fetch helper ─────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

// ── API ────────────────────────────────────────────────────────────────────────

export const api = {
  health: {
    check: () => request<HealthStatus>('/health'),
    getAIStatus: () => request<AIStatus>('/api/ai/status'),
    retryAI: () => request<{ ok: boolean }>('/api/ai/retry', { method: 'POST' }),
  },

  // ── Dashboard ────────────────────────────────────────────────────────────

  dashboard: {
    getStats: () => request<Stats>('/api/stats'),
    getAnalysis: (timeframe: string) =>
      request<AnalysisResult>(`/api/analysis?timeframe=${timeframe}`),
    getSessions: (timeframe: string) =>
      request<{ sessions: StudySession[]; count: number }>(`/api/sessions?timeframe=${timeframe}`),
  },

  // ── Notes ─────────────────────────────────────────────────────────────────

  notes: {
    list: () => request<Note[]>('/api/notes'),
    get: (id: string) => request<Note>(`/api/notes/${id}`),
    create: (data: { title: string; content: string }) =>
      request<{ status: string; id: string }>('/api/notes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { title: string; content: string }) =>
      request<{ status: string }>(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/notes/${id}`, { method: 'DELETE' }),
  },

  // ── Todos ─────────────────────────────────────────────────────────────────

  todos: {
    list: () => request<Todo[]>('/api/todos'),
    create: (data: { text: string; completed: boolean }) =>
      request<{ status: string; id: string }>('/api/todos', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Todo>) =>
      request<{ status: string }>(`/api/todos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/todos/${id}`, { method: 'DELETE' }),
  },

  // ── Capsules ──────────────────────────────────────────────────────────────

  capsules: {
    list: () => request<Capsule[]>('/api/capsules'),
    create: (data: Partial<Capsule>) =>
      request<{ status: string; id: string }>('/api/capsules', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Capsule>) =>
      request<{ status: string }>(`/api/capsules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/capsules/${id}`, { method: 'DELETE' }),
    regenerate: (id: string) =>
      request<{ status: string; updated: boolean }>(`/api/capsules/${id}/regenerate`, { method: 'POST' }),
  },

  // ── Growth ────────────────────────────────────────────────────────────────

  growth: {
    getData: (days = 30) => request<GrowthData>(`/api/growth?days=${days}`),
  },

  // ── AI Plan ───────────────────────────────────────────────────────────────

  aiPlan: {
    get: () => request<AIPlan>('/api/ai-plan'),
    accept: (planId: string) =>
      request<{ status: string }>('/api/ai-plan/accept', { method: 'POST', body: JSON.stringify({ plan_id: planId }) }),
    reject: (planId: string) =>
      request<{ status: string }>('/api/ai-plan/reject', { method: 'POST', body: JSON.stringify({ plan_id: planId }) }),
  },

  // ── AI Text Actions (SSE streaming) ──────────────────────────────────────

  ai: {
    streamTextAction: async (
      payload: TextActionRequest,
      signal?: AbortSignal
    ): Promise<Response> => {
      const response = await fetch(`${BASE_URL}/api/ai/text-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    },
  },
};
