import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Save } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useNotesStore } from '../../stores/useNotesStore';
import { useCapsulesStore } from '../../stores/useCapsulesStore';
import { useDebounce } from '../../hooks/useDebounce';
import { AIToolbar } from './AIToolbar';
import { AIStreamOverlay } from './AIStreamOverlay';
import { api } from '../../services/api';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { PenTool } from 'lucide-react';
import { ExcalidrawExtension } from '../../components/ExcalidrawExtension';
import 'highlight.js/styles/atom-one-dark.css';

const lowlight = createLowlight(common);

// ── Error Boundary ─────────────────────────────────────────────────────────────
import React from 'react';

class EditorErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err.message };
  }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('[EditorErrorBoundary] Caught error:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-muted">
          <div className="text-red-500 text-sm font-semibold">Editor Error</div>
          <p className="text-xs max-w-xs text-center opacity-70">{this.state.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="text-xs bg-primary text-white px-4 py-2 rounded-lg"
          >
            Reload Editor
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function NoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notes, fetchNotes, updateNote } = useNotesStore();
  const { capsules, fetchCapsules, createCapsule, regenerateCapsule } = useCapsulesStore();

  const note = notes.find((n) => n.id === id);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const initialised = useRef(false);

  // ── AI State ──────────────────────────────────────────────────────────────
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [actionLabel, setActionLabel] = useState<string>('');
  const [streamText, setStreamText] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [overlayRect, setOverlayRect] = useState<DOMRect | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Store the selection range so Accept can replace the correct text even after
  // the editor selection has moved (e.g. the user clicked the Accept button).
  const selectionRangeRef = useRef<{ from: number; to: number } | null>(null);
  // Store whether this action was a "continue" (append) vs replace
  const actionTypeRef = useRef<'replace' | 'continue'>('replace');

  // ── Load note and capsules ───────────────────────────────────────────────────
  useEffect(() => {
    if (notes.length === 0) fetchNotes();
    if (capsules.length === 0) fetchCapsules();
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
        StarterKit.configure({
          codeBlock: false,
        }),
        Placeholder.configure({ placeholder: 'Type / for commands, or start writing...' }),
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
      content: note?.content ?? '',
      onUpdate: handleEditorUpdate,
    },
    [note?.id]
  );

  // Sync editor when note first loads
  useEffect(() => {
    if (editor && note?.content !== undefined && !editor.isDestroyed) {
      // Strip excalidraw nodes on initial load to prevent auto-opening canvas
      const cleanContent = note.content.replace(/<div[^>]*data-type="excalidraw"[\s\S]*?<\/div>/gi, '');
      
      const current = editor.getHTML();
      if (current !== cleanContent) {
        editor.commands.setContent(cleanContent, false);
      }
    }
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI Actions ──────────────────────────────────────────────────────────────

  // Human-readable labels for each action key
  const ACTION_LABELS: Record<string, string> = {
    rewrite:     'Rewrite',
    fix_grammar: 'Grammar Fix',
    change_tone: 'Change Tone',
    emojiify:   'Emojiify',
    shorten:     'Make Shorter',
    expand:      'Expand',
    clarify:     'Improve Clarity',
    summarize:   'Summarize',
    continue:    'Write More',
  };

  // Special tone/instruction overrides for certain actions
  const ACTION_TONE_OVERRIDES: Record<string, string> = {
    emojiify: 'Insert relevant emojis naturally and sparingly throughout the text. 1-2 emojis per sentence maximum. Do not overuse. Keep the original meaning intact.',
    expand:   'Expand and elaborate on the selected text significantly. Add more explanation, examples, and detail. Increase length by 2-3x. Do not summarize. Do not shorten. Preserve the original meaning and style.',
    shorten:  'Shorten the selected text to be concise while preserving all key information.',
    clarify:  'Rewrite to be clearer, more readable, and better structured while keeping the same meaning.',
  };

  const handleAIAction = useCallback(
    async (action: string, tone?: string) => {
      if (!editor || editor.isDestroyed) return;

      // Prevent duplicate requests
      if (isStreaming) return;

      let selectedText = '';
      let surroundingContext = '';

      if (action === 'continue' && editor.state.selection.empty) {
        actionTypeRef.current = 'continue';
        selectionRangeRef.current = null;

        const { $from } = editor.state.selection;
        surroundingContext = $from.doc.textBetween(
          Math.max(0, $from.pos - 1000),
          $from.pos,
          '\n'
        );

        const coords = editor.view.coordsAtPos($from.pos);
        setOverlayRect(
          coords
            ? new DOMRect(coords.left, coords.bottom, 0, 0)
            : new DOMRect(window.innerWidth / 2 - 240, window.innerHeight / 2 - 100, 480, 200)
        );
      } else {
        const { from, to } = editor.state.selection;
        selectedText = editor.state.doc.textBetween(from, to, '\n');
        if (!selectedText.trim()) return;

        // ⭐ Capture the selection range NOW before anything else changes it
        actionTypeRef.current = 'replace';
        selectionRangeRef.current = { from, to };

        surroundingContext = editor.state.doc.textBetween(
          Math.max(0, from - 500),
          Math.min(editor.state.doc.content.size, to + 500),
          '\n'
        );

        const { view, state } = editor;
        const startCoords = view.coordsAtPos(state.selection.from);
        const endCoords   = view.coordsAtPos(state.selection.to);

        if (startCoords && endCoords) {
          setOverlayRect(
            new DOMRect(
              Math.min(startCoords.left, endCoords.left),
              Math.min(startCoords.top, endCoords.top),
              Math.max(1, Math.abs(endCoords.left - startCoords.left)),
              Math.max(1, Math.abs(endCoords.bottom - startCoords.top))
            )
          );
        } else {
          setOverlayRect(
            new DOMRect(window.innerWidth / 2 - 240, window.innerHeight / 2 - 100, 480, 200)
          );
        }
      }

      setIsStreaming(true);
      setActiveAction(action);
      setActionLabel(ACTION_LABELS[action] ?? action);
      setStreamText('');
      setStreamError(null);

      // Use special tone override if available
      const effectiveTone = ACTION_TONE_OVERRIDES[action] ?? tone;

      // Map frontend actions to the strict list supported by the backend
      let backendAction = action;
      if (action === 'expand') backendAction = 'lengthen';

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const response = await api.ai.streamTextAction(
          { action: backendAction, selected_text: selectedText, surrounding_context: surroundingContext, tone: effectiveTone },
          ctrl.signal
        );

        if (!response.body) throw new Error('No response body from AI');

        const reader  = response.body.getReader();
        const decoder = new TextDecoder();
        let currentText = '';
        let hasError = false;

        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                setStreamError(data.error);
                hasError = true;
                break outer;
              }
              if (data.delta) {
                currentText += data.delta;
                setStreamText(currentText);
              }
              if (data.done && !currentText.trim() && !hasError) {
                setStreamError('Received empty response from AI');
              }
            } catch {
              // partial line — skip
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('[AI Action] Error:', err);
        setStreamError(err.message || 'AI generation failed. Please try again.');
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [editor, isStreaming]
  );

  // ── Accept: replace EXACTLY the originally-selected range ──────────────────
  const handleAccept = useCallback(() => {
    if (!editor || editor.isDestroyed || !streamText) return;

    try {
      const chain = editor.chain().focus();

      if (actionTypeRef.current === 'replace' && selectionRangeRef.current) {
        const { from, to } = selectionRangeRef.current;
        const docSize = editor.state.doc.content.size;

        // Validate range is still within doc bounds
        if (from >= 0 && to <= docSize && from <= to) {
          chain
            .deleteRange({ from, to })
            .insertContentAt(from, streamText)
            .run();
        } else {
          // Fallback: insert at current cursor
          chain.insertContent(streamText).run();
        }
      } else {
        // "continue" mode: just insert at cursor
        chain.insertContent(streamText).run();
      }
    } catch (err) {
      console.error('[AI Accept] Error applying content to editor:', err);
    }

    // Clean up overlay state
    handleDiscard();
  }, [editor, streamText]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDiscard = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    selectionRangeRef.current = null;
    setOverlayRect(null);
    setStreamText('');
    setStreamError(null);
    setActiveAction(null);
    setActionLabel('');
    setIsStreaming(false);
  }, []);

  const handleRetry = useCallback(() => {
    const action = activeAction;
    // Restore selection before retry so handleAIAction can capture it again
    if (selectionRangeRef.current && editor && !editor.isDestroyed) {
      const { from, to } = selectionRangeRef.current;
      try {
        editor.commands.setTextSelection({ from, to });
      } catch {
        // ignore if range is invalid
      }
    }
    handleDiscard();
    if (action) setTimeout(() => handleAIAction(action), 80);
  }, [activeAction, handleDiscard, handleAIAction, editor]);

  // ── Guard renders ──────────────────────────────────────────────────────────
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
    <EditorErrorBoundary>
      <div className="flex flex-col h-full bg-background">
        {/* Topbar */}
        <div className="h-14 border-b border-border flex items-center justify-between px-4 sticky top-0 bg-background/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={async () => {
                if (editor && note) {
                  const text = editor.getText().trim();
                  // Only generate if there is substantial content
                  if (text.length > 50) {
                    const capsuleTitle = `Study Session - ${note.title}`;
                    // Prevent duplicates: Check if a capsule for this note already exists
                    const existingCapsule = capsules.find(c => c.title === capsuleTitle);
                    
                    if (!existingCapsule) {
                      const today = new Date().toISOString().split('T')[0];
                      const res = await createCapsule({
                        title: capsuleTitle,
                        date: today,
                        status: 'new',
                        difficulty: 'medium'
                      });
                      
                      if (res?.id) {
                        // Silently fire-and-forget the deep AI generation in the background
                        generateDeepCapsule(text, res.id).catch(console.error);
                      }
                    }
                  }
                }
                navigate('/notes');
              }}
              className="flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
            >
              <ChevronLeft size={16} />
              Back to Notes
            </button>
            <div className="h-4 w-px bg-border" />
            <button
              onClick={() => {
                if (editor && !editor.isDestroyed) {
                  editor.chain().focus().insertContent([
                    { type: 'excalidraw' },
                    { type: 'paragraph' }
                  ]).run();
                }
              }}
              className="flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
            >
              <PenTool size={14} />
              Add Canvas
            </button>
          </div>

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
            <div className="relative prose prose-neutral dark:prose-invert max-w-none
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

            {/* AI Stream Overlay — rendered via portal so it's always on top */}
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
    </EditorErrorBoundary>
  );
}

