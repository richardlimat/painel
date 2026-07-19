import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useGraphStore } from '../store/graphStore';
import { deleteSavedQuery, getSavedQuery, listSavedQueries, type SavedQuerySummary } from '../services/savedQueries';

/** Tela "Consultas salvas": listar, abrir (hidrata o grafo sem consultar as APIs) e excluir. */
export function SavedQueriesList({ onBack }: { onBack: () => void }) {
  const hydrateFromSnapshot = useGraphStore((s) => s.hydrateFromSnapshot);

  const [items, setItems] = useState<SavedQuerySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

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
    try {
      await deleteSavedQuery(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir a consulta.');
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Consultas salvas</h1>
          <button type="button" onClick={onBack} className="text-sm text-slate-500 hover:underline dark:text-slate-400">
            Voltar
          </button>
        </div>

        {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>}
        {error && (
          <p className="mb-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">{error}</p>
        )}
        {!loading && items.length === 0 && !error && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma consulta salva ainda.</p>
        )}

        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700"
            >
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{item.titulo ?? item.cnpj_raiz}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{item.cnpj_raiz}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={openingId === item.id}
                  onClick={() => void handleOpen(item.id)}
                  className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {openingId === item.id ? 'Abrindo…' : 'Abrir'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(item.id)}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
