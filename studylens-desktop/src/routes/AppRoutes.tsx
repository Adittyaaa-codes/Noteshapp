import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, Component, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

// ── Lazy-loaded pages ─────────────────────────────────────────────────────────
const DashboardPage  = lazy(() => import('../features/dashboard/DashboardPage'));
const NotesPage      = lazy(() => import('../features/notes/NotesPage'));
const NoteEditorPage = lazy(() => import('../features/editor/NoteEditorPage'));
const TodosPage      = lazy(() => import('../features/todos/TodosPage'));
const CapsulesPage   = lazy(() => import('../features/capsules/CapsulesPage'));
const CalendarPage   = lazy(() => import('../features/calendar/CalendarPage'));
const SettingsPage   = lazy(() => import('../features/settings/SettingsPage'));

// ── Page-level loader ─────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted gap-3">
      <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
      <p className="text-xs font-medium">Loading...</p>
    </div>
  );
}

// ── Page-level error boundary ─────────────────────────────────────────────────
class PageErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(err: Error) {
    return { hasError: true, error: err.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted gap-4 p-8">
          <div className="text-destructive font-semibold text-sm">Page Error</div>
          <p className="text-xs max-w-xs text-center opacity-70">{this.state.error}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: '' })}
            className="flex items-center gap-2 text-xs bg-primary text-white px-4 py-2 rounded-lg"
          >
            <RefreshCw size={13} />
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Wrapped page helper ───────────────────────────────────────────────────────
function SafePage({ children }: { children: ReactNode }) {
  return (
    <PageErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </PageErrorBoundary>
  );
}

// ── Routes ────────────────────────────────────────────────────────────────────
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/"          element={<SafePage><DashboardPage /></SafePage>} />
      <Route path="/notes"     element={<SafePage><NotesPage /></SafePage>} />
      <Route path="/notes/:id" element={<SafePage><NoteEditorPage /></SafePage>} />
      <Route path="/todos"     element={<SafePage><TodosPage /></SafePage>} />
      <Route path="/capsules"  element={<SafePage><CapsulesPage /></SafePage>} />
      <Route path="/calendar"  element={<SafePage><CalendarPage /></SafePage>} />
      <Route path="/settings"  element={<SafePage><SettingsPage /></SafePage>} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  );
}
