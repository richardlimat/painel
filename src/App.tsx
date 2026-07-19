import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from './store/graphStore';
import { SearchForm } from './components/SearchForm';
import { Topbar } from './components/painel/Topbar';
import { FiltersSidebar } from './components/painel/FiltersSidebar';
import { Workspace } from './components/painel/Workspace';
import { DetailsPanel } from './components/painel/DetailsPanel';
import { FullScreenProfile } from './components/painel/FullScreenProfile';

export default function App() {
  const rootId = useGraphStore((s) => s.rootId);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const panelMode = useGraphStore((s) => s.panelMode);
  const nodeIndex = useGraphStore((s) => s.nodeIndex);
  const selectNode = useGraphStore((s) => s.selectNode);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);

  // "Estatísticas" (Topbar) abre a lateral direita; clicar numa empresa/sócio
  // abre o perfil em tela cheia (FullScreenProfile), nunca mais a lateral.
  useEffect(() => {
    if (panelMode === 'stats') setRightOpen(true);
  }, [panelMode]);

  const selectedNode = selectedNodeId ? nodeIndex.get(selectedNodeId) : null;
  const showFullScreen = panelMode === 'entity' && !!selectedNode;

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
      {showFullScreen && selectedNode && (
        <FullScreenProfile node={selectedNode} onClose={() => selectNode(null)} />
      )}
    </div>
  );
}
