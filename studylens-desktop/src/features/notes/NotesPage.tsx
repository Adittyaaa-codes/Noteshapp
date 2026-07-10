import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, Trash2 } from 'lucide-react';
import { useNotesStore } from '../../stores/useNotesStore';
import { stripHtml } from '../../utils';

export default function NotesPage() {
  const { notes, loading, fetchNotes, createNote, deleteNote } = useNotesStore();
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotes();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    const note = await createNote();
    if (note) navigate(`/notes/${note.id}`);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNote(id);
  };

  const filtered = notes.filter((n) =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    stripHtml(n.content).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileText size={24} className="text-primary" />
            Notes
          </h1>
          <p className="text-sm text-muted mt-0.5">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={loading}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50"
        >
          <Plus size={16} />
          New Note
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-8">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
        <input
          type="text"
          placeholder="Search notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-sidebar border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors placeholder:text-muted/60"
        />
      </div>

      {/* Notes Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border border-border rounded-xl p-5 animate-pulse bg-sidebar">
              <div className="h-4 bg-border rounded w-3/4 mb-3" />
              <div className="h-3 bg-border rounded w-full mb-2" />
              <div className="h-3 bg-border rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((note) => (
            <div
              key={note.id}
              onClick={() => navigate(`/notes/${note.id}`)}
              className="group relative bg-sidebar border border-border hover:border-primary/30 p-5 rounded-xl cursor-pointer transition-all hover:shadow-md"
            >
              <h3 className="font-semibold text-foreground mb-2 truncate pr-7 text-sm">
                {note.title || 'Untitled Note'}
              </h3>
              <p className="text-xs text-muted line-clamp-3 leading-relaxed">
                {stripHtml(note.content) || 'Empty note...'}
              </p>
              <div className="mt-4 text-[10px] uppercase tracking-widest text-muted font-semibold">
                {new Date(note.updated_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>

              <button
                onClick={(e) => handleDelete(note.id, e)}
                className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-1.5 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all"
                aria-label="Delete note"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted gap-3">
          <FileText size={44} className="opacity-20" />
          <h2 className="text-base font-medium">
            {search ? 'No notes match your search' : 'No notes yet'}
          </h2>
          {!search && (
            <p className="text-sm opacity-70">
              Click "New Note" to create your first note.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
