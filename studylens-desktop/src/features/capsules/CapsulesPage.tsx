import React, { useEffect, useState } from 'react';
import {
  Layers, Plus, Search, Pin, Trash2, RefreshCw, ChevronDown, ChevronUp,
  BookOpen, Clock, Tag, Zap, Edit3, FileText, CheckCircle, Circle,
  Brain, X, Save, CalendarDays
} from 'lucide-react';
import { useCapsulesStore } from '../../stores/useCapsulesStore';
import type { Capsule } from '../../services/api';

/** Parse a date string safely, treating bare YYYY-MM-DD strings as local midnight
 *  to avoid the UTC-midnight timezone-shift bug. */
function parseDate(dateStr: string): Date {
  // If it's just a date (no time component), append local midnight explicitly
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T00:00:00`);
  }
  return new Date(dateStr);
}

// ── Lightweight Markdown Renderer ─────────────────────────────────────────────
function MarkdownBlock({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  const renderInline = (line: string): React.ReactNode => {
    // Bold: **text**
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={idx} className="font-mono text-xs bg-background border border-border rounded px-1 py-0.5">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-sm font-bold text-foreground mt-4 mb-1.5 pb-1 border-b border-border/60">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-xs font-bold text-primary mt-3 mb-1 uppercase tracking-wide">
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith('#### ')) {
      elements.push(
        <h4 key={i} className="text-xs font-semibold text-foreground mt-2 mb-0.5">
          {line.slice(5)}
        </h4>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex items-start gap-1.5 ml-2 mb-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
          <span className="text-sm text-foreground leading-relaxed">{renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\.\s/)?.[1] ?? '1';
      elements.push(
        <div key={i} className="flex items-start gap-2 ml-2 mb-0.5">
          <span className="text-xs font-bold text-primary mt-0.5 w-4 flex-shrink-0">{num}.</span>
          <span className="text-sm text-foreground leading-relaxed">{renderInline(line.replace(/^\d+\.\s/, ''))}</span>
        </div>
      );
    } else if (line.startsWith('```')) {
      // Code block
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="bg-background border border-border rounded-lg p-3 text-xs font-mono overflow-x-auto my-2 text-foreground">
          {codeLines.join('\n')}
        </pre>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(
        <p key={i} className="text-sm text-foreground leading-relaxed mb-1">
          {renderInline(line)}
        </p>
      );
    }
    i++;
  }

  return <div className="space-y-0">{elements}</div>;
}


const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
const STATUSES     = ['new', 'in_progress', 'mastered'] as const;

