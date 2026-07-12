import { useEffect, useRef, useState } from 'react';
import { Check, X, RotateCw, AlertCircle, Sparkles } from 'lucide-react';
import { cn } from '../../utils';

interface AIStreamOverlayProps {
  rect: DOMRect;
  streamText: string;
  isStreaming: boolean;
  error: string | null;
  actionLabel?: string;
  onAccept: () => void;
  onDiscard: () => void;
  onRetry: () => void;
}

const OVERLAY_MARGIN = 12;

export function AIStreamOverlay({
  rect,
  streamText,
  isStreaming,
  error,
  actionLabel,
  onAccept,
  onDiscard,
  onRetry,
}: AIStreamOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, opacity: 0 });

  // Recalculate position whenever rect or content changes
  useEffect(() => {
    const reposition = () => {
      const el = overlayRef.current;
      if (!el) return;

      const overlayWidth = Math.min(el.offsetWidth || 480, 480);
      const overlayHeight = el.offsetHeight || 200;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const GAP = 10;
      const MARGIN = 16;

      // Prefer below selection, fallback to above
      let top = rect.bottom + GAP;
      if (top + overlayHeight > vh - MARGIN) {
        top = rect.top - overlayHeight - GAP;
      }
      // Clamp vertically
      top = Math.max(MARGIN, Math.min(top, vh - overlayHeight - MARGIN));

      // Horizontally: align with selection start, clamp to viewport
      let left = rect.left - 20;
      left = Math.max(MARGIN, Math.min(left, vw - overlayWidth - MARGIN));

      setPosition({ top, left, opacity: 1 });
    };

    // Run after paint so offsetHeight is accurate
    const frame = requestAnimationFrame(reposition);
    return () => cancelAnimationFrame(frame);
  }, [rect, streamText, isStreaming]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDiscard();
      } else if (e.key === 'Enter' && !isStreaming && !error && streamText) {
        e.preventDefault();
        onAccept();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStreaming, error, streamText, onAccept, onDiscard]);

  return (
    <div
      ref={overlayRef}
      className="fixed z-[9999] w-full max-w-lg bg-background border border-primary/20 shadow-2xl rounded-xl overflow-hidden"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        opacity: position.opacity,
        transition: 'opacity 0.15s ease, top 0.1s ease, left 0.1s ease',
        maxWidth: 'min(480px, calc(100vw - 32px))',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border-b border-primary/10">
        <Sparkles size={12} className="text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-primary">
          {actionLabel ?? 'AI Suggestion'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {isStreaming && (
            <span className="text-[10px] text-muted font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
              Generating...
            </span>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="p-4 max-h-64 overflow-y-auto text-sm leading-relaxed text-foreground whitespace-pre-wrap">
        {error ? (
          <div className="flex items-start gap-2 text-red-500 text-sm">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            {streamText ? (
              <span className="whitespace-pre-wrap">{streamText}</span>
            ) : (
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
        <div className="flex items-center justify-between px-3 py-2 bg-sidebar border-t border-border">
          <span className="text-[10px] text-muted italic px-1">
            {error ? 'Generation failed.' : 'Review the suggestion and accept or discard.'}
          </span>
          <div className="flex items-center gap-1">
            <ActionBtn icon={<RotateCw size={12} />} label="Retry" onClick={onRetry} />
            <ActionBtn
              icon={<X size={12} />}
              label="Discard"
              onClick={onDiscard}
              variant="danger"
            />
            {!error && streamText && (
              <ActionBtn
                icon={<Check size={12} />}
                label="Accept ↵"
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
