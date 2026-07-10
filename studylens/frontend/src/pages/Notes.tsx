import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, Trash2 } from 'lucide-react';
import NoteEditor from './NoteEditor';

export interface Note {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}

export default function Notes() {
  return (
    <Routes>
      <Route path="/" element={<NotesList />} />
      <Route path="/:id" element={<NoteEditor />} />
    </Routes>
  );
}

function NotesList() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    const res = await fetch('http://localhost:7842/api/notes');
    setNotes(await res.json());
  };

  const createNote = async () => {
    const res = await fetch('http://localhost:7842/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled Note', content: '' })
    });
    const data = await res.json();
    if (res.ok) {
      navigate(`/notes/${data.id}`);
    }
  };

  const deleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`http://localhost:7842/api/notes/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchNotes();
    }
  };

  const filtered = notes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-12 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <FileText size={32} className="text-primary" />
          Notes
        </h1>
        <button 
          onClick={createNote}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-md font-medium transition-colors shadow-sm"
        >
          <Plus size={18} /> New Note
        </button>
      </div>

      <div className="relative mb-8">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input 
          type="text" 
          placeholder="Search notes..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-sidebar border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(note => (
          <div 
            key={note.id}
            onClick={() => navigate(`/notes/${note.id}`)}
            className="group relative bg-sidebar border border-border hover:border-primary/30 p-5 rounded-xl cursor-pointer transition-all hover:shadow-sm"
          >
            <h3 className="font-semibold text-foreground mb-2 truncate pr-6">{note.title}</h3>
            <p className="text-sm text-muted line-clamp-3">
              {note.content.replace(/<[^>]+>/g, '') || 'Empty note...'}
            </p>
            <div className="mt-4 text-[10px] uppercase tracking-wider text-muted font-semibold">
              {new Date(note.updated_at).toLocaleDateString()}
            </div>
            
            <button 
              onClick={(e) => deleteNote(note.id, e)}
              className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-1.5 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      
      {filtered.length === 0 && (
        <div className="text-center py-20 text-muted">
          <FileText size={48} className="mx-auto mb-4 opacity-20" />
          <h2 className="text-lg font-medium mb-1">No notes found</h2>
          <p className="text-sm">Create a new note to get started.</p>
        </div>
      )}
    </div>
  );
}
