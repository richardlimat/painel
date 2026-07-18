import { useEffect, useMemo } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { computeStats } from '../../lib/filtering';
import { formatCompactCurrency } from '../../lib/format';
import { CompanyIcon, PersonIcon } from '../flow/icons';
import { FlowCanvas } from '../flow/FlowCanvas';

export function Workspace({ workspaceRef }: { workspaceRef: React.RefObject<HTMLDivElement> }) {
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const breadcrumb = useGraphStore((s) => s.breadcrumb);
  const nodeIndex = useGraphStore((s) => s.nodeIndex);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const maxDepth = useGraphStore((s) => s.maxDepth);
  const notice = useGraphStore((s) => s.notice);
  const clearNotice = useGraphStore((s) => s.clearNotice);
  const selectNode = useGraphStore((s) => s.selectNode);
  const focusNode = useGraphStore((s) => s.focusNode);

  const stats = useMemo(() => computeStats(nodes, links), [nodes, links]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clearNotice, 4000);
    return () => clearTimeout(t);
  }, [notice, clearNotice]);

  const selectedDepth = selectedNodeId ? nodeIndex.get(selectedNodeId)?.depth ?? stats.maxDepth : stats.maxDepth;

  return (
    <main className="workspace" ref={workspaceRef}>
      <FlowCanvas />
      <div className="kpis">
        <div className="kpi">
          <i>
            <CompanyIcon className="mini-building" />
          </i>
          <div>
            <b>{stats.totalCompanies}</b>
            <small>Empresas</small>
          </div>
        </div>
        <div className="kpi">
          <i style={{ color: '#24a86a', background: 'rgba(24,165,104,.14)' }}>
            <PersonIcon className="mini-building" />
          </i>
          <div>
            <b>{stats.totalPeople}</b>
            <small>Pessoas</small>
          </div>
        </div>
        <div className="kpi">
          <i style={{ color: '#8257e6', background: 'rgba(130,87,230,.14)' }}>⌁</i>
          <div>
            <b>{stats.totalLinks}</b>
            <small>Conexões</small>
          </div>
        </div>
        <div className="kpi">
          <i style={{ color: '#8257e6', background: 'rgba(130,87,230,.14)' }}>$</i>
          <div>
            <b>{formatCompactCurrency(stats.totalCapital)}</b>
            <small>Capital social</small>
          </div>
        </div>
      </div>

      {breadcrumb.length > 0 && (
        <div className="crumb" aria-label="Trilha de navegação">
          {breadcrumb.map((id, i) => {
            const node = nodeIndex.get(id);
            if (!node) return null;
            const last = i === breadcrumb.length - 1;
            return (
              <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                {i > 0 && <span>›</span>}
                <button
                  className={last ? 'last' : undefined}
                  onClick={() => {
                    selectNode(id);
                    focusNode(id);
                  }}
                  title={node.label}
                >
                  {last ? node.label : <b>{node.label}</b>}
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="level">
        Nível {selectedDepth} de {maxDepth === Infinity ? '∞' : maxDepth}
      </div>

      <div className={`toast ${notice ? 'show' : ''}`} role="status">
        {notice}
      </div>
    </main>
  );
}
