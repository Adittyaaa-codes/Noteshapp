import { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react';
import { useState } from 'react';
import {
  Sparkles,
  Wand2,
  Type,
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  FileText,
  ChevronDown,
} from 'lucide-react';
import { cn } from '../../utils';

interface AIToolbarProps {
  editor: Editor;
  onAction: (action: string, tone?: string) => void;
  isStreaming: boolean;
  activeAction: string | null;
}

export function AIToolbar({ editor, onAction, isStreaming, activeAction }: AIToolbarProps) {
  const [toneOpen, setToneOpen] = useState(false);

  const trigger = (action: string, tone?: string) => {
    setToneOpen(false);
    onAction(action, tone);
  };

  if (!editor) return null;

  return (
    <BubbleMenu
      editor={editor}
      className="flex items-center shadow-xl bg-background border border-border rounded-lg overflow-visible select-none p-1 gap-0.5 z-50"
    >
      <ToolbarBtn
        icon={<Sparkles size={13} />}
        label="Rewrite"
        onClick={() => trigger('rewrite')}
        loading={isStreaming && activeAction === 'rewrite'}
        disabled={isStreaming}
      />
      <ToolbarBtn
        icon={<Wand2 size={13} />}
        label="Grammar"
        onClick={() => trigger('fix_grammar')}
        loading={isStreaming && activeAction === 'fix_grammar'}
        disabled={isStreaming}
      />

      {/* Tone dropdown */}
      <div className="relative">
        <ToolbarBtn
          icon={<Type size={13} />}
          label="Tone"
          onClick={() => setToneOpen((o) => !o)}
          disabled={isStreaming}
          rightIcon={
            <ChevronDown
              size={11}
              className={cn('transition-transform', toneOpen && 'rotate-180')}
            />
          }
        />
        {toneOpen && (
          <div className="absolute top-full left-0 mt-1 bg-background border border-border rounded-lg shadow-xl p-1 z-50 flex flex-col min-w-[130px]">
            <DropdownItem onClick={() => trigger('change_tone', 'professional')}>
              Professional
            </DropdownItem>
            <DropdownItem onClick={() => trigger('change_tone', 'casual')}>Casual</DropdownItem>
            <DropdownItem onClick={() => trigger('change_tone', 'academic')}>Academic</DropdownItem>
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-border mx-0.5" />

      <ToolbarBtn
        icon={<ArrowDownToLine size={13} />}
        label="Shorter"
        onClick={() => trigger('shorten')}
        loading={isStreaming && activeAction === 'shorten'}
        disabled={isStreaming}
      />
      <ToolbarBtn
        icon={<ArrowUpToLine size={13} />}
        label="Longer"
        onClick={() => trigger('lengthen')}
        loading={isStreaming && activeAction === 'lengthen'}
        disabled={isStreaming}
      />
      <ToolbarBtn
        icon={<Check size={13} />}
        label="Clarity"
        onClick={() => trigger('clarify')}
        loading={isStreaming && activeAction === 'clarify'}
        disabled={isStreaming}
      />
      <ToolbarBtn
        icon={<FileText size={13} />}
        label="Summarize"
        onClick={() => trigger('summarize')}
        loading={isStreaming && activeAction === 'summarize'}
        disabled={isStreaming}
      />
    </BubbleMenu>
  );
}

// ── Internal components ────────────────────────────────────────────────────────

interface ToolbarBtnProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  rightIcon?: React.ReactNode;
}

function ToolbarBtn({ icon, label, onClick, loading, disabled, rightIcon }: ToolbarBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-md transition-colors',
        'text-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5',
        'disabled:opacity-40 disabled:cursor-not-allowed'
      )}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin block" />
      ) : (
        icon
      )}
      <span>{label}</span>
      {rightIcon}
    </button>
  );
}

function DropdownItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left px-2.5 py-1.5 text-xs text-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors"
    >
      {children}
    </button>
  );
}
