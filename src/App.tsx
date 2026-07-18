import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from './store/graphStore';
import { SearchForm } from './components/SearchForm';
import { Topbar } from './components/painel/Topbar';
import { FiltersSidebar } from './components/painel/FiltersSidebar';
import { Workspace } from './components/painel/Workspace';
import { DetailsPanel } from './components/painel/DetailsPanel';

export default function App() {
  const rootId = useGraphStore((s) => s.rootId);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);

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
    <div className={`painel app ${leftOpen ? '' : 'left-collapsed'} ${rightOpen ? '' : 'right-collapsed'}`}>
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
