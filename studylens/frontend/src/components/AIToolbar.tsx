import { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useState } from 'react';
import { Sparkles, Wand2, Type, ArrowDownToLine, ArrowUpToLine, Check, FileText, ChevronDown } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AIToolbarProps {
  editor: Editor;
  onAction: (action: string, tone?: string) => void;
  isStreaming: boolean;
  activeAction: string | null;
}

export function AIToolbar({ editor, onAction, isStreaming, activeAction }: AIToolbarProps) {
  const [toneOpen, setToneOpen] = useState(false);

  const handleAction = (action: string, tone?: string) => {
    setToneOpen(false);
    onAction(action, tone);
  };

  if (!editor) return null;

  return (
    <BubbleMenu 
      editor={editor} 
      className="flex items-center shadow-lg bg-background border border-border rounded-lg overflow-hidden select-none p-1 gap-0.5"
    >
      <ToolbarButton
        icon={<Sparkles size={14} />}
        label="Rewrite"
        onClick={() => handleAction('rewrite')}
        loading={isStreaming && activeAction === 'rewrite'}
        disabled={isStreaming}
      />
      <ToolbarButton
        icon={<Wand2 size={14} />}
        label="Grammar"
        onClick={() => handleAction('fix_grammar')}
        loading={isStreaming && activeAction === 'fix_grammar'}
        disabled={isStreaming}
      />
      
      <div className="relative">
        <ToolbarButton
          icon={<Type size={14} />}
          label="Tone"
          onClick={() => setToneOpen(!toneOpen)}
          disabled={isStreaming}
          rightIcon={<ChevronDown size={12} className={cn("transition-transform", toneOpen && "rotate-180")} />}
        />
        {toneOpen && (
          <div className="absolute top-full left-0 mt-1 bg-background border border-border rounded-md shadow-xl p-1 z-50 flex flex-col min-w-[120px]">
            <DropdownItem onClick={() => handleAction('change_tone', 'professional')}>Professional</DropdownItem>
            <DropdownItem onClick={() => handleAction('change_tone', 'casual')}>Casual</DropdownItem>
            <DropdownItem onClick={() => handleAction('change_tone', 'academic')}>Academic</DropdownItem>
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-border mx-1" />

      <ToolbarButton
        icon={<ArrowDownToLine size={14} />}
        label="Shorter"
        onClick={() => handleAction('shorten')}
        loading={isStreaming && activeAction === 'shorten'}
        disabled={isStreaming}
      />
      <ToolbarButton
        icon={<ArrowUpToLine size={14} />}
        label="Longer"
        onClick={() => handleAction('lengthen')}
        loading={isStreaming && activeAction === 'lengthen'}
        disabled={isStreaming}
      />
      <ToolbarButton
        icon={<Check size={14} />}
        label="Clarity"
        onClick={() => handleAction('clarify')}
        loading={isStreaming && activeAction === 'clarify'}
        disabled={isStreaming}
      />
      <ToolbarButton
        icon={<FileText size={14} />}
        label="Summarize"
        onClick={() => handleAction('summarize')}
        loading={isStreaming && activeAction === 'summarize'}
        disabled={isStreaming}
      />
    </BubbleMenu>
  );
}

function ToolbarButton({ 
  icon, 
  label, 
  onClick, 
  loading, 
  disabled,
  rightIcon
}: { 
  icon: React.ReactNode, 
  label: string, 
  onClick: () => void,
  loading?: boolean,
  disabled?: boolean,
  rightIcon?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-md transition-colors",
        "text-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5",
        "disabled:opacity-50 disabled:cursor-not-allowed"
      )}
    >
      {loading ? (
        <div className="animate-spin w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full" />
      ) : icon}
      <span>{label}</span>
      {rightIcon}
    </button>
  );
}

function DropdownItem({ children, onClick }: { children: React.ReactNode, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left px-2 py-1.5 text-xs text-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-sm transition-colors"
    >
      {children}
    </button>
  );
}
