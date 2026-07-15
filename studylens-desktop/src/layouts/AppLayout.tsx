import { ReactNode } from 'react';
import { Sidebar } from '../components/Sidebar';

interface AppLayoutProps {
  children: ReactNode;
  connected?: boolean;
}

export function AppLayout({ children, connected = true }: AppLayoutProps) {
  return (
    <div
      className="flex w-screen h-screen overflow-hidden bg-background text-foreground"
      style={{ paddingTop: connected ? 0 : '36px' }}
    >
      <Sidebar />
      <main className="flex-1 overflow-y-auto min-w-0 h-full">
        {children}
      </main>
    </div>
  );
}
