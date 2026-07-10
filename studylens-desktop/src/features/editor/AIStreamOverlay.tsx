import { useEffect, useRef } from 'react';
import { Check, X, RotateCw, AlertCircle } from 'lucide-react';
import { cn } from '../../utils';

interface AIStreamOverlayProps {
  rect: DOMRect;
  streamText: string;
  isStreaming: boolean;
  error: string | null;
  onAccept: () => void;
  onDiscard: () => void;
  onRetry: () => void;
}

export function AIStreamOverlay({
  rect,
  streamText,
  isStreaming,
  error,
  onAccept,
  onDiscard,
  onRetry,
}: AIStreamOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDiscard();
      } else if ((e.metaKey || e.ctrlKey || !isStreaming) && e.key === 'Enter') {
        if (!isStreaming && !error && streamText) {
          e.preventDefault();
          onAccept();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStreaming, error, streamText, onAccept, onDiscard]);

  const top  = rect.bottom + window.scrollY + 8;
  const left = Math.max(16, rect.left + window.scrollX - 20);

  return (
    <div
      ref={overlayRef}
      className="absolute z-50 w-full max-w-lg bg-background border border-primary/20 shadow-2xl rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2"
      style={{ top: `${top}px`, left: `${left}px` }}
    >
      {/* Content area */}
      <div className="p-4 max-h-72 overflow-y-auto text-sm leading-relaxed text-primary font-[system-ui]">
        {error ? (
          <div className="flex items-start gap-2 text-red-500 text-sm">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            {streamText || (
              <span className="opacity-50 inline-flex items-center gap-2 text-sm text-muted">
                <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin block" />
                Thinking...
              </span>
            )}
            {isStreaming && streamText && (
              <span className="inline-block w-0.5 h-4 ml-0.5 bg-primary animate-pulse align-middle" />
            )}
          </>
        )}
      </div>

      {/* Action bar — only when streaming is done */}
      {!isStreaming && (
        <div className="flex items-center justify-between px-2 py-1.5 bg-sidebar border-t border-border">
          <span className="text-[10px] uppercase tracking-widest font-semibold text-muted px-2">
            {error ? 'Generation Failed' : 'AI Suggestion'}
          </span>
          <div className="flex items-center gap-1">
            <ActionBtn icon={<RotateCw size={13} />} label="Retry" onClick={onRetry} />
            <ActionBtn
              icon={<X size={13} />}
              label="Discard (Esc)"
              onClick={onDiscard}
              variant="danger"
            />
            {!error && streamText && (
              <ActionBtn
                icon={<Check size={13} />}
                label="Accept (Enter)"
                onClick={onAccept}
                variant="primary"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Internal ──────────────────────────────────────────────────────────────────

function ActionBtn({
  icon,
  label,
  onClick,
  variant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
        variant === 'default' && 'text-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5',
        variant === 'primary' && 'bg-primary text-white hover:opacity-90',
        variant === 'danger'  && 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
