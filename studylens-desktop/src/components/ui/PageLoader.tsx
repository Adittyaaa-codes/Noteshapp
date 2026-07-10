import { Brain } from 'lucide-react';

export function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-muted">
      <Brain size={36} className="animate-pulse opacity-40" />
      <p className="text-sm font-medium">Loading...</p>
    </div>
  );
}
