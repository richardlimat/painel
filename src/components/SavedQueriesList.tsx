import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useGraphStore } from '../store/graphStore';
import { deleteSavedQuery, getSavedQuery, listSavedQueries, type SavedQuerySummary } from '../services/savedQueries';
import { formatCNPJ, formatDate, normalizeText, onlyDigits } from '../lib/format';

function BookmarkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
      <path d="M14 10h5a1 1 0 0 1 1 1v10" />
      <path d="M9 8h.01M9 12h.01M9 16h.01" />
      <path d="M4 21h16" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Spinner() {
  return <span className="h-3 w-3 flex-none animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />;
}

/** Tela "Consultas salvas": listar (com busca), abrir (hidrata o grafo sem consultar as APIs) e excluir. */
export function SavedQueriesList({ onBack }: { onBack: () => void }) {
  const hydrateFromSnapshot = useGraphStore((s) => s.hydrateFromSnapshot);

  const [items, setItems] = useState<SavedQuerySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listSavedQueries();
        if (!cancelled) setItems(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar consultas salvas.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = normalizeText(query.trim());
    if (!q) return items;
    const qDigits = onlyDigits(query);
    return items.filter((item) => {
      const title = item.titulo?.trim() || item.cnpj_raiz;
      if (normalizeText(title).includes(q)) return true;
      if (qDigits && onlyDigits(item.cnpj_raiz).includes(qDigits)) return true;
      return false;
    });
  }, [items, query]);

  const handleOpen = async (id: string) => {
    setOpeningId(id);
    setError(null);
    try {
      const detail = await getSavedQuery(id);
      hydrateFromSnapshot(detail.snapshot, detail.photoUrlsByPersonId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao abrir a consulta.');
    } finally {
      setOpeningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta consulta salva? Esta ação não pode ser desfeita.')) return;
    setDeletingId(id);
    try {
      await deleteSavedQuery(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir a consulta.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex min-h-full flex-col items-center p-6 pt-10">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-3xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400 transition hover:text-cyan-600 dark:text-slate-500 dark:hover:text-cyan-400"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Voltar para consultas
        </button>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-cyan-400/20 text-cyan-600 dark:text-cyan-300">
                <BookmarkIcon />
              </span>
              Consultas salvas
            </h1>
            <p className="mt-1.5 pl-0.5 text-sm text-slate-500 dark:text-slate-400">
              {items.length === 0
                ? 'Suas consultas guardadas para acesso rápido aparecem aqui.'
                : `${items.length} consulta${items.length === 1 ? '' : 's'} guardada${items.length === 1 ? '' : 's'} para acesso rápido.`}
            </p>
          </div>

          {items.length > 0 && (
            <label className="flex w-full max-w-xs items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 shadow-md ring-1 ring-slate-200 focus-within:ring-cyan-300 dark:bg-slate-800 dark:ring-slate-700">
              <span className="flex-none text-slate-400">
                <SearchIcon />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome ou CNPJ"
                className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none dark:text-white"
                aria-label="Buscar consultas salvas"
              />
            </label>
          )}
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">{error}</p>
        )}

        {loading && (
          <ul className="space-y-3">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-[72px] animate-pulse rounded-2xl bg-white/70 ring-1 ring-slate-200 dark:bg-slate-800/50 dark:ring-slate-700" />
            ))}
          </ul>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-800/40">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <BookmarkIcon size={22} />
            </span>
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-200">
                {query ? 'Nenhuma consulta encontrada' : 'Nenhuma consulta salva ainda'}
              </p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-slate-400">
                {query
                  ? 'Tente buscar por outro nome ou CNPJ.'
                  : 'Suas consultas salvas vão aparecer aqui para você acessar rapidamente depois.'}
              </p>
            </div>
            {!query && (
              <button
                type="button"
                onClick={onBack}
                className="mt-1 flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-lg shadow-cyan-400/30 transition hover:bg-cyan-300"
              >
                <SearchIcon />
                Fazer uma nova consulta
              </button>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <ul className="space-y-3">
            {filtered.map((item) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-cyan-200 dark:bg-slate-800 dark:ring-slate-700 dark:hover:ring-cyan-500/30"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-slate-900 text-cyan-300 dark:bg-cyan-400/10 dark:text-cyan-300">
                    <BuildingIcon />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900 dark:text-white">
                      {item.titulo?.trim() || formatCNPJ(item.cnpj_raiz)}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-400">
                      <span className="font-mono tracking-tight">{formatCNPJ(item.cnpj_raiz)}</span>
                      <span aria-hidden>•</span>
                      <span>Salvo em {formatDate(item.created_at)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <button
                    type="button"
                    disabled={openingId === item.id}
                    onClick={() => void handleOpen(item.id)}
                    className="flex items-center gap-1.5 rounded-xl bg-cyan-400 px-3.5 py-2 text-xs font-bold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {openingId === item.id ? <Spinner /> : <OpenIcon />}
                    {openingId === item.id ? 'Abrindo…' : 'Abrir'}
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === item.id}
                    onClick={() => void handleDelete(item.id)}
                    className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3.5 py-2 text-xs font-bold text-red-500 transition hover:border-red-500 hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-400"
                  >
                    <TrashIcon />
                    Excluir
                  </button>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </motion.div>
    </div>
  );
}
