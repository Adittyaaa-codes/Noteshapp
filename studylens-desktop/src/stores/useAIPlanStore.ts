import { create } from 'zustand';
import { api, type AIPlan, type AIPlanTask } from '../services/api';
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
      // Aggregate context from Todos
      const todos = useTodosStore.getState().todos;
      const pending = todos.filter(t => !t.completed).map(t => t.text).join(', ');
      const completed = todos.filter(t => t.completed).map(t => t.text).join(', ');

      const prompt = `You are an AI study planner. Based on the user's current tasks, suggest 2 to 3 logical next steps for tomorrow.
Completed tasks: ${completed || 'None'}
Pending tasks: ${pending || 'None'}

Format your response EXACTLY as a JSON object:
{
  "tasks": [
    { "text": "Task description", "reason": "Why this is important based on context", "priority": "high" }
  ]
}
Priority must be exactly 'high', 'medium', or 'low'. Do not output any markdown code blocks, just raw JSON.`;

      const ctrl = new AbortController();
      const response = await api.ai.streamTextAction(
        { action: 'custom', selected_text: '', tone: prompt },
        ctrl.signal
      );

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.delta) fullText += data.delta;
            } catch {}
          }
        }
      }

      const startIdx = fullText.indexOf('{');
      const endIdx = fullText.lastIndexOf('}');
      if (startIdx === -1 || endIdx === -1) throw new Error("Invalid AI response");

      const jsonStr = fullText.substring(startIdx, endIdx + 1);
      const parsed = JSON.parse(jsonStr) as { tasks: AIPlanTask[] };

      set({ plan: { tasks: parsed.tasks, status: 'pending' }, loading: false });
    } catch (err: any) {
      console.error('Plan generation failed:', err);
      // Fallback to empty if AI fails to parse
      set({ plan: { tasks: [], status: 'insufficient_data' }, loading: false });
    }
  },

  acceptPlan: async () => {
    const { plan } = get();
    if (!plan || !plan.tasks) return;
    try {
      // Because we bypassed the backend AI Plan system, we manually create the todos
      const todosStore = useTodosStore.getState();
      for (const task of plan.tasks) {
        await todosStore.addTodo(`[AI] ${task.text}`);
      }
      set({ plan: { ...plan, status: 'accepted' } });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  rejectPlan: async () => {
    const { plan } = get();
    if (!plan) return;
    set({ plan: { ...plan, status: 'rejected' } });
  },
}));
