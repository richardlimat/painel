import { useMemo } from 'react';
import { useGraphStore } from '../store/graphStore';

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-slate-700 dark:text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      {label}
    </label>
  );
}

export function FilterPanel({ onClose }: { onClose: () => void }) {
  const filters = useGraphStore((s) => s.filters);
  const setFilters = useGraphStore((s) => s.setFilters);
  const resetFilters = useGraphStore((s) => s.resetFilters);
  const nodes = useGraphStore((s) => s.nodes);

  const ufs = useMemo(
    () => [...new Set(nodes.map((n) => n.company?.uf).filter((v): v is string => !!v))].sort(),
    [nodes],
  );
  const cnaes = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) {
      if (n.company?.cnaePrincipal) m.set(n.company.cnaePrincipal.codigo, n.company.cnaePrincipal.descricao);
    }
    return [...m.entries()].sort();
  }, [nodes]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Filtros</h2>
        <div className="flex gap-2">
          <button onClick={resetFilters} className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
            Limpar
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Fechar filtros">
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mostrar apenas</p>
        <Check label="Pessoas" checked={filters.showPeople} onChange={(v) => setFilters({ showPeople: v })} />
        <Check label="Empresas" checked={filters.showCompanies} onChange={(v) => setFilters({ showCompanies: v })} />
        <Check label="Empresas ativas" checked={filters.onlyActive} onChange={(v) => setFilters({ onlyActive: v, onlyBaixadas: false })} />
        <Check label="Empresas baixadas" checked={filters.onlyBaixadas} onChange={(v) => setFilters({ onlyBaixadas: v, onlyActive: false })} />
        <Check label="Administradores" checked={filters.onlyAdmins} onChange={(v) => setFilters({ onlyAdmins: v })} />
        <Check label="Sócios / participações" checked={filters.onlyPartners} onChange={(v) => setFilters({ onlyPartners: v })} />
        <Check label="Filiais" checked={filters.showBranches} onChange={(v) => setFilters({ showBranches: v })} />
        <Check label="Matrizes" checked={filters.showHeadquarters} onChange={(v) => setFilters({ showHeadquarters: v })} />

        <div className="mt-4">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Participação mínima: {filters.minParticipation > 0 ? `${filters.minParticipation}%` : 'sem filtro'}
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={filters.minParticipation}
            onChange={(e) => setFilters({ minParticipation: Number(e.target.value) })}
            className="w-full accent-indigo-600"
          />
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Estado (UF)</label>
          <select
            value={filters.uf}
            onChange={(e) => setFilters({ uf: e.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">Todos</option>
            {ufs.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">CNAE Principal</label>
          <select
            value={filters.cnae}
            onChange={(e) => setFilters({ cnae: e.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">Todos</option>
            {cnaes.map(([cod, desc]) => (
              <option key={cod} value={cod}>
                {cod} — {desc.slice(0, 40)}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Abertas após</label>
          <input
            type="date"
            value={filters.openedAfter}
            onChange={(e) => setFilters({ openedAfter: e.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
      </div>
    </div>
  );
}
