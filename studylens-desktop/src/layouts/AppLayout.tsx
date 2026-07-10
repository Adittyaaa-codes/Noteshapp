import { ReactNode } from 'react';
import { Sidebar } from '../components/Sidebar';
import { cn } from '../utils';

interface AppLayoutProps {
  children: ReactNode;
  connected?: boolean;
}

export function AppLayout({ children, connected = true }: AppLayoutProps) {
  return (
    <div className={cn("flex w-screen overflow-hidden bg-background text-foreground", connected ? "h-screen" : "h-screen pt-8")}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
