import { useState } from 'react';
import { useGraphStore } from '../store/graphStore';
import { exportCsv, exportJson, exportPdf, exportPng, exportSvg } from '../lib/exporters';

interface Props {
  graphContainerRef: React.RefObject<HTMLDivElement>;
  onToggleFilters: () => void;
  onToggleStats: () => void;
  onToggleTimeline: () => void;
}

function ToolButton({ onClick, title, children, disabled }: { onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  );
}

export function Toolbar({ graphContainerRef, onToggleFilters, onToggleStats, onToggleTimeline }: Props) {
  const expandAll = useGraphStore((s) => s.expandAll);
  const collapseAll = useGraphStore((s) => s.collapseAll);
  const loading = useGraphStore((s) => s.loading);
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const theme = useGraphStore((s) => s.theme);
  const setTheme = useGraphStore((s) => s.setTheme);
  const maxDepth = useGraphStore((s) => s.maxDepth);
  const setMaxDepth = useGraphStore((s) => s.setMaxDepth);
  const reset = useGraphStore((s) => s.reset);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const doExport = async (kind: 'png' | 'svg' | 'pdf' | 'json' | 'csv') => {
    setExportOpen(false);
    const el = graphContainerRef.current;
    try {
      setExporting(true);
      if (kind === 'json') exportJson(nodes, links);
      else if (kind === 'csv') exportCsv(nodes, links);
      else if (el) {
        if (kind === 'png') await exportPng(el);
        if (kind === 'svg') await exportSvg(el);
        if (kind === 'pdf') await exportPdf(el);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ToolButton onClick={() => void expandAll()} title="Expandir todos os nós até o limite de níveis" disabled={loading}>
        {loading ? '⏳ Expandindo…' : '⤢ Expandir Tudo'}
      </ToolButton>
      <ToolButton onClick={collapseAll} title="Recolher para a empresa pesquisada e seus sócios diretos">
        ⤡ Recolher Tudo
      </ToolButton>

      <label className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
        Níveis
        <select
          value={maxDepth === Infinity ? 'inf' : maxDepth}
          onChange={(e) => setMaxDepth(e.target.value === 'inf' ? Infinity : Number(e.target.value))}
          className="bg-transparent text-xs focus:outline-none dark:bg-slate-800"
          aria-label="Limite de níveis de expansão"
        >
          {[2, 3, 5, 10].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
          <option value="inf">Ilimitado</option>
        </select>
      </label>

      <ToolButton onClick={onToggleFilters} title="Filtros dinâmicos">☰ Filtros</ToolButton>
      <ToolButton onClick={onToggleStats} title="Estatísticas da rede">📊 Estatísticas</ToolButton>
      <ToolButton onClick={onToggleTimeline} title="Linha do tempo societária">🕑 Timeline</ToolButton>

      <div className="relative">
        <ToolButton onClick={() => setExportOpen((v) => !v)} title="Exportar grafo" disabled={exporting}>
          {exporting ? '⏳' : '⬇ Exportar'}
        </ToolButton>
        {exportOpen && (
          <ul className="absolute right-0 top-full z-40 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white text-xs shadow-xl dark:border-slate-700 dark:bg-slate-800">
            {(
              [
                ['png', 'PNG (alta resolução)'],
                ['svg', 'SVG'],
                ['pdf', 'PDF (layout atual)'],
                ['json', 'JSON completo'],
                ['csv', 'CSV das conexões'],
              ] as const
            ).map(([kind, label]) => (
              <li key={kind}>
                <button
                  onClick={() => void doExport(kind)}
                  className="w-full px-3 py-2 text-left text-slate-700 hover:bg-indigo-50 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ToolButton onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Alternar tema claro/escuro">
        {theme === 'dark' ? '☀️' : '🌙'}
      </ToolButton>
      <ToolButton onClick={reset} title="Nova consulta">↩ Nova consulta</ToolButton>
    </div>
  );
}
