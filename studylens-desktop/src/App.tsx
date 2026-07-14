import { useState, useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { AppRoutes } from './routes/AppRoutes';
import { useThemeStore } from './stores/useThemeStore';
import { api } from './services/api';
import { AlertTriangle, Wifi, RefreshCw } from 'lucide-react';

type ConnectionStatus = 'checking' | 'connected' | 'error';

export default function App() {
  const { isDark, initTheme } = useThemeStore();
  const [connection, setConnection] = useState<ConnectionStatus>('checking');

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Check backend health on mount
  useEffect(() => {
    const check = async () => {
      try {
        await api.health.check();
        setConnection('connected');
      } catch {
        setConnection('error');
      }
    };
    check();
  }, []);

  return (
    <BrowserRouter>
      {connection === 'error' && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-xs font-medium flex items-center justify-between px-4 py-2 shadow-md">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} />
            <span>Backend not reachable on port 7842 — start the Noteshapp Python server first.</span>
          </div>
          <button
            onClick={async () => {
              setConnection('checking');
              try {
                await api.health.check();
                setConnection('connected');
              } catch {
                setConnection('error');
              }
            }}
            className="flex items-center gap-1 bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md transition-colors"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}
      {connection === 'checking' && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-white text-xs font-medium flex items-center gap-2 px-4 py-2 shadow-md">
          <Wifi size={14} className="animate-pulse" />
          <span>Connecting to Noteshapp backend...</span>
        </div>
      )}
      <AppLayout connected={connection !== 'error'}>
        <AppRoutes />
      </AppLayout>
    </BrowserRouter>
  );
}
