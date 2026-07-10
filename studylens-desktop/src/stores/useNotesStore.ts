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
      const note = await api.notes.create({ title: 'Untitled Note', content: '' });
      set((state) => ({ notes: [note, ...state.notes] }));
      return note;
    } catch (err: any) {
      set({ error: err.message });
      return null;
    }
  },

  updateNote: async (id, data) => {
    try {
      const updated = await api.notes.update(id, data);
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? updated : n)),
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  deleteNote: async (id) => {
    try {
      await api.notes.delete(id);
      set((state) => ({ notes: state.notes.filter((n) => n.id !== id) }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  getNote: (id) => get().notes.find((n) => n.id === id),
}));
