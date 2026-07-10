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
  avg_focus_score: number;
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

// ── Health ────────────────────────────────────────────────────────────────────

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
      request<StudySession[]>(`/api/sessions?timeframe=${timeframe}`),
  },

  // ── Notes ─────────────────────────────────────────────────────────────────

  notes: {
    list: () => request<Note[]>('/api/notes'),
    get: (id: string) => request<Note>(`/api/notes/${id}`),
    create: (data: { title: string; content: string }) =>
      request<Note>('/api/notes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { title: string; content: string }) =>
      request<Note>(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/notes/${id}`, { method: 'DELETE' }),
  },

  // ── Todos ─────────────────────────────────────────────────────────────────

  todos: {
    list: () => request<Todo[]>('/api/todos'),
    create: (data: { text: string; completed: boolean }) =>
      request<Todo>('/api/todos', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Todo>) =>
      request<Todo>(`/api/todos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/todos/${id}`, { method: 'DELETE' }),
  },

  // ── AI Text Actions (SSE streaming) ──────────────────────────────────────

  /**
   * Returns the raw Response so the caller can read the SSE stream body.
   * The backend sends `data: { delta?, error?, done? }` lines.
   */
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
