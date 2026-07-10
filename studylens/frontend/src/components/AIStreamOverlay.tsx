import { useEffect, useRef } from 'react';
import { Check, X, RotateCw, AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  onRetry
}: AIStreamOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDiscard();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !isStreaming)) {
        if (!isStreaming && !error && streamText) {
          e.preventDefault();
          onAccept();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStreaming, error, streamText, onAccept, onDiscard]);

  // We want to position it just below the selection
  // In a real app we'd use floating-ui to avoid clipping, but simple absolute positioning is fine here.
  const top = rect.bottom + window.scrollY + 8;
  const left = Math.max(16, rect.left + window.scrollX - 20); // slightly offset

  return (
    <div
      ref={overlayRef}
      className="absolute z-50 w-full max-w-lg bg-background border border-primary/20 shadow-2xl rounded-lg overflow-hidden animate-in fade-in slide-in-from-top-2"
      style={{
        top: `${top}px`,
        left: `${left}px`,
      }}
    >
      <div className="p-4 max-h-[300px] overflow-y-auto font-serif text-[1.05rem] leading-relaxed text-primary">
        {error ? (
          <div className="flex items-start gap-2 text-red-500 text-sm font-sans">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            {streamText || (
              <span className="opacity-50 inline-flex items-center gap-2 font-sans text-sm">
                <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Thinking...
              </span>
            )}
            {isStreaming && streamText && (
              <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse align-middle" />
            )}
          </>
        )}
      </div>

      {/* Action Bar - Only show when done or error */}
      {!isStreaming && (
        <div className="flex items-center justify-between px-2 py-1.5 bg-black/5 dark:bg-white/5 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted px-2">
            {error ? 'Generation Failed' : 'AI Suggestion'}
          </div>
          <div className="flex items-center gap-1">
            <ActionButton 
              icon={<RotateCw size={14} />} 
              label="Retry" 
              onClick={onRetry} 
            />
            <ActionButton 
              icon={<X size={14} />} 
              label="Discard (Esc)" 
              onClick={onDiscard} 
              variant="danger" 
            />
            {!error && streamText && (
              <ActionButton 
                icon={<Check size={14} />} 
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

function ActionButton({ 
  icon, 
  label, 
  onClick, 
  variant = 'default' 
}: { 
  icon: React.ReactNode, 
  label: string, 
  onClick: () => void,
  variant?: 'default' | 'primary' | 'danger'
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
        variant === 'default' && "text-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5",
        variant === 'primary' && "text-primary-foreground bg-primary hover:opacity-90",
        variant === 'danger' && "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
