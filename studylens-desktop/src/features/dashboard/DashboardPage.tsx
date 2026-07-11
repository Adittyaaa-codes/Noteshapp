import { useEffect, useState } from 'react';
import {
  RefreshCw, Brain, Lightbulb, Target, Clock, BookOpen,
  Star, BarChart2, FileText, CheckCircle2, Layers, TrendingUp
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useGrowthStore } from '../../stores/useGrowthStore';
import { formatDuration, formatTimeframe } from '../../utils/index';

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

  const { data: growthData, fetchGrowthData } = useGrowthStore();

  useEffect(() => {
    fetchStats();
    fetchAnalysis();
    fetchGrowthData(7);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const last7 = growthData?.daily_hours ?? [];

  const BarTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-background border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
        <div className="text-muted mb-0.5">{label}</div>
        <div className="font-bold text-foreground">{payload[0]?.value?.toFixed(1)}h</div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
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
          <div className="text-xs text-muted font-medium">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard
            icon={<BookOpen size={16} className="text-primary" />}
            title="Total Sessions"
            value={loadingStats ? '—' : (stats?.total_sessions ?? 0)}
            sub="all time"
            color="primary"
          />
          <StatCard
            icon={<Clock size={16} className="text-emerald-500" />}
            title="Study Time"
            value={loadingStats ? '—' : formatDuration(stats?.total_study_seconds ?? 0)}
            sub="total"
            color="emerald"
          />
          <StatCard
            icon={<Star size={16} className="text-amber-500" />}
            title="Focus Score"
            value={loadingStats ? '—' : stats?.avg_focus_score ? `${stats.avg_focus_score}/10` : '—'}
            sub="avg rating"
            color="amber"
          />
          <StatCard
            icon={<Layers size={16} className="text-purple-500" />}
            title="Capsules"
            value={loadingStats ? '—' : (stats?.capsules_count ?? 0)}
            sub="study notes"
            color="purple"
          />
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="border border-border rounded-xl p-4 bg-sidebar">
            <div className="flex items-center gap-2 mb-1">
              <FileText size={13} className="text-muted" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Notes</span>
            </div>
            <div className="text-xl font-bold text-foreground">{loadingStats ? '—' : (stats?.notes_count ?? 0)}</div>
          </div>
          <div className="border border-border rounded-xl p-4 bg-sidebar">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={13} className="text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Done</span>
            </div>
            <div className="text-xl font-bold text-foreground">{loadingStats ? '—' : (stats?.todos_completed ?? 0)}</div>
          </div>
          <div className="border border-border rounded-xl p-4 bg-sidebar">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={13} className="text-muted" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">This Week</span>
            </div>
            <div className="text-xl font-bold text-foreground">{loadingStats ? '—' : (stats?.this_week ?? 0)} <span className="text-xs text-muted font-normal">sessions</span></div>
          </div>
        </div>

        {/* Last 7 Days Chart */}
        {last7.length > 0 && (
          <div className="border border-border rounded-xl p-5 bg-sidebar mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-foreground">Study Hours — Last 7 Days</div>
                <div className="text-xs text-muted mt-0.5">Daily breakdown</div>
              </div>
              <BarChart2 size={15} className="text-muted" />
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={last7.slice(-7)} margin={{ top: 5, right: 5, bottom: 5, left: -30 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <Tooltip content={<BarTooltip />} />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                  {last7.slice(-7).map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.hours === Math.max(...last7.map(d => d.hours))
                          ? '#2383e2'
                          : 'var(--border)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

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
          <div className="flex flex-col items-center justify-center py-16 text-muted gap-4">
            <Brain size={40} className="animate-pulse opacity-30" />
            <p className="text-sm font-medium">Analyzing your study patterns...</p>
          </div>
        ) : !analysis || analysis.sessions_analyzed === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted gap-3">
            <div className="w-16 h-16 rounded-2xl bg-sidebar border border-border flex items-center justify-center">
              <Brain size={28} className="opacity-20" />
            </div>
            <h2 className="text-base font-semibold">No sessions found</h2>
            <p className="text-sm opacity-70 text-center max-w-xs">
              Install the Chrome extension and start a study session for AI insights to appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* AI Narrative */}
            {analysis.narrative && (
              <div className="bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20 p-6 rounded-xl">
                <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-widest mb-4">
                  <Brain size={13} />
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
                <div className="border border-border rounded-xl p-5 bg-sidebar">
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
                <div className="border border-border rounded-xl p-5 bg-sidebar">
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
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                        i === 0
                          ? 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                          : 'bg-sidebar border-border text-foreground'
                      }`}
                    >
                      {i === 0 && '🏆 '}{t}
                    </span>
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

// ── StatCard sub-component ────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  sub?: string;
  color?: string;
}

function StatCard({ icon, title, value, sub }: StatCardProps) {
  return (
    <div className="border border-border rounded-xl p-4 bg-sidebar card-hover group">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <div className="text-[10px] uppercase tracking-widest text-muted font-bold">{title}</div>
      </div>
      <div className="text-2xl font-bold text-foreground mb-0.5">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
