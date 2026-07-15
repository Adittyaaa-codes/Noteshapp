import React, { useState, useEffect, Component, ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { AppRoutes } from './routes/AppRoutes';
import { useThemeStore } from './stores/useThemeStore';
import { api } from './services/api';
import { AlertTriangle, Wifi, RefreshCw } from 'lucide-react';

// ── Global Error Boundary ─────────────────────────────────────────────────────
class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(err: Error) {
    return { hasError: true, error: err.message };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', err, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: '16px',
            background: 'var(--background)',
            color: 'var(--foreground)',
            fontFamily: 'Inter, sans-serif',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <AlertTriangle size={40} color="#ef4444" />
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
            Something went wrong
          </h2>
          <p style={{ margin: 0, fontSize: '13px', opacity: 0.6, maxWidth: 400 }}>
            {this.state.error || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: '' });
              window.location.hash = '';
            }}
            style={{
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Connection status type ────────────────────────────────────────────────────
type ConnectionStatus = 'checking' | 'connected' | 'error';

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const { isDark, initTheme } = useThemeStore();
  const [connection, setConnection] = useState<ConnectionStatus>('checking');

  // Apply theme on mount
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  // Sync dark class to <html>
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Health check — non-blocking, app renders regardless
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        await api.health.check();
        if (!cancelled) setConnection('connected');
      } catch {
        if (!cancelled) setConnection('error');
      }
    };

    // Small delay so the UI paints first, then we probe backend
    const timer = setTimeout(check, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const retryConnection = async () => {
    setConnection('checking');
    try {
      await api.health.check();
      setConnection('connected');
    } catch {
      setConnection('error');
    }
  };

  return (
    <AppErrorBoundary>
      <BrowserRouter>
        {/* Backend warning banner */}
        {connection === 'error' && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-xs font-medium flex items-center justify-between px-4 py-2 shadow-md">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} />
              <span>Backend not reachable on port 7842 — start the Python server first.</span>
            </div>
            <button
              onClick={retryConnection}
              className="flex items-center gap-1 bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md transition-colors"
            >
              <RefreshCw size={12} />
              Retry
            </button>
          </div>
        )}

        {/* Connecting indicator */}
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
    </AppErrorBoundary>
  );
}
