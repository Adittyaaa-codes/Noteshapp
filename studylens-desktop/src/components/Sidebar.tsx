import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  FileText,
  CheckSquare,
  Moon,
  Sun,
  BookOpen,
  Settings,
} from 'lucide-react';
import { cn } from '../utils';
import { useThemeStore } from '../stores/useThemeStore';

const NAV_LINKS = [
  { name: 'Dashboard', path: '/', icon: Home },
  { name: 'Notes',     path: '/notes', icon: FileText },
  { name: 'Tasks',     path: '/todos', icon: CheckSquare },
];

export function Sidebar() {
  const location = useLocation();
  const { isDark, toggleTheme } = useThemeStore();

  const isActive = (path: string) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(path);

  return (
    <aside className="w-60 flex-shrink-0 bg-sidebar border-r border-border flex flex-col h-full select-none">
      {/* Workspace header */}
      <div className="h-14 px-4 flex items-center gap-2.5 border-b border-border">
        <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
          <BookOpen size={13} className="text-white" />
        </div>
        <span className="font-semibold text-sm text-foreground tracking-tight">
          StudyLens
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_LINKS.map(({ name, path, icon: Icon }) => (
          <Link
            key={path}
            to={path}
            className={cn(
              'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150',
              isActive(path)
                ? 'bg-black/8 dark:bg-white/10 text-foreground'
                : 'text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground'
            )}
          >
            <Icon
              size={17}
              className={isActive(path) ? 'text-foreground' : 'text-muted'}
            />
            {name}
          </Link>
        ))}
      </nav>

      {/* Footer controls */}
      <div className="p-2 border-t border-border flex flex-col gap-0.5">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-all w-full text-left"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
          {isDark ? 'Light Mode' : 'Dark Mode'}
        </button>

        <div
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted opacity-40 cursor-not-allowed"
          title="Settings — coming soon"
        >
          <Settings size={17} />
          Settings
        </div>
      </div>
    </aside>
  );
}
