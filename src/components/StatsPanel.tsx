import { useMemo } from 'react';
import { useGraphStore } from '../store/graphStore';
import { computeStats } from '../lib/filtering';
import { formatCurrency } from '../lib/format';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60">
      <div className="text-lg font-semibold leading-tight text-slate-900 dark:text-white">{value}</div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

export function StatsPanel({ onClose }: { onClose: () => void }) {
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const stats = useMemo(() => computeStats(nodes, links), [nodes, links]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Estatísticas da Rede</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Fechar estatísticas">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Empresas" value={stats.totalCompanies} />
          <Stat label="Pessoas" value={stats.totalPeople} />
          <Stat label="Conexões" value={stats.totalLinks} />
          <Stat label="Níveis (camadas)" value={stats.maxDepth} />
          <Stat label="Empresas ativas" value={stats.activeCompanies} />
          <Stat label="Empresas baixadas" value={stats.baixadas} />
          <Stat label="Estados" value={stats.ufs.length} />
          <Stat label="Municípios" value={stats.municipios.length} />
        </div>
        <div className="mt-3 rounded-lg bg-indigo-50 p-3 dark:bg-indigo-900/30">
          <div className="text-[11px] font-medium uppercase tracking-wide text-indigo-500 dark:text-indigo-300">
            Capital social somado
          </div>
          <div className="text-lg font-semibold text-indigo-800 dark:text-indigo-200">{formatCurrency(stats.totalCapital)}</div>
        </div>
        {stats.ufs.length > 0 && (
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Estados:</span> {stats.ufs.join(', ')}
          </div>
        )}
        {stats.cnaes.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              CNAEs distintos ({stats.cnaes.length})
            </div>
            <ul className="space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
              {stats.cnaes.slice(0, 12).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
