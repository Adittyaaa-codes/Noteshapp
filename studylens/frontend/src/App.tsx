import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Notes from './pages/Notes';
import Todos from './pages/Todos';

function App() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check initial theme from OS
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDark(true);
    }
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <Router>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground transition-colors duration-200">
        <Sidebar isDark={isDark} toggleTheme={() => setIsDark(!isDark)} />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/notes/*" element={<Notes />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
