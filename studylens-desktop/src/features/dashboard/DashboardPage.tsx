import { useEffect } from 'react';
import { RefreshCw, Brain, Lightbulb, Target, Clock, BookOpen, Star } from 'lucide-react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { formatDuration, formatTimeframe } from '../../utils';

const TIMEFRAMES = ['today', 'this_week', 'this_month', 'all'];

export default function DashboardPage() {
  const {
    stats,
    analysis,
    timeframe,
    loadingStats,
    loadingAnalysis,
    setTimeframe,
    fetchStats,
    fetchAnalysis,
  } = useDashboardStore();

  useEffect(() => {
    fetchStats();
    fetchAnalysis();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Study Dashboard
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Track your learning patterns and AI-powered insights
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<BookOpen size={18} className="text-primary" />}
          title="Total Sessions"
          value={loadingStats ? '—' : (stats?.total_sessions ?? 0)}
        />
        <StatCard
          icon={<BookOpen size={18} className="text-emerald-500" />}
          title="Today"
          value={loadingStats ? '—' : (stats?.sessions_today ?? 0)}
          accent="emerald"
        />
        <StatCard
          icon={<Clock size={18} className="text-amber-500" />}
          title="Total Hours"
          value={loadingStats ? '—' : formatDuration(stats?.total_time_seconds ?? 0)}
          accent="amber"
        />
        <StatCard
          icon={<Star size={18} className="text-purple-500" />}
          title="Focus Score"
          value={
            loadingStats
              ? '—'
              : stats?.avg_focus_score
              ? `${stats.avg_focus_score}/10`
              : '—'
          }
          accent="purple"
        />
      </div>

      {/* Timeframe Selector + Refresh */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1 bg-sidebar rounded-lg p-1 border border-border">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                timeframe === tf
                  ? 'bg-background text-foreground shadow-sm border border-border'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {formatTimeframe(tf)}
            </button>
          ))}
        </div>

        <button
          onClick={fetchAnalysis}
          disabled={loadingAnalysis}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground border border-border rounded-lg hover:bg-sidebar transition-all disabled:opacity-50"
        >
          <RefreshCw size={13} className={loadingAnalysis ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Analysis Section */}
      {loadingAnalysis ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted gap-4">
          <Brain size={44} className="animate-pulse opacity-30" />
          <p className="text-sm font-medium">Analyzing your study patterns...</p>
        </div>
      ) : !analysis || analysis.sessions_analyzed === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted gap-3">
          <div className="text-4xl">📭</div>
          <h2 className="text-base font-medium">No sessions found</h2>
          <p className="text-sm opacity-70">
            Start studying and your activity will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* AI Narrative */}
          {analysis.narrative && (
            <div className="bg-gradient-to-br from-sidebar to-background border border-border p-6 rounded-xl">
              <div className="flex items-center gap-2 text-xs font-bold text-muted uppercase tracking-widest mb-4">
                <Brain size={14} className="text-primary" />
                AI Summary
              </div>
              <div className="text-sm leading-relaxed text-foreground space-y-2">
                {analysis.narrative.split('\n').map((p, i) => p.trim() && (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>
          )}

          {/* Insights + Recommendations Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {analysis.key_insights && analysis.key_insights.length > 0 && (
              <div className="border border-border rounded-xl p-5 bg-sidebar/50">
                <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-widest mb-4">
                  <Lightbulb size={13} />
                  Insights
                </div>
                <ul className="space-y-3">
                  {analysis.key_insights.map((item, i) => (
                    <li key={i} className="flex gap-3 text-sm text-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.recommendations && analysis.recommendations.length > 0 && (
              <div className="border border-border rounded-xl p-5 bg-sidebar/50">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-500 uppercase tracking-widest mb-4">
                  <Target size={13} />
                  Recommendations
                </div>
                <ul className="space-y-3">
                  {analysis.recommendations.map((item, i) => (
                    <li key={i} className="flex gap-3 text-sm text-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Topics */}
          {analysis.top_topics && analysis.top_topics.length > 0 && (
            <div>
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-3">
                Key Topics
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.top_topics.map((t, i) => (
                  <span
                    key={i}
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${
                      i === 0
                        ? 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                        : 'bg-sidebar border-border text-foreground'
                    }`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── StatCard sub-component ────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  accent?: 'blue' | 'emerald' | 'amber' | 'purple';
}

function StatCard({ icon, title, value }: StatCardProps) {
  return (
    <div className="border border-border rounded-xl p-4 bg-sidebar hover:border-primary/20 transition-colors group">
      <div className="flex items-center gap-2 mb-2">
        {icon}
      </div>
      <div className="text-2xl font-bold text-foreground mb-1">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted font-semibold">
        {title}
      </div>
    </div>
  );
}
