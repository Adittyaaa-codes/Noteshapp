import { useState, useEffect } from 'react';
import { RefreshCw, Brain, Lightbulb, Target } from 'lucide-react';

interface Stats {
  total_sessions: number;
  sessions_today: number;
  total_time_seconds: number;
  avg_focus_score: number;
}

export default function Dashboard() {
  const [timeframe, setTimeframe] = useState('this_week');
  const [stats, setStats] = useState<Stats | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchAnalysis();
  }, [timeframe]);

  const fetchStats = async () => {
    try {
      const res = await fetch('http://localhost:7842/api/stats');
      setStats(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:7842/api/analysis?timeframe=${timeframe}`);
      setAnalysis(await res.json());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const formatHrs = (sec: number) => {
    if (!sec) return '0h';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-6">Study Dashboard</h1>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard title="Sessions" value={stats?.total_sessions || 0} />
          <StatCard title="Today" value={stats?.sessions_today || 0} />
          <StatCard title="Total Hours" value={formatHrs(stats?.total_time_seconds || 0)} />
          <StatCard title="Focus Score" value={stats?.avg_focus_score ? `${stats.avg_focus_score}/10` : '—'} highlight />
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            {['today', 'this_week', 'this_month', 'all'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  timeframe === tf 
                    ? 'bg-primary/10 text-primary' 
                    : 'text-muted hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {tf.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </button>
            ))}
          </div>
          <button 
            onClick={fetchAnalysis}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-muted hover:text-foreground transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Analysis Content */}
        {loading ? (
          <div className="text-center py-20 text-muted">
            <Brain size={48} className="mx-auto mb-4 animate-pulse opacity-50" />
            <h2 className="text-lg font-medium">Analyzing your study patterns...</h2>
          </div>
        ) : !analysis || analysis.sessions_analyzed === 0 ? (
          <div className="text-center py-20 text-muted">
            <div className="text-4xl mb-4">📭</div>
            <h2 className="text-lg font-medium">No sessions found for this timeframe.</h2>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-sidebar to-background border border-border p-6 rounded-xl">
              <div className="text-xs font-bold text-muted uppercase tracking-wider mb-3">AI Summary</div>
              <div className="text-sm leading-relaxed text-foreground space-y-3">
                {analysis.narrative?.split('\n').map((p: string, i: number) => <p key={i}>{p}</p>)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="border border-border rounded-xl p-5 bg-sidebar/50">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider mb-4">
                  <Lightbulb size={16} /> Insights
                </div>
                <div className="space-y-3">
                  {analysis.key_insights?.map((item: string, i: number) => (
                    <div key={i} className="flex gap-3 text-sm text-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-border rounded-xl p-5 bg-sidebar/50">
                <div className="flex items-center gap-2 text-sm font-semibold text-purple-500 uppercase tracking-wider mb-4">
                  <Target size={16} /> Recommendations
                </div>
                <div className="space-y-3">
                  {analysis.recommendations?.map((item: string, i: number) => (
                    <div key={i} className="flex gap-3 text-sm text-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {analysis.top_topics?.length > 0 && (
              <div>
                <div className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Key Topics</div>
                <div className="flex flex-wrap gap-2">
                  {analysis.top_topics.map((t: string, i: number) => (
                    <div key={i} className={`px-3 py-1 rounded-full text-xs font-medium border ${i===0 ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' : 'bg-sidebar border-border text-foreground'}`}>
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, highlight }: { title: string, value: string | number, highlight?: boolean }) {
  return (
    <div className="border border-border rounded-xl p-4 bg-sidebar">
      <div className={`text-2xl font-bold mb-1 ${highlight ? 'text-purple-500' : 'text-primary'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{title}</div>
    </div>
  );
}
