import { useMemo, useState } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { computeStats } from '../../lib/filtering';
import { formatCurrency, formatDate } from '../../lib/format';
import { CompanyIcon, PersonIcon } from '../flow/icons';
import { QueueProgress } from './QueueProgress';
import type { TimelineEvent } from '../../types/graph';

const TL_COLORS: Record<TimelineEvent['kind'], string> = {
  abertura: '#111827',
  entrada_socio: '#6b7280',
  saida_socio: '#9ca3af',
  alteracao: '#d1d5db',
};

function DataRow({ icon, label, value }: { icon: string; label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <div className="data-row">
      <span className="data-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/**
 * Painel lateral de Estatísticas da Rede — a única coisa que ainda abre na
 * lateral direita. Detalhes de empresa/sócio agora abrem em tela cheia
 * (ver `FullScreenProfile`), disparados por `selectNode` em vez do modo
 * "stats" deste painel.
 */
export function DetailsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const timeline = useGraphStore((s) => s.timeline);
  const selectNode = useGraphStore((s) => s.selectNode);
  const focusNode = useGraphStore((s) => s.focusNode);

  const [statsTab, setStatsTab] = useState<'indicators' | 'timeline'>('indicators');

  const globalTimeline = useMemo(() => [...timeline].sort((a, b) => b.date.localeCompare(a.date)), [timeline]);
  const stats = useMemo(() => computeStats(nodes, links), [nodes, links]);

  const goTo = (id: string) => {
    selectNode(id);
    focusNode(id);
  };

  return (
    <aside className={`details ${open ? 'open' : ''}`} id="details">
      <QueueProgress />
      <div className="entity-head">
        <button className="close" onClick={onClose} aria-label="Fechar painel">
          ×
        </button>
        <div className="entity-icon" style={{ background: '#374151' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 20V11M11 20V5M17 20v-7M3 20h18" />
          </svg>
        </div>
        <div>
          <h2>Estatísticas da Rede</h2>
          <span className="status">{stats.totalLinks} conexões mapeadas</span>
        </div>
      </div>
      <div className="tabs">
        <button className={statsTab === 'indicators' ? 'active' : ''} onClick={() => setStatsTab('indicators')}>
          Indicadores
        </button>
        <button className={statsTab === 'timeline' ? 'active' : ''} onClick={() => setStatsTab('timeline')}>
          Linha do tempo
        </button>
      </div>
      <div className="details-scroll">
        {statsTab === 'indicators' ? (
          <div className="data">
            <div className="stat-cards">
              <div className="stat">
                <i style={{ color: '#374151', background: '#f3f4f6' }}>
                  <CompanyIcon className="mini-building" />
                </i>
                <div>
                  <b>{stats.totalCompanies}</b>
                  <small>empresas</small>
                </div>
              </div>
              <div className="stat">
                <i>
                  <PersonIcon className="mini-building" />
                </i>
                <div>
                  <b>{stats.totalPeople}</b>
                  <small>pessoas</small>
                </div>
              </div>
              <div className="stat">
                <i style={{ color: '#374151', background: '#f3f4f6' }}>⌁</i>
                <div>
                  <b>{stats.totalLinks}</b>
                  <small>conexões</small>
                </div>
              </div>
              <div className="stat">
                <i style={{ color: '#374151', background: '#f3f4f6' }}>≣</i>
                <div>
                  <b>{stats.maxDepth}</b>
                  <small>níveis mapeados</small>
                </div>
              </div>
              <div className="stat">
                <i>✓</i>
                <div>
                  <b>{stats.activeCompanies}</b>
                  <small>empresas ativas</small>
                </div>
              </div>
              <div className="stat">
                <i style={{ color: '#374151', background: '#f3f4f6' }}>✕</i>
                <div>
                  <b>{stats.baixadas}</b>
                  <small>empresas baixadas</small>
                </div>
              </div>
            </div>
            <DataRow icon="◉" label="Capital social somado" value={formatCurrency(stats.totalCapital)} />
            <DataRow icon="⌖" label="Estados envolvidos" value={stats.ufs.length > 0 ? stats.ufs.join(', ') : undefined} />
            <DataRow icon="⌂" label="Municípios envolvidos" value={stats.municipios.length} />
            <DataRow icon="⚑" label="CNAEs distintos" value={stats.cnaes.length} />
            {stats.cnaes.length > 0 && (
              <>
                <h4 className="subheading">CNAEs na rede</h4>
                {stats.cnaes.slice(0, 10).map((c) => (
                  <div className="owner-row" key={c}>
                    <i style={{ background: '#6b7280' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : (
          <div className="timeline-list">
            {globalTimeline.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>Nenhum evento registrado ainda.</p>
            )}
            {globalTimeline.map((ev, i) => (
              <button className="timeline-item" key={i} onClick={() => goTo(ev.nodeId)}>
                <span className="tl-dot" style={{ background: TL_COLORS[ev.kind] }} />
                <time>{formatDate(ev.date)}</time>
                <span>{ev.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
