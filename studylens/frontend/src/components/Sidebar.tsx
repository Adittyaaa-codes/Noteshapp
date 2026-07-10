import { Link, useLocation } from 'react-router-dom';
import { Home, FileText, CheckSquare, Settings, Moon, Sun, BookOpen } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  isDark: boolean;
  toggleTheme: () => void;
}

export default function Sidebar({ isDark, toggleTheme }: SidebarProps) {
  const location = useLocation();

  const links = [
    { name: 'Dashboard', path: '/', icon: Home },
    { name: 'Notes', path: '/notes', icon: FileText },
    { name: 'Todos', path: '/todos', icon: CheckSquare },
  ];

  return (
    <div className="w-64 bg-sidebar border-r border-border flex flex-col h-full flex-shrink-0">
      {/* Workspace Header */}
      <div className="p-4 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors duration-150">
        <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-white font-bold text-xs">
          <BookOpen size={14} />
        </div>
        <span className="font-semibold text-sm">StudyLens Workspace</span>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-2 px-3 flex flex-col gap-1">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
          
          return (
            <Link
              key={link.name}
              to={link.path}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                isActive 
                  ? "bg-black/5 dark:bg-white/10 text-foreground" 
                  : "text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground"
              )}
            >
              <Icon size={18} className={isActive ? "text-foreground" : "text-muted"} />
              {link.name}
            </Link>
          );
        })}
      </div>

      {/* Footer / Settings */}
      <div className="p-3 border-t border-border flex flex-col gap-1">
        <button 
          onClick={toggleTheme}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-colors w-full text-left"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
          {isDark ? 'Light Mode' : 'Dark Mode'}
        </button>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-colors cursor-not-allowed opacity-50">
          <Settings size={18} />
          Settings
        </div>
      </div>
    </div>
  );
}
