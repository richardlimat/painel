import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from './store/graphStore';
import { SearchForm } from './components/SearchForm';
import { Topbar } from './components/nexus/Topbar';
import { FiltersSidebar } from './components/nexus/FiltersSidebar';
import { Workspace } from './components/nexus/Workspace';
import { DetailsPanel } from './components/nexus/DetailsPanel';

export default function App() {
  const rootId = useGraphStore((s) => s.rootId);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const setTheme = useGraphStore((s) => s.setTheme);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);

  // acompanha mudanças de tema do sistema operacional
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('painel-theme')) setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setTheme]);

  // selecionar um nó abre o painel de detalhes automaticamente
  useEffect(() => {
    if (selectedNodeId) setRightOpen(true);
  }, [selectedNodeId]);

  if (!rootId) {
    return (
      <div className="h-screen bg-slate-100 dark:bg-slate-950">
        <SearchForm />
      </div>
    );
  }

  return (
    <div className={`nexus app ${leftOpen ? '' : 'left-collapsed'} ${rightOpen ? '' : 'right-collapsed'}`}>
      <Topbar
        workspaceRef={workspaceRef}
        onToggleFilters={() => setLeftOpen((v) => !v)}
        onToggleDetails={() => setRightOpen(true)}
      />
      <FiltersSidebar open={leftOpen} />
      <Workspace workspaceRef={workspaceRef} />
      <DetailsPanel open={rightOpen} onClose={() => setRightOpen(false)} />
    </div>
  );
}
