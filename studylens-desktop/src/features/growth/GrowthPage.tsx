import { useEffect, useState } from 'react';
import {
  BarChart2, Flame, Trophy, TrendingUp, Clock, Calendar,
  ChevronLeft, RefreshCw, Star, Zap, Brain
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { useGrowthStore } from '../../stores/useGrowthStore';

const COLORS = ['#2383e2', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

const TIMEFRAME_OPTIONS = [
  { label: '7 days',  days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

export default function GrowthPage() {
  const { data, loading, fetchGrowthData, days } = useGrowthStore();
  const [selectedDays, setSelectedDays] = useState(30);

  useEffect(() => { fetchGrowthData(selectedDays); }, [selectedDays]); // eslint-disable-line

  const handleDaysChange = (d: number) => {
    setSelectedDays(d);
    fetchGrowthData(d);
  };

  const dailyData = data?.daily_hours ?? [];
  const weeklyData = data?.weekly_hours ?? [];
  const subjects  = data?.subject_distribution ?? [];
  const records   = data?.personal_records;
  const streak    = data?.streak ?? 0;
  const insights  = data?.insights ?? [];

  // Custom tooltip for area chart
  const AreaTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-background border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
        <div className="text-muted mb-1">{label}</div>
        <div className="font-bold text-foreground">{payload[0]?.value?.toFixed(1)}h studied</div>
      </div>
    );
  };

  const BarTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-background border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
        <div className="text-muted mb-1">{label}</div>
        <div className="font-bold text-foreground">{payload[0]?.value?.toFixed(1)}h</div>
      </div>
    );
  };

  const maxHoursDay  = Math.max(...dailyData.map(d => d.hours), 0.1);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <BarChart2 size={18} className="text-emerald-500" />
              </div>
              Growth Journey
            </h1>
            <p className="text-sm text-muted mt-1">
              Your personal progress — the graph itself is the game
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Timeframe selector */}
            <div className="flex items-center gap-1 bg-sidebar rounded-lg p-1 border border-border">
              {TIMEFRAME_OPTIONS.map(opt => (
                <button
                  key={opt.days}
                  onClick={() => handleDaysChange(opt.days)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    selectedDays === opt.days
                      ? 'bg-background text-foreground shadow-sm border border-border'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => fetchGrowthData(selectedDays)}
              disabled={loading}
              className="p-2 rounded-lg border border-border text-muted hover:text-foreground hover:bg-sidebar transition-all disabled:opacity-40"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Top Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {/* Streak */}
          <div className="border border-border rounded-xl p-4 bg-sidebar card-hover relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-orange-500/5 rounded-full -translate-y-4 translate-x-4" />
            <div className="flex items-center gap-2 mb-2">
              <Flame size={16} className={`${streak > 0 ? 'text-orange-500 streak-bounce' : 'text-muted'}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Streak</span>
            </div>
            <div className="text-3xl font-bold text-foreground count-up">{streak}</div>
            <div className="text-[11px] text-muted mt-1">{streak === 1 ? 'day' : 'days'} in a row</div>
          </div>

          {/* Total hours */}
          <div className="border border-border rounded-xl p-4 bg-sidebar card-hover relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-full -translate-y-4 translate-x-4" />
            <div className="flex items-center gap-2 mb-2">
              <Clock size={16} className="text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Total Hours</span>
            </div>
            <div className="text-3xl font-bold text-foreground count-up">{loading ? '—' : (data?.total_hours ?? 0)}</div>
            <div className="text-[11px] text-muted mt-1">in last {selectedDays} days</div>
          </div>

          {/* Avg daily */}
          <div className="border border-border rounded-xl p-4 bg-sidebar card-hover relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 rounded-full -translate-y-4 translate-x-4" />
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} className="text-purple-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Daily Avg</span>
            </div>
            <div className="text-3xl font-bold text-foreground count-up">{loading ? '—' : (data?.avg_daily_hours ?? 0)}</div>
            <div className="text-[11px] text-muted mt-1">hours per day</div>
          </div>

          {/* Best day */}
          <div className="border border-border rounded-xl p-4 bg-sidebar card-hover relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full -translate-y-4 translate-x-4" />
            <div className="flex items-center gap-2 mb-2">
              <Trophy size={16} className="text-amber-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Best Day</span>
            </div>
            <div className="text-3xl font-bold text-foreground count-up">
              {loading ? '—' : (records?.best_day?.label ?? '—')}
            </div>
            <div className="text-[11px] text-muted mt-1">{records?.best_day?.date ?? 'No data yet'}</div>
          </div>
        </div>

        {/* Daily Hours Chart */}
        <div className="border border-border rounded-xl p-6 bg-sidebar mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="font-semibold text-sm text-foreground">Daily Study Hours</div>
              <div className="text-xs text-muted mt-0.5">Last {selectedDays} days</div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" />
              <span className="text-xs text-muted">Hours studied</span>
            </div>
          </div>
          {loading ? (
            <div className="h-48 skeleton rounded-lg" />
          ) : dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={dailyData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <defs>
                  <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2383e2" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2383e2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  interval={Math.floor(dailyData.length / 7)}
                />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <Tooltip content={<AreaTooltip />} />
                <Area
                  type="monotone"
                  dataKey="hours"
                  stroke="#2383e2"
                  strokeWidth={2}
                  fill="url(#colorHours)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#2383e2', strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-muted text-sm">
              No study data yet — start a session!
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Weekly Bar Chart */}
          <div className="border border-border rounded-xl p-6 bg-sidebar">
            <div className="font-semibold text-sm text-foreground mb-1">Weekly Progress</div>
            <div className="text-xs text-muted mb-5">Last 12 weeks</div>
            {loading ? (
              <div className="h-40 skeleton rounded-lg" />
            ) : weeklyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={weeklyData} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" tick={{ fontSize: 9, fill: 'var(--muted)' }} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--muted)' }} />
                  <Tooltip content={<BarTooltip />} />
                  <Bar dataKey="hours" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted text-xs">No data</div>
            )}
          </div>

          {/* Subject Distribution */}
          <div className="border border-border rounded-xl p-6 bg-sidebar">
            <div className="font-semibold text-sm text-foreground mb-1">Subject Distribution</div>
            <div className="text-xs text-muted mb-4">Time by topic</div>
            {loading ? (
              <div className="h-40 skeleton rounded-lg" />
            ) : subjects.length > 0 ? (
              <div className="space-y-2.5">
                {subjects.slice(0, 6).map((s, i) => {
                  const maxMin = subjects[0].minutes;
                  const pct    = Math.round((s.minutes / maxMin) * 100);
                  const isTop  = i === 0;
                  return (
                    <div key={s.topic}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium ${isTop ? 'text-foreground font-semibold' : 'text-muted'}`}>
                          {isTop && '🔥 '}{s.topic}
                        </span>
                        <span className={`text-xs font-bold ${isTop ? 'text-amber-500' : 'text-muted'}`}>
                          {s.minutes}m
                        </span>
                      </div>
                      <div className="h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            background: isTop
                              ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                              : COLORS[i % COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted text-xs">
                No topic data yet
              </div>
            )}
          </div>
        </div>

        {/* Personal Records */}
        <div className="mb-6">
          <div className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">
            Personal Records
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                label: 'Best Study Day',
                value: records?.best_day?.label ?? '—',
                sub:   records?.best_day?.date ?? 'Keep studying!',
                icon:  <Trophy size={18} className="text-amber-500" />,
                color: 'amber',
              },
              {
                label: 'Longest Session',
                value: records?.longest_session ? `${records.longest_session.minutes}m` : '—',
                sub:   records?.longest_session?.title ?? 'No sessions yet',
                icon:  <Zap size={18} className="text-purple-500" />,
                color: 'purple',
              },
              {
                label: 'Best Week',
                value: records?.best_week?.label ?? '—',
                sub:   records?.best_week?.week ?? 'Keep going!',
                icon:  <Star size={18} className="text-emerald-500" />,
                color: 'emerald',
              },
            ].map(rec => (
              <div key={rec.label} className="border border-border rounded-xl p-5 bg-sidebar card-hover">
                <div className="flex items-center gap-2 mb-3">
                  {rec.icon}
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{rec.label}</span>
                </div>
                <div className="text-2xl font-bold text-foreground mb-1">{rec.value}</div>
                <div className="text-xs text-muted truncate">{rec.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Growth Insights */}
        {insights.length > 0 && (
          <div className="border border-border rounded-xl p-6 bg-sidebar">
            <div className="flex items-center gap-2 mb-4">
              <Brain size={15} className="text-primary" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted">AI Growth Insights</span>
            </div>
            <div className="space-y-3">
              {insights.map((insight, i) => (
                <div key={i} className="flex gap-3 items-start animate-in" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <p className="text-sm text-foreground leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
