import { useEffect, useState } from 'react';
import { CalendarDays, Flame, CheckCircle2, Star, Layers, Activity } from 'lucide-react';
import { useGrowthStore } from '../../stores/useGrowthStore';
import { useCapsulesStore } from '../../stores/useCapsulesStore';
import { formatDuration } from '../../utils/index';
import { Link } from 'react-router-dom';
import { Capsule } from '../../services/api';

// ── Activity Heatmap (GitHub-style) ──────────────────────────────────────────
function ActivityHeatmap({ dailyHours }: { dailyHours: { date: string; hours: number }[] }) {
  const today = new Date();
  const cells: { date: string; hours: number; dayOfWeek: number; weekIndex: number }[] = [];
  const hoursMap = new Map(dailyHours.map(d => [d.date, d.hours]));

  for (let i = 363; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay();
    const weekIndex = Math.floor((363 - i) / 7);
    cells.push({ date: dateStr, hours: hoursMap.get(dateStr) ?? 0, dayOfWeek, weekIndex });
  }

  const maxHours = Math.max(...dailyHours.map(d => d.hours), 0.01);

  const getColor = (hours: number) => {
    if (hours <= 0) return 'var(--border)';
    const intensity = Math.min(hours / maxHours, 1);
    if (intensity < 0.25) return 'rgba(35,131,226,0.2)';
    if (intensity < 0.5)  return 'rgba(35,131,226,0.45)';
    if (intensity < 0.75) return 'rgba(35,131,226,0.7)';
    return 'rgba(35,131,226,1)';
  };

  const weeks: typeof cells[] = [];
  cells.forEach(c => {
    if (!weeks[c.weekIndex]) weeks[c.weekIndex] = [];
    weeks[c.weekIndex].push(c);
  });

  const monthLabels: { label: string; weekIndex: number }[] = [];
  let lastMonth = -1;
  cells.forEach(c => {
    const d = new Date(c.date);
    const month = d.getMonth();
    if (month !== lastMonth) {
      monthLabels.push({ label: d.toLocaleDateString(undefined, { month: 'short' }), weekIndex: c.weekIndex });
      lastMonth = month;
    }
  });

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const [tooltip, setTooltip] = useState<{ date: string; hours: number; x: number; y: number } | null>(null);

  return (
    <div className="border border-border rounded-xl p-5 bg-sidebar overflow-hidden w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Flame size={14} className="text-orange-500" />
            Study Activity
          </div>
          <div className="text-xs text-muted mt-0.5">Last 52 weeks</div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted">
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-sm"
              style={{ background: v === 0 ? 'var(--border)' : `rgba(35,131,226,${v})` }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-hide pb-2">
        <div className="relative" style={{ paddingLeft: 28 }}>
          <div className="absolute left-0 top-0 flex flex-col gap-0.5" style={{ paddingTop: 18 }}>
            {DAY_LABELS.map((d, i) => (
              <div key={d} className="h-3 text-[9px] text-muted flex items-center" style={{ marginBottom: i % 2 === 0 ? 1 : 1 }}>
                {i % 2 === 1 ? d : ''}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-0">
            <div className="flex gap-0.5 mb-1">
              {weeks.map((_, wi) => {
                const ml = monthLabels.find(m => m.weekIndex === wi);
                return (
                  <div key={wi} className="w-3 text-[9px] text-muted" style={{ minWidth: 14 }}>
                    {ml ? ml.label : ''}
                  </div>
                );
              })}
            </div>

            {[0, 1, 2, 3, 4, 5, 6].map(dow => (
              <div key={dow} className="flex gap-0.5 mb-0.5">
                {weeks.map((week, wi) => {
                  const cell = week.find(c => c.dayOfWeek === dow);
                  if (!cell) return <div key={wi} className="w-3 h-3" style={{ minWidth: 14 }} />;
                  return (
                    <div
                      key={wi}
                      className="w-3 h-3 rounded-sm cursor-pointer transition-opacity hover:opacity-80"
                      style={{ background: getColor(cell.hours), minWidth: 14 }}
                      onMouseEnter={e => setTooltip({
                        date: cell.date,
                        hours: cell.hours,
                        x: e.currentTarget.getBoundingClientRect().left,
                        y: e.currentTarget.getBoundingClientRect().top,
                      })}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 bg-background border border-border rounded-lg px-2.5 py-1.5 shadow-xl text-xs pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y - 44 }}
        >
          <div className="font-semibold text-foreground">
            {tooltip.hours > 0 ? `${tooltip.hours.toFixed(1)}h studied` : 'No activity'}
          </div>
          <div className="text-muted">{new Date(tooltip.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
        </div>
      )}
    </div>
  );
}

// ── Monthly Calendar ──────────────────────────────────────────────────────────
function MonthlyCalendar({ 
  dailyData, 
  onSelectDate, 
  selectedDate 
}: { 
  dailyData: { date: string; hours: number }[],
  onSelectDate: (date: string) => void,
  selectedDate: string 
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  
  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  return (
    <div className="border border-border rounded-xl p-5 bg-sidebar h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <CalendarDays size={14} className="text-primary" />
          {currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h3>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded">←</button>
          <button onClick={nextMonth} className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded">→</button>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-muted">{d}</div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-1 flex-1">
        {days.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="p-2" />;
          
          const dateStr = day.toISOString().split('T')[0];
          const hasData = dailyData.find(d => d.date === dateStr);
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === new Date().toISOString().split('T')[0];
          
          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={`relative flex items-center justify-center rounded-lg text-xs transition-all h-8
                ${isSelected ? 'bg-primary text-white font-bold' : 'hover:bg-background text-foreground'}
                ${isToday && !isSelected ? 'border border-primary text-primary' : 'border border-transparent'}
              `}
            >
              {day.getDate()}
              {hasData && hasData.hours > 0 && !isSelected && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Calendar Page ───────────────────────────────────────────────────────
export default function CalendarPage() {
  const { data: growthData, fetchGrowthData } = useGrowthStore();
  const { capsules, fetchCapsules } = useCapsulesStore();
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchGrowthData(365);
    fetchCapsules();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dailyHours = growthData?.daily_hours ?? [];
  const selectedDayData = dailyHours.find(d => d.date === selectedDate);
  const selectedDayCapsules = capsules.filter(c => c.date === selectedDate);
  
  const displayDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Calendar</h1>
          <p className="text-sm text-muted mt-0.5">Your study history and daily insights</p>
        </div>

        {/* Heatmap spanning full width */}
        <div className="mb-6">
          <ActivityHeatmap dailyHours={dailyHours} />
        </div>

        {/* Calendar & Daily Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Left Col: Calendar UI */}
          <div className="col-span-1 h-[300px]">
            <MonthlyCalendar 
              dailyData={dailyHours} 
              onSelectDate={setSelectedDate} 
              selectedDate={selectedDate} 
            />
          </div>

          {/* Right Col: Daily Statistics & Capsules */}
          <div className="col-span-2 space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h2 className="text-lg font-bold text-foreground">{displayDate}</h2>
              {selectedDate === new Date().toISOString().split('T')[0] && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-bold uppercase tracking-wider">Today</span>
              )}
            </div>

            {/* Daily Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-sidebar border border-border p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={14} className="text-muted" />
                  <span className="text-[10px] uppercase font-bold text-muted tracking-widest">Study Time</span>
                </div>
                <div className="text-xl font-bold text-foreground">
                  {selectedDayData && selectedDayData.hours > 0 ? `${selectedDayData.hours.toFixed(1)} hrs` : '0 hrs'}
                </div>
              </div>
              <div className="bg-sidebar border border-border p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span className="text-[10px] uppercase font-bold text-muted tracking-widest">Productivity</span>
                </div>
                <div className="text-xl font-bold text-foreground">
                  {selectedDayData && selectedDayData.hours > 2 ? 'High' : (selectedDayData && selectedDayData.hours > 0 ? 'Medium' : 'None')}
                </div>
              </div>
              <div className="bg-sidebar border border-border p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Star size={14} className="text-amber-500" />
                  <span className="text-[10px] uppercase font-bold text-muted tracking-widest">Focus Score</span>
                </div>
                <div className="text-xl font-bold text-foreground">
                  {selectedDayData && selectedDayData.hours > 0 ? '8.5/10' : '—'}
                </div>
              </div>
            </div>

            {/* Daily Capsules */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Layers size={14} className="text-purple-500" />
                <h3 className="font-semibold text-sm text-foreground">Study Capsules for this day</h3>
              </div>
              
              {selectedDayCapsules.length > 0 ? (
                <div className="space-y-3">
                  {selectedDayCapsules.map(capsule => (
                    <Link 
                      key={capsule.id} 
                      to={`/capsules`}
                      className="block p-4 border border-border bg-background rounded-xl hover:bg-sidebar transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-sm text-foreground">{capsule.title}</h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase
                          ${capsule.difficulty === 'hard' ? 'bg-red-500/10 text-red-500' :
                            capsule.difficulty === 'medium' ? 'bg-amber-500/10 text-amber-500' :
                            'bg-emerald-500/10 text-emerald-500'}
                        `}>
                          {capsule.difficulty}
                        </span>
                      </div>
                      <p className="text-xs text-muted line-clamp-2">
                        {capsule.ai_notes ? capsule.ai_notes.replace(/[#*]/g, '').slice(0, 150) + '...' : 'No notes available yet.'}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-sidebar border border-border rounded-xl border-dashed">
                  <p className="text-xs text-muted">No capsules recorded for this date.</p>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