// ── Background AI Generation ──────────────────────────────────────────────────

async function generateDeepCapsule(noteText: string, capsuleId: string) {
  const ctrl = new AbortController();
  try {
    const prompt = `You are StudyLens, an expert AI teacher creating premium study notes. Analyze the following student study notes and generate a comprehensive, teacher-quality study capsule.

Your output MUST be a JSON object with EXACTLY these keys:
{
  "ai_notes": "Use this EXACT structure in markdown:\\n\\n# [Main Topic Title]\\n\\n## 📚 Chapter / Section\\n[Chapter name and context]\\n\\n## 🎯 Important Concepts\\n[List each concept with ## subheading and 3-5 sentence explanation]\\n\\n## 🔍 Detailed Explanations\\n[For each concept: definition, how it works, why it matters, real-world analogy]\\n\\n## 🌿 Subtopics\\n[Related subtopics with their own explanations]\\n\\n## 💡 Real-World Examples\\n[Concrete examples for each major concept]\\n\\n## 📐 Key Definitions & Formulas\\n[Important definitions in **bold**, formulas in code blocks]\\n\\n## ❓ Interview Questions\\n[5-8 likely interview/exam questions with brief answers]\\n\\n## ⚠️ Common Mistakes Students Make\\n[3-5 common misconceptions or errors]\\n\\n## 📝 Revision Points\\n[10 concise bullet points for quick revision]\\n\\n## 🔑 Keywords\\n[Comma-separated list of important terms]\\n\\n## 📊 Difficulty Level\\n[Easy / Medium / Hard — with explanation why]",
  "key_concepts": "Comma-separated list of 6-10 specific, important concepts from the notes",
  "important_points": "10 specific, detailed bullet points of crucial facts\\nEach point should be a complete, informative sentence\\nSeparated by newlines",
  "revision_summary": "2 punchy sentences capturing the most critical takeaways for last-minute review"
}

Rules:
- Go DEEP. This should help a student who missed class understand the topic fully.
- Explain concepts even if only briefly mentioned in the notes — use your knowledge to fill gaps.
- Do NOT output anything outside the JSON block.
- Do NOT wrap in markdown code blocks.`;


    const response = await api.ai.streamTextAction(
      { action: 'custom', selected_text: noteText, surrounding_context: '', tone: prompt },
      ctrl.signal
    );
    
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    
    while(true) {
      const {done, value} = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, {stream: true});
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
           try {
             const data = JSON.parse(line.slice(6));
             if (data.delta) fullText += data.delta;
           } catch {}
        }
      }
    }
    
    // Extract and parse JSON
    const startIdx = fullText.indexOf('{');
    const endIdx = fullText.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error("Invalid AI response format");
    
    const jsonStr = fullText.substring(startIdx, endIdx + 1);
    const parsed = JSON.parse(jsonStr);
    
    await api.capsules.update(capsuleId, {
       ai_notes: parsed.ai_notes || 'Failed to generate deep notes.',
       key_concepts: parsed.key_concepts || '',
       important_points: parsed.important_points || '',
       revision_summary: parsed.revision_summary || '',
       status: 'new'
    });
    
    // Trigger zustand refresh so the UI updates if the user is on the capsules page
    useCapsulesStore.getState().fetchCapsules();
  } catch (err) {
    console.error("Deep capsule generation failed:", err);
  }
}
