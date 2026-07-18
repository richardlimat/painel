import { useMemo, useState } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { normalizeText, onlyDigits } from '../../lib/format';
import { exportCsv, exportJson, exportPdf, exportPng, exportSvg } from '../../lib/exporters';

interface Props {
  workspaceRef: React.RefObject<HTMLDivElement>;
  onToggleFilters: () => void;
  onToggleDetails: () => void;
}

export function Topbar({ workspaceRef, onToggleFilters, onToggleDetails }: Props) {
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);
  const focusNode = useGraphStore((s) => s.focusNode);
  const selectNode = useGraphStore((s) => s.selectNode);
  const setPanelMode = useGraphStore((s) => s.setPanelMode);
  const expandAll = useGraphStore((s) => s.expandAll);
  const collapseAll = useGraphStore((s) => s.collapseAll);
  const requestOrganize = useGraphStore((s) => s.requestOrganize);
  const loading = useGraphStore((s) => s.loading);
  const reset = useGraphStore((s) => s.reset);
  const notify = useGraphStore((s) => s.notify);

  const [searchOpen, setSearchOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const matches = useMemo(() => {
    const q = normalizeText(searchQuery.trim());
    const qDigits = onlyDigits(searchQuery);
    if (q.length < 2) return [];
    return nodes
      .filter((n) => {
        if (normalizeText(n.label).includes(q)) return true;
        if (n.company) {
          if (qDigits && onlyDigits(n.company.cnpj).includes(qDigits)) return true;
          if (n.company.nomeFantasia && normalizeText(n.company.nomeFantasia).includes(q)) return true;
        }
        if (n.person && qDigits.length >= 3 && onlyDigits(n.person.cpf).includes(qDigits)) return true;
        return false;
      })
      .slice(0, 8);
  }, [nodes, searchQuery]);

  const goTo = (id: string) => {
    selectNode(id);
    focusNode(id);
    setSearchOpen(false);
    notify('Entidade localizada e centralizada');
  };

  const doExport = async (kind: 'png' | 'svg' | 'pdf' | 'json' | 'csv') => {
    setExportOpen(false);
    const el = workspaceRef.current;
    try {
      setExporting(true);
      if (kind === 'json') exportJson(nodes, links);
      else if (kind === 'csv') exportCsv(nodes, links);
      else if (el) {
        if (kind === 'png') await exportPng(el);
        if (kind === 'svg') await exportSvg(el);
        if (kind === 'pdf') await exportPdf(el);
      }
      notify(`Exportação ${kind.toUpperCase()} concluída`);
    } catch {
      notify('Falha na exportação');
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <strong>Painel de Consultas</strong>
        <span>Inteligência Societária</span>
      </div>
      <label className="search">
        <svg className="icon" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <input
          value={searchQuery}
          placeholder="Buscar por nome, CNPJ ou CPF..."
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length > 0) goTo(matches[0].id);
          }}
          aria-label="Buscar no grafo"
        />
        {searchOpen && matches.length > 0 && (
          <div className="search-results">
            {matches.map((n) => (
              <button key={n.id} onMouseDown={() => goTo(n.id)}>
                {n.kind === 'company' ? '🏢' : '👤'} {n.label}
                <small>{n.kind === 'company' ? n.company?.cnpj : n.person?.cpf}</small>
              </button>
            ))}
          </div>
        )}
      </label>
      <div className="actions">
        <button className="btn plain" onClick={() => void expandAll()} disabled={loading} title="Expandir todos os nós até o limite de níveis">
          <svg className="icon" viewBox="0 0 24 24"><path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" /></svg>
          <span>{loading ? 'Expandindo…' : 'Expandir Tudo'}</span>
        </button>
        <button
          className="btn plain"
          onClick={() => {
            collapseAll();
            requestOrganize();
          }}
          title="Recolher para a empresa pesquisada e sócios diretos"
        >
          <svg className="icon" viewBox="0 0 24 24"><path d="M3 9h6V3M21 9h-6V3M3 15h6v6M21 15h-6v6" /></svg>
          <span>Recolher Tudo</span>
        </button>
        <button className="btn plain" onClick={() => { requestOrganize(); notify('Layout reorganizado'); }} title="Reorganizar automaticamente o layout">
          <svg className="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><circle cx="5" cy="5" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M6.5 6.5 10 10M17.5 6.5 14 10M6.5 17.5 10 14M17.5 17.5 14 14" /></svg>
          <span>Reorganizar</span>
        </button>
        <button className="btn plain" onClick={onToggleFilters} title="Filtros da rede">
          <svg className="icon" viewBox="0 0 24 24"><path d="M4 5h16M7 12h10M10 19h4" /></svg>
          <span>Filtros</span>
        </button>
        <button
          className="btn plain"
          onClick={() => {
            setPanelMode('stats');
            onToggleDetails();
          }}
          title="Estatísticas da rede"
        >
          <svg className="icon" viewBox="0 0 24 24"><path d="M5 20V11M11 20V5M17 20v-7M3 20h18" /></svg>
          <span>Estatísticas</span>
        </button>
        <div className="export-wrap">
          <button className="btn plain" onClick={() => setExportOpen((v) => !v)} disabled={exporting} title="Exportar grafo">
            <svg className="icon" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></svg>
            <span>{exporting ? 'Exportando…' : 'Exportar'}</span>
          </button>
          {exportOpen && (
            <div className="export-menu">
              <button onClick={() => void doExport('png')}>PNG (alta resolução)</button>
              <button onClick={() => void doExport('svg')}>SVG</button>
              <button onClick={() => void doExport('pdf')}>PDF (layout atual)</button>
              <button onClick={() => void doExport('json')}>JSON completo</button>
              <button onClick={() => void doExport('csv')}>CSV das conexões</button>
            </div>
          )}
        </div>
        <button className="btn plain" onClick={reset} title="Nova consulta">
          <svg className="icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          <span>Nova consulta</span>
        </button>
        <div className="avatar">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#6b7688" strokeWidth="2">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </div>
      </div>
    </header>
  );
}
