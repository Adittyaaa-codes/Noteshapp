import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

export default function Todos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState('');

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    const res = await fetch('http://localhost:7842/api/todos');
    setTodos(await res.json());
  };

  const addTodo = async (e: React.KeyboardEvent | React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;
    const res = await fetch('http://localhost:7842/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newTodo, completed: false }),
    });
    if (res.ok) {
      setNewTodo('');
      fetchTodos();
    }
  };

  const toggleTodo = async (todo: Todo) => {
    const res = await fetch(`http://localhost:7842/api/todos/${todo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...todo, completed: !todo.completed }),
    });
    if (res.ok) {
      fetchTodos();
    }
  };

  const deleteTodo = async (id: string) => {
    const res = await fetch(`http://localhost:7842/api/todos/${id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      fetchTodos();
    }
  };

  return (
    <div className="p-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
        <CheckCircle2 size={32} className="text-primary" />
        Tasks
      </h1>

      <form onSubmit={addTodo} className="flex items-center gap-3 mb-8 group">
        <Plus size={20} className="text-muted group-focus-within:text-primary transition-colors" />
        <input 
          type="text" 
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add a task..." 
          className="flex-1 bg-transparent text-lg outline-none placeholder:text-muted/60"
        />
      </form>

      <div className="space-y-1">
        {todos.map(todo => (
          <div key={todo.id} className="group flex items-center gap-3 py-2 -mx-2 px-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
            <button onClick={() => toggleTodo(todo)} className="text-muted hover:text-primary transition-colors flex-shrink-0">
              {todo.completed ? <CheckCircle2 size={22} className="text-primary" /> : <Circle size={22} />}
            </button>
            
            <span className={`flex-1 text-[15px] ${todo.completed ? 'line-through text-muted' : 'text-foreground'}`}>
              {todo.text}
            </span>

            <button 
              onClick={() => deleteTodo(todo.id)}
              className="opacity-0 group-hover:opacity-100 p-1.5 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {todos.length === 0 && (
          <div className="text-muted text-sm italic mt-8 text-center">No tasks yet. You're all caught up!</div>
        )}
      </div>
    </div>
  );
}
