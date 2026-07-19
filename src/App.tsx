import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from './store/graphStore';
import { useAuthStore } from './store/authStore';
import { SearchForm } from './components/SearchForm';
import { LoginForm } from './components/LoginForm';
import { LoadingScreen } from './components/LoadingScreen';
import { SavedQueriesList } from './components/SavedQueriesList';
import { Topbar } from './components/painel/Topbar';
import { FiltersSidebar } from './components/painel/FiltersSidebar';
import { Workspace } from './components/painel/Workspace';
import { DetailsPanel } from './components/painel/DetailsPanel';

export default function App() {
  const rootId = useGraphStore((s) => s.rootId);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const loading = useGraphStore((s) => s.loading);
  const authStatus = useAuthStore((s) => s.status);
  const checkSession = useAuthStore((s) => s.checkSession);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  const [view, setView] = useState<'search' | 'saved'>('search');

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  // selecionar um nó abre o painel de detalhes automaticamente
  useEffect(() => {
    if (selectedNodeId) setRightOpen(true);
  }, [selectedNodeId]);

  if (authStatus === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        Verificando sessão…
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <div className="h-screen bg-slate-100 dark:bg-slate-950">
        <LoginForm />
      </div>
    );
  }

  if (!rootId) {
    if (loading) {
      return (
        <div className="h-screen bg-slate-100 dark:bg-slate-950">
          <LoadingScreen />
        </div>
      );
    }
    return (
      <div className="flex h-screen flex-col bg-slate-100 dark:bg-slate-950">
        <div className="h-2 w-full flex-none bg-gradient-to-r from-red-950 via-red-900 to-red-950" />
        <div className="flex items-center justify-end gap-3 px-4 py-2 text-sm text-slate-500 dark:text-slate-400">
          {user?.nome && <span>{user.nome}</span>}
          <button type="button" onClick={() => void logout()} className="hover:underline">
            Sair
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {view === 'saved' ? (
            <SavedQueriesList onBack={() => setView('search')} />
          ) : (
            <SearchForm onOpenSavedQueries={() => setView('saved')} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`painel app ${leftOpen ? '' : 'left-collapsed'} ${rightOpen ? '' : 'right-collapsed'}`}>
      <Topbar
        workspaceRef={workspaceRef}
        onToggleFilters={() => setLeftOpen((v) => !v)}
        onNavigateToSearch={() => setView('search')}
        onNavigateToSaved={() => setView('saved')}
      />
      <FiltersSidebar open={leftOpen} />
      <Workspace workspaceRef={workspaceRef} />
      <DetailsPanel open={rightOpen} onClose={() => setRightOpen(false)} />
    </div>
  );
}
