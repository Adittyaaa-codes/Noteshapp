import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Save, PenTool } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import type { Note } from './Notes';
import { useDebounce } from '../hooks/useDebounce';
import { AIToolbar } from '../components/AIToolbar';
import { AIStreamOverlay } from '../components/AIStreamOverlay';
import { ExcalidrawExtension } from '../components/ExcalidrawExtension';
import 'highlight.js/styles/atom-one-dark.css';

const lowlight = createLowlight(common);

export default function NoteEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const debouncedTitle = useDebounce(title, 1000);
  const debouncedContent = useDebounce(content, 1000);

  // AI State
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [overlayRect, setOverlayRect] = useState<DOMRect | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const handleEditorUpdate = useCallback(({ editor }: any) => {
    setContent(editor.getHTML());
    if (isStreaming && abortController) {
      handleDiscard(); 
    }
  }, [isStreaming, abortController]);

  useEffect(() => {
    fetchNote();
  }, [id]);

  const fetchNote = async () => {
    const res = await fetch('http://localhost:7842/api/notes');
    const allNotes: Note[] = await res.json();
    const found = allNotes.find(n => n.id === id);
    if (found) {
      setNote(found);
      setTitle(found.title);
      setContent(found.content);
    }
  };

  const saveNote = useCallback(async (newTitle: string, newContent: string) => {
    if (!id) return;
    setSaving(true);
    await fetch(`http://localhost:7842/api/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle || 'Untitled Note', content: newContent }),
    });
    setSaving(false);
  }, [id]);

  useEffect(() => {
    if (note && (debouncedTitle !== note.title || debouncedContent !== note.content)) {
      saveNote(debouncedTitle, debouncedContent);
    }
  }, [debouncedTitle, debouncedContent, note, saveNote]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // disable starter kit's code block to use lowlight
      }),
      Placeholder.configure({
        placeholder: 'Type / for commands, or start writing...',
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-lg max-w-full my-4 border border-border shadow-sm',
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'plaintext',
        HTMLAttributes: {
          class: 'rounded-lg bg-zinc-950 p-4 font-mono text-sm shadow-inner my-4 overflow-x-auto',
        },
      }),
      ExcalidrawExtension,
    ],
    content: note?.content || '',
    onUpdate: handleEditorUpdate,
  }, [note?.id, handleEditorUpdate]);

  const handleAIAction = async (action: string, tone?: string) => {
    if (!editor) return;
    
    let selectedText = '';
    let surroundingContext = '';
    
    if (action === 'continue') {
      const { $from } = editor.state.selection;
      surroundingContext = $from.doc.textBetween(Math.max(0, $from.pos - 1000), $from.pos, '\n');
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
        Math.min(editor.state.doc.content.size, editor.state.selection.to + 500),
        '\n'
      );
      
      const { view, state } = editor;
      const { from, to } = state.selection;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      setOverlayRect(new DOMRect(
        Math.min(start.left, end.left),
        Math.min(start.top, end.top),
        Math.abs(end.left - start.left),
        Math.abs(end.bottom - start.top)
      ));
    }

    setIsStreaming(true);
    setActiveAction(action);
    setStreamText('');
    setStreamError(null);
    
    const ctrl = new AbortController();
    setAbortController(ctrl);

    try {
      const res = await fetch('http://localhost:7842/api/ai/text-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, selected_text: selectedText, surrounding_context: surroundingContext, tone }),
        signal: ctrl.signal
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let currentText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
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
              if (data.done) {
                if (!currentText.trim()) setStreamError('Received empty response');
              }
            } catch (e) {}
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setStreamError(err.message || 'Generation failed');
    } finally {
      setIsStreaming(false);
      setAbortController(null);
    }
  };

  const handleAccept = () => {
    if (!editor || !streamText) return;
    editor.chain().focus().insertContent(streamText).run();
    handleDiscard();
  };

  const handleDiscard = () => {
    if (abortController) abortController.abort();
    setOverlayRect(null);
    setStreamText('');
    setStreamError(null);
    setActiveAction(null);
    setIsStreaming(false);
    setAbortController(null);
  };

  const handleRetry = () => {
    const action = activeAction;
    handleDiscard();
    if (action) {
      setTimeout(() => handleAIAction(action), 50);
    }
  };

  const insertExcalidraw = () => {
    if (editor) {
      editor.chain().focus().insertContent('<div data-type="excalidraw"></div>').run();
    }
  };

  if (!note) return null;

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Topbar */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/notes')}
            className="flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
          >
            <ChevronLeft size={16} />
            Back
          </button>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={insertExcalidraw}
            className="flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
          >
            <PenTool size={14} />
            Add Canvas
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-muted">
          {saving ? (
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" /> Saving...</span>
          ) : (
            <span className="flex items-center gap-1.5"><Save size={14} /> Saved</span>
          )}
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-12 px-8">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled Note"
            className="w-full text-5xl font-bold bg-transparent outline-none border-none placeholder:text-muted/30 mb-8 text-foreground"
          />
          
          <div className="prose prose-neutral dark:prose-invert max-w-none 
            prose-p:leading-relaxed prose-headings:font-bold prose-a:text-primary 
            prose-img:rounded-xl prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-border">
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
          
          {editor && (
            <button
              onClick={() => handleAIAction('continue')}
              disabled={isStreaming}
              className="mt-6 flex items-center gap-2 text-sm text-muted hover:text-primary transition-colors py-2 px-4 rounded-md hover:bg-primary/5 disabled:opacity-50"
            >
              <div className="p-1 rounded-sm bg-primary/10 text-primary">
                <span className="w-3 h-3 block border-2 border-current border-t-transparent rounded-full animate-spin [animation-duration:3s]" style={{animationPlayState: isStreaming ? 'running' : 'paused'}} />
              </div>
              Write more with AI...
            </button>
          )}

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
