import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Save } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useNotesStore } from '../../stores/useNotesStore';
import { useDebounce } from '../../hooks/useDebounce';
import { AIToolbar } from './AIToolbar';
import { AIStreamOverlay } from './AIStreamOverlay';
import { api } from '../../services/api';

export default function NoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notes, fetchNotes, updateNote } = useNotesStore();

  const note = notes.find((n) => n.id === id);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const initialised = useRef(false);

  // ── AI State ────────────────────────────────────────────────────────────────
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [overlayRect, setOverlayRect] = useState<DOMRect | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Load note ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (notes.length === 0) {
      fetchNotes();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Populate local state once note is found (only on first load)
  useEffect(() => {
    if (note && !initialised.current) {
      setTitle(note.title);
      setContent(note.content);
      initialised.current = true;
    }
  }, [note]);

  // ── Auto-save ────────────────────────────────────────────────────────────────
  const debouncedTitle   = useDebounce(title, 800);
  const debouncedContent = useDebounce(content, 800);

  useEffect(() => {
    if (!id || !initialised.current) return;
    if (!note) return;
    if (debouncedTitle === note.title && debouncedContent === note.content) return;

    let cancelled = false;
    setSaving(true);
    updateNote(id, { title: debouncedTitle || 'Untitled Note', content: debouncedContent })
      .finally(() => {
        if (!cancelled) setSaving(false);
      });

    return () => { cancelled = true; };
  }, [debouncedTitle, debouncedContent]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TipTap Editor ─────────────────────────────────────────────────────────
  const handleEditorUpdate = useCallback(
    ({ editor }: { editor: any }) => {
      setContent(editor.getHTML());
    },
    []
  );

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: 'Start writing...' }),
      ],
      content: note?.content ?? '',
      onUpdate: handleEditorUpdate,
    },
    [note?.id]
  );

  // Sync editor when note first loads
  useEffect(() => {
    if (editor && note?.content !== undefined && !editor.isDestroyed) {
      const current = editor.getHTML();
      if (current !== note.content) {
        editor.commands.setContent(note.content, false);
      }
    }
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI Actions ───────────────────────────────────────────────────────────────
  const handleAIAction = useCallback(
    async (action: string, tone?: string) => {
      if (!editor) return;

      let selectedText = '';
      let surroundingContext = '';

      if (action === 'continue') {
        const { $from } = editor.state.selection;
        surroundingContext = $from.doc.textBetween(
          Math.max(0, $from.pos - 1000),
          $from.pos,
          '\n'
        );
        const coords = editor.view.coordsAtPos($from.pos);
        setOverlayRect(new DOMRect(coords.left, coords.bottom, 0, 0));
      } else {
        selectedText = editor.state.doc.textBetween(
          editor.state.selection.from,
          editor.state.selection.to,
          '\n'
        );
        if (!selectedText) return;

        surroundingContext = editor.state.doc.textBetween(
          Math.max(0, editor.state.selection.from - 500),
          Math.min(
            editor.state.doc.content.size,
            editor.state.selection.to + 500
          ),
          '\n'
        );

        const { view, state } = editor;
        const { from, to } = state.selection;
        const start = view.coordsAtPos(from);
        const end   = view.coordsAtPos(to);
        setOverlayRect(
          new DOMRect(
            Math.min(start.left, end.left),
            Math.min(start.top, end.top),
            Math.abs(end.left - start.left),
            Math.abs(end.bottom - start.top)
          )
        );
      }

      setIsStreaming(true);
      setActiveAction(action);
      setStreamText('');
      setStreamError(null);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const response = await api.ai.streamTextAction(
          { action, selected_text: selectedText, surrounding_context: surroundingContext, tone },
          ctrl.signal
        );

        if (!response.body) throw new Error('No response body');

        const reader  = response.body.getReader();
        const decoder = new TextDecoder();
        let currentText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                setStreamError(data.error);
                break;
              }
              if (data.delta) {
                currentText += data.delta;
                setStreamText(currentText);
              }
              if (data.done && !currentText.trim()) {
                setStreamError('Received empty response');
              }
            } catch {
              // partial line, skip
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setStreamError(err.message || 'Generation failed');
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [editor]
  );

  const handleAccept = useCallback(() => {
    if (!editor || !streamText) return;
    editor.chain().focus().insertContent(streamText).run();
    handleDiscard();
  }, [editor, streamText]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDiscard = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setOverlayRect(null);
    setStreamText('');
    setStreamError(null);
    setActiveAction(null);
    setIsStreaming(false);
  }, []);

  const handleRetry = useCallback(() => {
    const action = activeAction;
    handleDiscard();
    if (action) setTimeout(() => handleAIAction(action), 50);
  }, [activeAction, handleDiscard, handleAIAction]);

  // Loading state
  if (notes.length > 0 && !note) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        Note not found.
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm animate-pulse">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Topbar */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4 sticky top-0 bg-background/90 backdrop-blur-md z-10">
        <button
          onClick={() => navigate('/notes')}
          className="flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
        >
          <ChevronLeft size={16} />
          Back to Notes
        </button>

        <div className="flex items-center gap-2 text-xs font-medium text-muted">
          {saving ? (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Saving...
            </span>
          ) : (
            <span className="flex items-center gap-1.5 opacity-60">
              <Save size={13} />
              Saved
            </span>
          )}
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-12 px-8">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled Note"
            className="w-full text-5xl font-bold bg-transparent outline-none border-none placeholder:text-muted/25 mb-8 text-foreground tracking-tight"
          />

          {/* TipTap + AI toolbar */}
          <div className="relative">
            {editor && (
              <AIToolbar
                editor={editor}
                onAction={handleAIAction}
                isStreaming={isStreaming}
                activeAction={activeAction}
              />
            )}
            <EditorContent editor={editor} />
          </div>

          {/* Continue Writing button */}
          {editor && (
            <button
              onClick={() => handleAIAction('continue')}
              disabled={isStreaming}
              className="mt-8 flex items-center gap-2 text-sm text-muted hover:text-primary transition-colors py-2 px-3 rounded-lg hover:bg-primary/5 disabled:opacity-40"
            >
              <div className="p-1 rounded-sm bg-primary/10 text-primary">
                <span
                  className="w-3 h-3 block border-2 border-current border-t-transparent rounded-full animate-spin"
                  style={{ animationPlayState: isStreaming ? 'running' : 'paused' }}
                />
              </div>
              Write more with AI...
            </button>
          )}

          {/* AI Stream Overlay */}
          {overlayRect && (
            <AIStreamOverlay
              rect={overlayRect}
              streamText={streamText}
              isStreaming={isStreaming}
              error={streamError}
              onAccept={handleAccept}
              onDiscard={handleDiscard}
              onRetry={handleRetry}
            />
          )}
        </div>
      </div>
    </div>
  );
}
