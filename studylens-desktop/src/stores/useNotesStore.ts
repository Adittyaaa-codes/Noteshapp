import { create } from 'zustand';
import { api, type Note } from '../services/api';

interface NotesStore {
  notes: Note[];
  loading: boolean;
  error: string | null;

  fetchNotes: () => Promise<void>;
  createNote: () => Promise<Note | null>;
  updateNote: (id: string, data: { title: string; content: string }) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  getNote: (id: string) => Note | undefined;
}

export const useNotesStore = create<NotesStore>((set, get) => ({
  notes: [],
  loading: false,
  error: null,

  fetchNotes: async () => {
    set({ loading: true, error: null });
    try {
      const notes = await api.notes.list();
      set({ notes, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  createNote: async () => {
    try {
      const res = await api.notes.create({ title: 'Untitled Note', content: '' });
      // Fetch the newly created note from the server
      await get().fetchNotes();
      return get().notes.find(n => n.id === res.id) ?? null;
    } catch (err: any) {
      set({ error: err.message });
      return null;
    }
  },

  updateNote: async (id, data) => {
    // Optimistic update
    set((state) => ({
      notes: state.notes.map((n) =>
        n.id === id ? { ...n, ...data, updated_at: new Date().toISOString() } : n
      ),
    }));
    try {
      await api.notes.update(id, data);
    } catch (err: any) {
      set({ error: err.message });
      await get().fetchNotes(); // rollback
    }
  },

  deleteNote: async (id) => {
    const prev = get().notes;
    set((state) => ({ notes: state.notes.filter((n) => n.id !== id) }));
    try {
      await api.notes.delete(id);
    } catch (err: any) {
      set({ notes: prev, error: err.message });
    }
  },

  getNote: (id) => get().notes.find((n) => n.id === id),
}));
