import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import { useTodosStore } from '../../stores/useTodosStore';
import type { Todo } from '../../services/api';

export default function TodosPage() {
  const { todos, loading, fetchTodos, addTodo, toggleTodo, deleteTodo } = useTodosStore();
  const [newTodo, setNewTodo] = useState('');

  useEffect(() => {
    fetchTodos();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newTodo.trim();
    if (!text) return;
    setNewTodo('');
    await addTodo(text);
  };

  const pending   = todos.filter((t) => !t.completed);
  const completed = todos.filter((t) => t.completed);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <CheckCircle2 size={24} className="text-primary" />
          Tasks
        </h1>
        <p className="text-sm text-muted mt-0.5">
          {pending.length} remaining · {completed.length} completed
        </p>
      </div>

      {/* Add new todo */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-3 mb-8 pb-6 border-b border-border group"
      >
        <Plus
          size={18}
          className="text-muted group-focus-within:text-primary transition-colors flex-shrink-0"
        />
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add a task... (press Enter)"
          className="flex-1 bg-transparent text-base outline-none placeholder:text-muted/50 text-foreground"
        />
      </form>

      {/* Loading skeleton */}
      {loading && todos.length === 0 && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <div className="w-5 h-5 rounded-full bg-border animate-pulse" />
              <div className="h-3.5 bg-border rounded animate-pulse flex-1" />
            </div>
          ))}
        </div>
      )}

      {/* Pending tasks */}
      {pending.length > 0 && (
        <div className="space-y-0.5 mb-6">
          {pending.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={toggleTodo}
              onDelete={deleteTodo}
            />
          ))}
        </div>
      )}

      {/* Completed tasks */}
      {completed.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted font-semibold mb-2 px-2">
            Completed ({completed.length})
          </div>
          <div className="space-y-0.5 opacity-60">
            {completed.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={toggleTodo}
                onDelete={deleteTodo}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && todos.length === 0 && (
        <div className="text-center py-16 text-muted">
          <CheckCircle2 size={44} className="mx-auto mb-4 opacity-20" />
          <p className="text-sm font-medium">No tasks yet. You're all caught up!</p>
        </div>
      )}
    </div>
  );
}

// ── TodoItem sub-component ────────────────────────────────────────────────────

function TodoItem({
  todo,
  onToggle,
  onDelete,
}: {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="group flex items-center gap-3 py-2 -mx-2 px-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
      <button
        onClick={() => onToggle(todo)}
        className="text-muted hover:text-primary transition-colors flex-shrink-0"
        aria-label={todo.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {todo.completed ? (
          <CheckCircle2 size={20} className="text-primary" />
        ) : (
          <Circle size={20} />
        )}
      </button>

      <span
        className={`flex-1 text-sm ${
          todo.completed ? 'line-through text-muted' : 'text-foreground'
        }`}
      >
        {todo.text}
      </span>

      <button
        onClick={() => onDelete(todo.id)}
        className="opacity-0 group-hover:opacity-100 p-1.5 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all"
        aria-label="Delete task"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
