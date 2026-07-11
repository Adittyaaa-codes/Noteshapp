import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Plus, Trash2, Brain, ChevronDown, ChevronUp, Zap, Check, X, Clock } from 'lucide-react';
import { useTodosStore } from '../../stores/useTodosStore';
import { useAIPlanStore } from '../../stores/useAIPlanStore';
import type { Todo } from '../../services/api';

export default function TodosPage() {
  const { todos, loading, fetchTodos, addTodo, toggleTodo, deleteTodo } = useTodosStore();
  const { plan, loading: planLoading, fetchPlan, acceptPlan, rejectPlan } = useAIPlanStore();
  const [newTodo, setNewTodo] = useState('');
  const [planOpen, setPlanOpen] = useState(true);
  const [planAccepted, setPlanAccepted] = useState(false);
  const [planRejected, setPlanRejected] = useState(false);

  useEffect(() => {
    fetchTodos();
    fetchPlan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newTodo.trim();
    if (!text) return;
    setNewTodo('');
    await addTodo(text);
  };

  const handleAcceptPlan = async () => {
    await acceptPlan();
    setPlanAccepted(true);
    fetchTodos(); // refresh todos list
  };

  const handleRejectPlan = async () => {
    await rejectPlan();
    setPlanRejected(true);
  };

  const pending   = todos.filter((t) => !t.completed);
  const completed = todos.filter((t) => t.completed);

  const showPlan = plan?.tasks && plan.tasks.length > 0 &&
                   plan.status === 'pending' &&
                   !planAccepted && !planRejected;

  return (
    <div className="p-8 max-w-2xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <CheckCircle2 size={17} className="text-primary" />
          </div>
          Tasks
        </h1>
        <p className="text-sm text-muted mt-0.5">
          {pending.length} remaining · {completed.length} completed
        </p>
      </div>

      {/* AI Plan Section */}
      {showPlan && (
        <div className="mb-6 border border-primary/25 bg-gradient-to-br from-primary/5 to-purple-500/5 rounded-xl overflow-hidden animate-in">
          <button
            onClick={() => setPlanOpen(p => !p)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Brain size={14} className="text-primary" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-foreground">AI Study Plan</div>
                <div className="text-xs text-muted mt-0.5">
                  {planLoading ? 'Generating plan...' : `${plan?.tasks?.length ?? 0} recommended tasks for tomorrow`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">AI</span>
              {planOpen ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
            </div>
          </button>

          {planOpen && (
            <div className="px-5 pb-5 border-t border-primary/15">
              {planLoading ? (
                <div className="pt-4 space-y-2">
                  {[1,2,3].map(i => <div key={i} className="skeleton h-3 rounded" style={{ width: `${65 + i * 8}%` }} />)}
                </div>
              ) : (
                <>
                  <div className="pt-4 space-y-2.5 mb-4">
                    {plan?.tasks?.map((task, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                          task.priority === 'high' ? 'bg-red-500' :
                          task.priority === 'medium' ? 'bg-amber-500' : 'bg-primary'
                        }`} />
                        <div>
                          <p className="text-sm text-foreground font-medium">{task.text}</p>
                          <p className="text-xs text-muted mt-0.5">{task.reason}</p>
                        </div>
                        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                          task.priority === 'high' ? 'bg-red-500/10 text-red-500' :
                          task.priority === 'medium' ? 'bg-amber-500/10 text-amber-500' :
                          'bg-primary/10 text-primary'
                        }`}>
                          {task.priority}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-1 border-t border-primary/15">
                    <button
                      onClick={handleAcceptPlan}
                      className="flex items-center gap-1.5 bg-primary text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95"
                    >
                      <Check size={12} /> Accept & Add to Tasks
                    </button>
                    <button
                      onClick={handleRejectPlan}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-muted border border-border hover:text-foreground hover:bg-sidebar transition-all"
                    >
                      <X size={12} /> Dismiss
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Plan accepted/rejected notices */}
      {planAccepted && (
        <div className="mb-4 flex items-center gap-2 text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2.5 text-sm animate-in">
          <Check size={14} /> AI tasks added to your list!
        </div>
      )}

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
              <div className="w-5 h-5 rounded-full skeleton" />
              <div className="h-3.5 skeleton rounded flex-1" />
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
          <div className="w-16 h-16 rounded-2xl bg-sidebar border border-border flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={28} className="opacity-20" />
          </div>
          <p className="text-sm font-semibold mb-1">No tasks yet</p>
          <p className="text-xs opacity-70">Add a task above or let AI plan your studies!</p>
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
    <div className="group flex items-center gap-3 py-2.5 -mx-2 px-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
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
