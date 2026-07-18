import { useMemo } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { LINK_COLORS, NODE_LEGEND, RELATION_LABELS } from '../../lib/colors';
import { CompanyIcon, PersonIcon } from '../flow/icons';
import type { RelationType } from '../../types/graph';

function FilterRow({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string;
  icon?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="filter-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {icon && <span className="filter-icon">{icon}</span>}
      {label}
      <span className="switch" />
    </label>
  );
}

export function FiltersSidebar({ open }: { open: boolean }) {
  const filters = useGraphStore((s) => s.filters);
  const setFilters = useGraphStore((s) => s.setFilters);
  const resetFilters = useGraphStore((s) => s.resetFilters);
  const maxDepth = useGraphStore((s) => s.maxDepth);
  const setMaxDepth = useGraphStore((s) => s.setMaxDepth);
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
    <aside className={`filters ${open ? 'open' : ''}`} id="filters">
      <div className="section-title">
        <b>Filtros da rede</b>
        <button className="btn plain" style={{ padding: '2px 8px', fontSize: 11 }} onClick={resetFilters}>
          Limpar
        </button>
      </div>

      <FilterRow
        label="Pessoas"
        icon={<PersonIcon className="filter-icon" />}
        checked={filters.showPeople}
        onChange={(v) => setFilters({ showPeople: v })}
      />
      <FilterRow
        label="Empresas"
        icon={<CompanyIcon className="filter-icon" />}
        checked={filters.showCompanies}
        onChange={(v) => setFilters({ showCompanies: v })}
      />
      <FilterRow
        label="Somente ativas"
        icon={<span style={{ color: '#6b7280' }}>●</span>}
        checked={filters.onlyActive}
        onChange={(v) => setFilters({ onlyActive: v, onlyBaixadas: false })}
      />
      <FilterRow
        label="Somente baixadas"
        icon={<span style={{ color: '#6b7280' }}>●</span>}
        checked={filters.onlyBaixadas}
        onChange={(v) => setFilters({ onlyBaixadas: v, onlyActive: false })}
      />
      <FilterRow
        label="Administradores"
        icon={<span style={{ color: '#6b7280' }}>●</span>}
        checked={filters.onlyAdmins}
        onChange={(v) => setFilters({ onlyAdmins: v })}
      />
      <FilterRow
        label="Sócios / participações"
        icon={<span style={{ color: '#6b7280' }}>●</span>}
        checked={filters.onlyPartners}
        onChange={(v) => setFilters({ onlyPartners: v })}
      />
      <FilterRow
        label="Filiais"
        icon={<span style={{ color: '#6b7280' }}>●</span>}
        checked={filters.showBranches}
        onChange={(v) => setFilters({ showBranches: v })}
      />
      <FilterRow
        label="Matrizes"
        icon={<span style={{ color: '#6b7280' }}>⌘</span>}
        checked={filters.showHeadquarters}
        onChange={(v) => setFilters({ showHeadquarters: v })}
      />

      <div className="rule" />
      <div className="label-line">
        <span>Participação mínima</span>
        <b>{filters.minParticipation > 0 ? `${filters.minParticipation}%` : 'sem filtro'}</b>
      </div>
      <input
        className="range"
        type="range"
        min={0}
        max={100}
        step={5}
        value={filters.minParticipation}
        onChange={(e) => setFilters({ minParticipation: Number(e.target.value) })}
      />

      <div className="rule" />
      <div className="label-line">
        <span>Profundidade</span>
      </div>
      <select
        value={maxDepth === Infinity ? 'inf' : maxDepth}
        onChange={(e) => setMaxDepth(e.target.value === 'inf' ? Infinity : Number(e.target.value))}
        aria-label="Limite de níveis de expansão"
      >
        <option value={2}>2 níveis</option>
        <option value={3}>3 níveis</option>
        <option value={5}>5 níveis</option>
        <option value={10}>10 níveis</option>
        <option value="inf">Ilimitado</option>
      </select>

      <div className="rule" />
      <div className="label-line">
        <span>Estado (UF)</span>
      </div>
      <select value={filters.uf} onChange={(e) => setFilters({ uf: e.target.value })}>
        <option value="">Todos</option>
        {ufs.map((uf) => (
          <option key={uf} value={uf}>
            {uf}
          </option>
        ))}
      </select>

      <div className="label-line">
        <span>CNAE Principal</span>
      </div>
      <select value={filters.cnae} onChange={(e) => setFilters({ cnae: e.target.value })}>
        <option value="">Todos</option>
        {cnaes.map(([cod, desc]) => (
          <option key={cod} value={cod}>
            {cod} — {desc.slice(0, 34)}
          </option>
        ))}
      </select>

      <div className="label-line">
        <span>Abertas após</span>
      </div>
      <input type="date" value={filters.openedAfter} onChange={(e) => setFilters({ openedAfter: e.target.value })} />

      <div className="rule" />
      <div className="label-line">
        <b>Legenda</b>
      </div>
      <div className="legend">
        {NODE_LEGEND.map((item) => (
          <div key={item.label}>
            <i
              style={{
                background: item.visual.bg,
                border: `1.5px ${item.dashed ? 'dashed' : 'solid'} ${item.visual.border}`,
              }}
            />
            {item.label}
          </div>
        ))}
      </div>
      <div className="rule" />
      <div className="label-line">
        <b>Conexões</b>
      </div>
      <div className="legend">
        {(Object.keys(LINK_COLORS) as RelationType[]).map((type) => (
          <div key={type}>
            <i className="line-sample" style={{ background: LINK_COLORS[type], borderRadius: 2, height: 3, width: 14 }} />
            {RELATION_LABELS[type]}
          </div>
        ))}
      </div>
    </aside>
  );
}
