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
import { EntityDetail } from './components/painel/EntityDetail';

export default function App() {
  const rootId = useGraphStore((s) => s.rootId);
  const loading = useGraphStore((s) => s.loading);
  const authStatus = useAuthStore((s) => s.status);
  const checkSession = useAuthStore((s) => s.checkSession);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [view, setView] = useState<'search' | 'saved'>('search');

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

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
        <div className="flex flex-none items-center justify-end gap-4 px-5 py-3">
          {user?.nome && (
            <span className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
                </svg>
              </span>
              {user.nome}
            </span>
          )}
          <button
            type="button"
            onClick={() => void logout()}
            className="group flex flex-none items-center gap-2 rounded-full bg-white py-1 pl-1 pr-4 text-xs font-extrabold uppercase tracking-wide text-red-500 shadow-md shadow-slate-900/10 ring-1 ring-slate-900/5 transition hover:shadow-lg hover:shadow-red-500/20 active:scale-95 dark:bg-slate-800 dark:text-red-400 dark:ring-white/10"
          >
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-red-50 text-red-500 transition group-hover:bg-red-500 group-hover:text-white dark:bg-red-500/10 dark:text-red-400">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M9 5l6 7-6 7" />
              </svg>
            </span>
            Sair
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
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
    <div className={`painel app right-collapsed ${leftOpen ? '' : 'left-collapsed'}`}>
      <Topbar
        workspaceRef={workspaceRef}
        onToggleFilters={() => setLeftOpen((v) => !v)}
        onNavigateToSearch={() => setView('search')}
        onNavigateToSaved={() => setView('saved')}
      />
      <FiltersSidebar open={leftOpen} onCollapse={() => setLeftOpen(false)} />
      <Workspace workspaceRef={workspaceRef} />
      <EntityDetail />
    </div>
  );
}
