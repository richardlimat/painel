import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGraphStore } from './store/graphStore';
import { GraphCanvas } from './components/GraphCanvas';
import { SearchForm } from './components/SearchForm';
import { SearchBar } from './components/SearchBar';
import { Toolbar } from './components/Toolbar';
import { SidePanel } from './components/SidePanel';
import { FilterPanel } from './components/FilterPanel';
import { StatsPanel } from './components/StatsPanel';
import { Timeline } from './components/Timeline';
import { Breadcrumb } from './components/Breadcrumb';
import { Legend } from './components/Legend';

type LeftPanel = 'filters' | 'stats' | 'timeline' | null;

export default function App() {
  const rootId = useGraphStore((s) => s.rootId);
  const notice = useGraphStore((s) => s.notice);
  const clearNotice = useGraphStore((s) => s.clearNotice);
  const setTheme = useGraphStore((s) => s.setTheme);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel>(null);

  // acompanha mudanças de tema do sistema operacional
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('painel-theme')) setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setTheme]);

  // avisos temporários
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clearNotice, 6000);
    return () => clearTimeout(t);
  }, [notice, clearNotice]);

  const toggle = (panel: LeftPanel) => setLeftPanel((p) => (p === panel ? null : panel));

  if (!rootId) {
    return (
      <div className="h-screen bg-slate-100 dark:bg-slate-950">
        <SearchForm />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-100 dark:bg-slate-950">
      <header className="z-20 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
        <h1 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          🕸️ <span className="hidden sm:inline">Mapeamento Societário</span>
        </h1>
        <SearchBar />
        <div className="ml-auto">
          <Toolbar
            graphContainerRef={graphContainerRef}
            onToggleFilters={() => toggle('filters')}
            onToggleStats={() => toggle('stats')}
            onToggleTimeline={() => toggle('timeline')}
          />
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <AnimatePresence>
          {leftPanel && (
            <motion.aside
              key={leftPanel}
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="absolute inset-y-0 left-0 z-20 w-full max-w-xs border-r border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:relative sm:shadow-none"
            >
              {leftPanel === 'filters' && <FilterPanel onClose={() => setLeftPanel(null)} />}
              {leftPanel === 'stats' && <StatsPanel onClose={() => setLeftPanel(null)} />}
              {leftPanel === 'timeline' && <Timeline onClose={() => setLeftPanel(null)} />}
            </motion.aside>
          )}
        </AnimatePresence>

        <main className="relative flex-1">
          <GraphCanvas containerRef={graphContainerRef} />
          <Breadcrumb />
          <Legend />
          <AnimatePresence>
            {notice && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-lg"
                role="status"
              >
                {notice}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <SidePanel />
      </div>
    </div>
  );
}