export default function CapsulesPage() {
  const { capsules, loading, fetchCapsules, createCapsule, updateCapsule, deleteCapsule, regenerateCapsule } = useCapsulesStore();
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing]   = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Capsule>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  useEffect(() => { fetchCapsules(); }, []); // eslint-disable-line

  const filtered = capsules.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.tags || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.key_concepts || '').toLowerCase().includes(search.toLowerCase())
  );

  const pinned   = filtered.filter(c => c.is_pinned);
  const unpinned = filtered.filter(c => !c.is_pinned);
  const sorted   = [...pinned, ...unpinned];



  const startEdit = (c: Capsule) => {
    setEditing(c.id);
    setEditData({ ...c });
    setExpanded(c.id);
  };

  const saveEdit = async () => {
    if (!editing) return;
    await updateCapsule(editing, editData);
    setEditing(null);
  };

  const handleRegenerate = async (id: string) => {
    setRegenerating(id);
    await regenerateCapsule(id);
    setRegenerating(null);
  };

  const togglePin = (c: Capsule) => updateCapsule(c.id, { ...c, is_pinned: !c.is_pinned });

  const formatDuration = (secs: number) => {
    if (!secs) return '—';
    const m = Math.floor(secs / 60);
    const h = Math.floor(m / 60);
    return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
  };

  return (
    <div className="p-8 max-w-5xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Layers size={18} className="text-primary" />
            </div>
            Study Capsules
          </h1>
          <p className="text-sm text-muted mt-1">
            {capsules.length} capsule{capsules.length !== 1 ? 's' : ''} · AI-enhanced study notes
          </p>
        </div>
        <button
          onClick={async () => {
            const today = new Date().toISOString().split('T')[0];
            await createCapsule({ title: 'New Study Capsule', date: today, status: 'new', difficulty: 'medium' });
          }}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow-md active:scale-95"
        >
          <Plus size={16} />
          New Capsule
        </button>
      </div>



      {/* Search */}
      <div className="relative mb-6">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          type="text"
          placeholder="Search capsules, tags, concepts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-sidebar border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors placeholder:text-muted/60"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="border border-border rounded-xl p-5 bg-sidebar">
              <div className="skeleton h-4 w-2/3 mb-3" />
              <div className="skeleton h-3 w-1/3" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && capsules.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-muted gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center">
            <Layers size={32} className="opacity-30" />
          </div>
          <h2 className="text-base font-semibold">No capsules yet</h2>
          <p className="text-sm opacity-70 text-center max-w-xs">
            Start studying using your browser or app to auto-generate capsules.
          </p>
        </div>
      )}

      {/* Date Navigation */}
      {!loading && capsules.length > 0 && (
        <div className="mb-8 -mx-4 px-4 overflow-x-auto pb-4 scrollbar-hide">
          <div className="flex items-center gap-2 min-w-max">
            <button
              onClick={() => setSelectedDate(null)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                selectedDate === null
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-sidebar text-muted hover:bg-black/5 dark:hover:bg-white/5 border border-border'
              }`}
            >
              All Capsules
            </button>
            {Array.from(new Set(capsules.map((c) => c.date)))
              .sort((a, b) => parseDate(b).getTime() - parseDate(a).getTime())
              .map((dateStr) => {
                const dateObj = parseDate(dateStr);
                const isSelected = selectedDate === dateStr;
                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-xl transition-all ${
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-md scale-105'
                        : 'bg-sidebar text-muted hover:bg-black/5 dark:hover:bg-white/5 border border-border'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                      {dateObj.toLocaleDateString(undefined, { weekday: 'short' })}
                    </span>
                    <span className="text-sm font-bold">
                      {dateObj.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Capsules list grouped by day */}
      {!loading && sorted.length > 0 && (
        <div className="space-y-8">
          {Object.entries(
            sorted
              .filter(c => selectedDate === null || c.date === selectedDate)
              .reduce((acc, cap) => {
                const d = parseDate(cap.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
                acc[d] = acc[d] || [];
                acc[d].push(cap);
                return acc;
              }, {} as Record<string, Capsule[]>)
          ).map(([dateLabel, dayCapsules]) => (
            <div key={dateLabel}>
              <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-4 border-b border-border/50 pb-2 flex items-center gap-2">
                <CalendarDays size={14} />
                {dateLabel}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dayCapsules.map(capsule => {
            const isExpanded = expanded === capsule.id;
            const isEditing  = editing  === capsule.id;

            return (
              <div
                key={capsule.id}
                className={`capsule-card border border-border rounded-xl bg-sidebar transition-all ${capsule.is_pinned ? 'pinned' : ''}`}
              >
                {/* Card header — always visible */}
                <div
                  className="p-5 cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : capsule.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        {capsule.is_pinned && (
                          <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 uppercase tracking-wide">
                            📌 Pinned
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide diff-${capsule.difficulty}`}>
                          {capsule.difficulty}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide status-${capsule.status}`}>
                          {capsule.status.replace('_', ' ')}
                        </span>
                      </div>

                      <h3 className="font-semibold text-foreground text-sm leading-snug truncate">
                        {capsule.title}
                      </h3>

                      <div className="flex items-center gap-3 mt-2 text-xs text-muted flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {formatDuration(capsule.duration_seconds)}
                        </span>
                        <span className="flex items-center gap-1">
                          <BookOpen size={11} />
                          {parseDate(capsule.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                        {capsule.tags && (
                          <span className="flex items-center gap-1">
                            <Tag size={11} />
                            {capsule.tags.split(',').slice(0,3).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); togglePin(capsule); }}
                        className={`p-1.5 rounded-md transition-colors ${capsule.is_pinned ? 'text-amber-500 bg-amber-500/10' : 'text-muted hover:text-amber-500 hover:bg-amber-500/10'}`}
                        title={capsule.is_pinned ? 'Unpin' : 'Pin'}
                      >
                        <Pin size={13} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); startEdit(capsule); }}
                        className="p-1.5 rounded-md text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Edit"
                      >
                        <Edit3 size={13} />
                      </button>

                      <button
                        onClick={e => { e.stopPropagation(); deleteCapsule(capsule.id); }}
                        className="p-1.5 rounded-md text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                      <div className="ml-1 text-muted">
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-border/60 expand-down">
                    {isEditing ? (
                      /* Edit mode */
                      <div className="pt-4 space-y-3">
                        <div>
                          <label className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 block">Title</label>
                          <input
                            value={editData.title || ''}
                            onChange={e => setEditData(p => ({ ...p, title: e.target.value }))}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 block">AI Notes</label>
                          <textarea
                            value={editData.ai_notes || ''}
                            onChange={e => setEditData(p => ({ ...p, ai_notes: e.target.value }))}
                            rows={5}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 resize-none"
                            placeholder="AI-generated study notes..."
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 block">Key Concepts</label>
                            <input
                              value={editData.key_concepts || ''}
                              onChange={e => setEditData(p => ({ ...p, key_concepts: e.target.value }))}
                              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50"
                              placeholder="comma, separated..."
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 block">Tags</label>
                            <input
                              value={editData.tags || ''}
                              onChange={e => setEditData(p => ({ ...p, tags: e.target.value }))}
                              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 block">Quick Revision Summary</label>
                          <textarea
                            value={editData.revision_summary || ''}
                            onChange={e => setEditData(p => ({ ...p, revision_summary: e.target.value }))}
                            rows={2}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 resize-none"
                            placeholder="One-liner revision summary..."
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 block">Personal Notes</label>
                          <textarea
                            value={editData.personal_notes || ''}
                            onChange={e => setEditData(p => ({ ...p, personal_notes: e.target.value }))}
                            rows={3}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 resize-none"
                            placeholder="Your own handwritten notes..."
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 block">Difficulty</label>
                            <select
                              value={editData.difficulty || 'medium'}
                              onChange={e => setEditData(p => ({ ...p, difficulty: e.target.value as any }))}
                              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50"
                            >
                              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 block">Status</label>
                            <select
                              value={editData.status || 'new'}
                              onChange={e => setEditData(p => ({ ...p, status: e.target.value as any }))}
                              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50"
                            >
                              {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={saveEdit} className="flex items-center gap-1.5 bg-primary text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                            <Save size={13} /> Save
                          </button>
                          <button onClick={() => setEditing(null)} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-muted border border-border hover:bg-sidebar hover:text-foreground transition-colors">
                            <X size={13} /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* View mode */
                      <div className="pt-4 space-y-4">
                        {capsule.revision_summary && (
                          <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
                            <div className="text-[11px] font-bold text-primary uppercase tracking-wide mb-1 flex items-center gap-1.5">
                              <Zap size={11} /> Quick Revision
                            </div>
                            <p className="text-sm text-foreground leading-relaxed">{capsule.revision_summary}</p>
                          </div>
                        )}

                        {capsule.ai_notes && (
                          <div>
                            <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
                              <Brain size={11} /> AI Notes
                            </div>
                            <div className="bg-background/50 rounded-lg p-3 border border-border/60">
                              <MarkdownBlock text={capsule.ai_notes} />
                            </div>
                          </div>
                        )}

                        {capsule.key_concepts && (
                          <div>
                            <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Key Concepts</div>
                            <div className="flex flex-wrap gap-2">
                              {capsule.key_concepts.split(',').filter(Boolean).map((kc, i) => (
                                <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium bg-sidebar border border-border text-foreground">
                                  {kc.trim()}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {capsule.important_points && (
                          <div>
                            <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Important Points</div>
                            <ul className="space-y-1">
                              {capsule.important_points.split('\n').filter(Boolean).map((pt, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                                  {pt.trim()}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {capsule.personal_notes && (
                          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-3">
                            <div className="text-[11px] font-bold text-amber-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                              <FileText size={11} /> Personal Notes
                            </div>
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{capsule.personal_notes}</p>
                          </div>
                        )}

                        {!capsule.ai_notes && !capsule.personal_notes && !capsule.key_concepts && (
                          <div className="text-center py-6 text-muted">
                            <Brain size={28} className="mx-auto mb-2 opacity-20" />
                            <p className="text-sm">No notes yet. Click Edit to add notes or Regenerate for AI notes.</p>
                          </div>
                        )}

                        {/* Status selector + Regenerate in view mode */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted font-medium">Progress:</span>
                            {STATUSES.map(s => (
                              <button
                                key={s}
                                onClick={() => updateCapsule(capsule.id, { ...capsule, status: s })}
                                className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                                  capsule.status === s
                                    ? `status-${s} ring-1 ring-current/30`
                                    : 'text-muted hover:text-foreground bg-sidebar border border-border'
                                }`}
                              >
                                {s === 'mastered' ? <CheckCircle size={10} /> : <Circle size={10} />}
                                {s.replace('_', ' ')}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); handleRegenerate(capsule.id); }}
                            disabled={regenerating === capsule.id}
                            className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-border text-muted hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-50"
                          >
                            <RefreshCw size={10} className={regenerating === capsule.id ? 'animate-spin' : ''} />
                            {regenerating === capsule.id ? 'Regenerating...' : 'Regenerate AI'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
