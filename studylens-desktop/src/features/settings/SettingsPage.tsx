import { useEffect, useState } from 'react';
import { Settings, Moon, Sun, Server, BrainCircuit, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useThemeStore } from '../../stores/useThemeStore';
import { api, type HealthStatus } from '../../services/api';

export default function SettingsPage() {
  const { isDark, toggleTheme } = useThemeStore();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealth();
  }, []);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await api.health.check();
      setHealth(res);
    } catch (err) {
      console.error('Failed to fetch health status:', err);
      setHealth({
        status: 'disconnected',
        ollama_running: false,
        model_loaded: false,
        setup_phase: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings size={17} className="text-primary" />
          </div>
          Settings
        </h1>
        <p className="text-sm text-muted mt-0.5">
          Manage your app preferences and AI backend connection.
        </p>
      </div>

      <div className="space-y-6">
        {/* Appearance Section */}
        <section className="bg-sidebar border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider flex items-center gap-2">
            <Sun size={16} /> Appearance
          </h2>
          
          <div className="flex items-center justify-between py-2">
            <div>
              <h3 className="font-medium text-foreground">Theme Mode</h3>
              <p className="text-xs text-muted mt-1">Switch between light and dark mode</p>
            </div>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border hover:border-primary/50 transition-colors"
            >
              {isDark ? <Moon size={16} className="text-primary" /> : <Sun size={16} className="text-amber-500" />}
              <span className="text-sm font-medium">{isDark ? 'Dark Mode' : 'Light Mode'}</span>
            </button>
          </div>
        </section>

        {/* AI Backend Connection */}
        <section className="bg-sidebar border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Server size={16} /> AI Backend Engine
            </h2>
            <button 
              onClick={fetchHealth} 
              disabled={loading}
              className="text-xs font-medium text-muted hover:text-primary transition-colors flex items-center gap-1 bg-background px-2 py-1 rounded border border-border"
            >
              {loading && <Loader2 size={12} className="animate-spin" />}
              Refresh Status
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center p-4 bg-background border border-border rounded-lg gap-3">
              <div className={`p-2 rounded-md ${health?.status === 'ok' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                <Server size={20} />
              </div>
              <div>
                <h3 className="font-medium text-sm text-foreground">Python Backend</h3>
                <p className="text-xs text-muted mt-0.5 flex items-center gap-1">
                  {loading ? 'Checking...' : health?.status === 'ok' ? <><CheckCircle2 size={12} className="text-emerald-500" /> Connected</> : <><XCircle size={12} className="text-red-500" /> Disconnected</>}
                </p>
              </div>
            </div>

            <div className="flex items-center p-4 bg-background border border-border rounded-lg gap-3">
              <div className={`p-2 rounded-md ${health?.ollama_running ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-500'}`}>
                <BrainCircuit size={20} />
              </div>
              <div>
                <h3 className="font-medium text-sm text-foreground">Ollama Engine</h3>
                <p className="text-xs text-muted mt-0.5 flex items-center gap-1">
                  {loading ? 'Checking...' : health?.ollama_running ? <><CheckCircle2 size={12} className="text-primary" /> Active & Ready</> : <><XCircle size={12} className="text-red-500" /> Offline</>}
                </p>
              </div>
            </div>
          </div>
          
          <div className="mt-4 text-xs text-muted bg-primary/5 p-3 rounded-lg border border-primary/10">
            <strong>Note:</strong> Noteshapp runs 100% locally. The backend must be running via <code className="bg-background px-1 rounded text-foreground">uvicorn main:app</code> and Ollama must be active on port 11434.
          </div>
        </section>
      </div>
    </div>
  );
}
