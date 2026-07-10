import { create } from 'zustand';
import { api, type Todo } from '../services/api';

interface TodosStore {
  todos: Todo[];
  loading: boolean;
  error: string | null;

  fetchTodos: () => Promise<void>;
  addTodo: (text: string) => Promise<void>;
  toggleTodo: (todo: Todo) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
}

export const useTodosStore = create<TodosStore>((set, get) => ({
  todos: [],
  loading: false,
  error: null,

  fetchTodos: async () => {
    set({ loading: true, error: null });
    try {
      const todos = await api.todos.list();
      set({ todos, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  addTodo: async (text) => {
    try {
      const todo = await api.todos.create({ text, completed: false });
      set((state) => ({ todos: [...state.todos, todo] }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  toggleTodo: async (todo) => {
    // Optimistic update
    set((state) => ({
      todos: state.todos.map((t) =>
        t.id === todo.id ? { ...t, completed: !t.completed } : t
      ),
    }));
    try {
      await api.todos.update(todo.id, { ...todo, completed: !todo.completed });
    } catch (err: any) {
      // Revert on failure
      set((state) => ({
        todos: state.todos.map((t) =>
          t.id === todo.id ? { ...t, completed: todo.completed } : t
        ),
        error: err.message,
      }));
    }
  },

  deleteTodo: async (id) => {
    // Optimistic remove
    const prev = get().todos;
    set((state) => ({ todos: state.todos.filter((t) => t.id !== id) }));
    try {
      await api.todos.delete(id);
    } catch (err: any) {
      set({ todos: prev, error: err.message });
    }
  },
}));
