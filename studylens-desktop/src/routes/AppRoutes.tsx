import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { PageLoader } from '../components/ui/PageLoader';

const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));
const NotesPage     = lazy(() => import('../features/notes/NotesPage'));
const NoteEditorPage = lazy(() => import('../features/editor/NoteEditorPage'));
const TodosPage     = lazy(() => import('../features/todos/TodosPage'));

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/"         element={<DashboardPage />} />
        <Route path="/notes"    element={<NotesPage />} />
        <Route path="/notes/:id" element={<NoteEditorPage />} />
        <Route path="/todos"    element={<TodosPage />} />
        <Route path="*"         element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
