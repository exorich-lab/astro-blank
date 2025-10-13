import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ThemeToggle = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let initialTheme: 'light' | 'dark';
    if (savedTheme) {
      initialTheme = savedTheme;
    } else {
      initialTheme = systemPrefersDark ? 'dark' : 'light';
    }
    
    setTheme(initialTheme);
    // Apply theme to document immediately on mount
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    setMounted(true);
  }, []);

  const handleToggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // To prevent hydration mismatch, we render a placeholder on the server.
  // The actual component is rendered only on the client.
  if (!mounted) {
    return (
      <div className="size-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
    );
  }

  return (
    <button
      onClick={handleToggleTheme}
      className="relative w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={theme}
          initial={{ y: -20, opacity: 0, rotate: -90 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: 20, opacity: 0, rotate: 90 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          {theme === 'light' ? <Moon size={22} /> : <Sun size={22} />}
        </motion.div>
      </AnimatePresence>
    </button>
  );
};

export default ThemeToggle;
