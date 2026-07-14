import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  FileText,
  CheckSquare,
  Moon,
  Sun,
  BookOpen,
  CalendarDays,
  Layers,
  Settings,
} from 'lucide-react';
import { cn } from '../utils';
import { useThemeStore } from '../stores/useThemeStore';

const NAV_LINKS = [
  { name: 'Dashboard', path: '/',         icon: Home },
  { name: 'Notes',     path: '/notes',    icon: FileText },
  { name: 'Tasks',     path: '/todos',    icon: CheckSquare },
  { name: 'Capsules',  path: '/capsules', icon: Layers },
  { name: 'Calendar',  path: '/calendar', icon: CalendarDays },
  { name: 'Settings',  path: '/settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const { isDark, toggleTheme } = useThemeStore();

  const isActive = (path: string) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(path);

  return (
    <aside className="w-58 flex-shrink-0 bg-sidebar border-r border-border flex flex-col h-full select-none">
      {/* Workspace header */}
      <div className="h-14 px-4 flex items-center gap-2.5 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 shadow-sm">
          <BookOpen size={14} className="text-white" />
        </div>
        <div>
          <span className="font-bold text-sm text-foreground tracking-tight">Noteshapp</span>
          <div className="text-[10px] text-muted leading-none mt-0.5">AI Study Platform</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
        <div className="text-[10px] font-semibold text-muted uppercase tracking-widest px-3 mb-2 mt-1">
          Menu
        </div>
        {NAV_LINKS.map(({ name, path, icon: Icon }) => {
          const active = isActive(path);
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                'relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground'
              )}
            >
              {active && <span className="nav-active-indicator" />}
              <Icon
                size={16}
                className={active ? 'text-primary' : 'text-muted'}
              />
              {name}
              {name === 'Capsules' && (
                <span className="ml-auto text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">
                  AI
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
