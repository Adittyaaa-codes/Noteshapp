import { useEffect, useState, useRef, useCallback } from 'react';
import {
  RefreshCw, Brain, Lightbulb, Target, Clock, BookOpen,
  Star, BarChart2, FileText, CheckCircle2, Layers, TrendingUp,
  Play, Pause, RotateCcw, Timer, Flame
} from 'lucide-react';
import { cn } from '../../utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useGrowthStore } from '../../stores/useGrowthStore';
import { formatDuration, formatTimeframe } from '../../utils/index';

const TIMEFRAMES = ['today', 'this_week', 'this_month', 'all'];

// ── Study Timer ──────────────────────────────────────────────────────────────
function StudyTimer() {
  const [seconds, setSeconds]   = useState(0);
  const [running, setRunning]   = useState(false);
  const [mode, setMode]         = useState<'stopwatch' | 'pomodoro'>('stopwatch');
  
  // Pomodoro states
  const [pomoDur, setPomoDur]   = useState(25 * 60);
  const [pomoLeft, setPomoLeft] = useState(25 * 60);
  const [pomoBreak, setPomoBreak] = useState(false);

  // Manual break states
  const [breakLeft, setBreakLeft] = useState(0);
  const [breakTotal, setBreakTotal] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(() => {
    if (breakLeft > 0) {
      setBreakLeft(b => {
        if (b <= 1) {
          // Break is over, automatically resume
          setRunning(true);
          return 0;
        }
        return b - 1;
      });
      return; // Do not tick study timer
    }

    if (!running) return;

    if (mode === 'stopwatch') {
      setSeconds(s => s + 1);
    } else {
      setPomoLeft(prev => {
        if (prev <= 1) {
          setRunning(false);
          setPomoBreak(b => !b);
          return pomoBreak ? pomoDur : 5 * 60; // flip between work/break
        }
        return prev - 1;
      });
    }
  }, [mode, pomoDur, pomoBreak, running, breakLeft]);

  useEffect(() => {
    if (running || breakLeft > 0) {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, breakLeft, tick]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const ss = s % 60;
    const mm = m % 60;
    if (h > 0) return `${h}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
    return `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  };

  const reset = () => {
    setRunning(false);
    setSeconds(0);
    setPomoLeft(pomoDur);
    setPomoBreak(false);
    setBreakLeft(0);
  };

  const startBreak = (minutes: number) => {
    setRunning(false); // Pause study timer
    setBreakTotal(minutes * 60);
    setBreakLeft(minutes * 60);
  };

  const endBreakEarly = () => {
    setBreakLeft(0);
    setRunning(true);
  };

  const isManualBreak = breakLeft > 0;
  const displayTime = isManualBreak ? fmt(breakLeft) : (mode === 'stopwatch' ? fmt(seconds) : fmt(pomoLeft));
  
  let progress = 0;
  if (isManualBreak) {
    progress = ((breakTotal - breakLeft) / breakTotal) * 100;
  } else if (mode === 'pomodoro') {
    progress = ((pomoDur - pomoLeft) / pomoDur) * 100;
  }
  
  const circumference = 2 * Math.PI * 44;

  return (
    <div className="border border-border rounded-xl p-5 bg-sidebar">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Timer size={14} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Study Timer</span>
        </div>
        <div className="flex items-center gap-1 bg-background rounded-md border border-border p-0.5">
          {(['stopwatch', 'pomodoro'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); reset(); }}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                mode === m ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
              }`}
            >
              {m === 'stopwatch' ? 'Stopwatch' : 'Pomodoro'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-8">
        {/* Timer display */}
        <div className="relative flex flex-col items-center justify-center min-w-[108px]">
          <div className="relative flex items-center justify-center">
            {(mode === 'pomodoro' || isManualBreak) ? (
              <svg width={108} height={108} className="rotate-[-90deg]">
                <circle cx={54} cy={54} r={44} fill="none" stroke="var(--border)" strokeWidth={6} />
                <circle
                  cx={54} cy={54} r={44} fill="none"
                  stroke={isManualBreak ? '#f59e0b' : (pomoBreak ? '#10b981' : 'var(--primary)')}
                  strokeWidth={6}
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - (circumference * progress) / 100}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
            ) : (
              <div className="w-[108px] h-[108px] rounded-full border-[6px] border-border flex items-center justify-center">
              </div>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-foreground tabular-nums">{displayTime}</span>
              {(mode === 'pomodoro' || isManualBreak) && (
                <span className={cn(
                  "text-[10px] font-bold mt-0.5 uppercase tracking-widest",
                  isManualBreak ? "text-amber-500" : (pomoBreak ? "text-emerald-500" : "text-muted")
                )}>
                  {isManualBreak ? 'Break' : (pomoBreak ? 'Break' : 'Focus')}
                </span>
              )}
            </div>
          </div>
          
          {/* End Break Early Button */}
          {isManualBreak && (
            <button
              onClick={endBreakEarly}
              className="mt-3 text-[10px] font-semibold bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full hover:bg-amber-500/20 transition-colors"
            >
              Resume Study
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2 flex-1">
          {!isManualBreak && (
            <>
              <button
                onClick={() => setRunning(r => !r)}
                className={`flex justify-center items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  running
                    ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                    : 'bg-primary text-white hover:bg-primary/90'
                }`}
              >
                {running ? <Pause size={14} /> : <Play size={14} />}
                {running ? 'Pause' : (seconds > 0 || pomoLeft < pomoDur ? 'Resume' : 'Start')}
              </button>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => startBreak(5)}
                  disabled={!running && seconds === 0 && pomoLeft === pomoDur}
                  className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-medium text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 transition-all disabled:opacity-30"
                >
                  ☕ 5m
                </button>
                <button
                  onClick={() => startBreak(10)}
                  disabled={!running && seconds === 0 && pomoLeft === pomoDur}
                  className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-medium text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 transition-all disabled:opacity-30"
                >
                  ☕ 10m
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted border border-border hover:bg-background transition-all"
                >
                  <RotateCcw size={13} />
                  Stop
                </button>
                {mode === 'pomodoro' && (
                  <select
                    value={pomoDur}
                    onChange={e => { setPomoDur(+e.target.value); reset(); }}
                    className="flex-1 px-2 py-1.5 rounded-lg text-xs border border-border bg-background text-foreground outline-none cursor-pointer"
                  >
                    <option value={15 * 60}>15m</option>
                    <option value={25 * 60}>25m</option>
                    <option value={45 * 60}>45m</option>
                    <option value={60 * 60}>60m</option>
                  </select>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const {
    stats, analysis, timeframe, loadingStats, loadingAnalysis,
    setTimeframe, fetchStats, fetchAnalysis,
  } = useDashboardStore();

  const { data: growthData, fetchGrowthData } = useGrowthStore();

  useEffect(() => {
    fetchStats();
    fetchAnalysis();
    fetchGrowthData(365);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = (() => {
    const data = growthData?.daily_hours ?? [];
    if (timeframe === 'this_month') return data.slice(-30);
    if (timeframe === 'all') return data.slice(-90);
    return data.slice(-7);
  })();

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
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Study Dashboard</h1>
            <p className="text-sm text-muted mt-0.5">Track your learning patterns and AI-powered insights</p>
          </div>
          <div className="text-xs text-muted font-medium">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard icon={<BookOpen size={16} className="text-primary" />} title="Total Sessions" value={loadingStats ? '—' : (stats?.total_sessions ?? 0)} sub="all time" />
          <StatCard icon={<Clock size={16} className="text-emerald-500" />} title="Study Time" value={loadingStats ? '—' : formatDuration(stats?.total_study_seconds ?? 0)} sub="total" />
          <StatCard icon={<Star size={16} className="text-amber-500" />} title="Focus Score" value={loadingStats ? '—' : stats?.avg_focus_score ? `${stats.avg_focus_score}/10` : '—'} sub="avg rating" />
          <StatCard icon={<Layers size={16} className="text-purple-500" />} title="Capsules" value={loadingStats ? '—' : (stats?.capsules_count ?? 0)} sub="study notes" />
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="border border-border rounded-xl p-4 bg-sidebar">
            <div className="flex items-center gap-2 mb-1"><FileText size={13} className="text-muted" /><span className="text-[10px] font-bold uppercase tracking-widest text-muted">Notes</span></div>
            <div className="text-xl font-bold text-foreground">{loadingStats ? '—' : (stats?.notes_count ?? 0)}</div>
          </div>
          <div className="border border-border rounded-xl p-4 bg-sidebar">
            <div className="flex items-center gap-2 mb-1"><CheckCircle2 size={13} className="text-emerald-500" /><span className="text-[10px] font-bold uppercase tracking-widest text-muted">Done</span></div>
            <div className="text-xl font-bold text-foreground">{loadingStats ? '—' : (stats?.todos_completed ?? 0)}</div>
          </div>
          <div className="border border-border rounded-xl p-4 bg-sidebar">
            <div className="flex items-center gap-2 mb-1"><TrendingUp size={13} className="text-muted" /><span className="text-[10px] font-bold uppercase tracking-widest text-muted">This Week</span></div>
            <div className="text-xl font-bold text-foreground">{loadingStats ? '—' : `${stats?.this_week_hours ?? 0}h`} <span className="text-xs text-muted font-normal">({stats?.this_week ?? 0} sessions)</span></div>
          </div>
        </div>

        {/* Timer + Chart side-by-side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <StudyTimer />

          {/* Bar chart */}
          <div className="border border-border rounded-xl p-5 bg-sidebar">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Study Hours — {timeframe === 'this_month' ? 'Last 30 Days' : timeframe === 'all' ? 'Last 90 Days' : 'Last 7 Days'}
                </div>
                <div className="text-xs text-muted mt-0.5">Daily breakdown</div>
              </div>
              <BarChart2 size={15} className="text-muted" />
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -30 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                  <Tooltip content={<BarTooltip />} />
                  <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.hours === Math.max(...chartData.map(d => d.hours)) ? 'var(--primary)' : 'var(--border)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[130px] text-muted text-sm opacity-50">No data yet</div>
            )}
          </div>
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
              {timeframe === 'today' ? "You haven't recorded any sessions today." :
               timeframe === 'this_week' ? "No sessions found for this week." :
               timeframe === 'this_month' ? "No sessions found for this month." :
               "Install the Chrome extension and start a study session for AI insights to appear here."}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
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

            {analysis.top_topics && analysis.top_topics.length > 0 && (
              <div>
                <div className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Key Topics</div>
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

// ── StatCard ──────────────────────────────────────────────────────────────────
interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  sub?: string;
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
