import { useMemo, useState } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { computeStats } from '../../lib/filtering';
import { formatCNPJ, formatCurrency, formatDate } from '../../lib/format';
import { RELATION_LABELS } from '../../lib/colors';
import { CompanyIcon, PersonIcon } from '../flow/icons';
import type { GraphLink, GraphNode, TimelineEvent } from '../../types/graph';

const nid = (v: string | GraphNode) => (typeof v === 'string' ? v : v.id);

const OWNERSHIP_SHADES = ['#07996b', '#49b584', '#82c9a5', '#b7dfc9', '#d7ecdf', '#e8f4ec'];

const TL_COLORS: Record<TimelineEvent['kind'], string> = {
  abertura: '#1671f9',
  entrada_socio: '#18a568',
  saida_socio: '#f04e57',
  alteracao: '#f5a12c',
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

export function DetailsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodeIndex = useGraphStore((s) => s.nodeIndex);
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const timeline = useGraphStore((s) => s.timeline);
  const panelMode = useGraphStore((s) => s.panelMode);
  const selectNode = useGraphStore((s) => s.selectNode);
  const focusNode = useGraphStore((s) => s.focusNode);
  const expandNode = useGraphStore((s) => s.expandNode);
  const expandingIds = useGraphStore((s) => s.expandingIds);

  const [entityTab, setEntityTab] = useState<'overview' | 'partners' | 'history'>('overview');
  const [statsTab, setStatsTab] = useState<'indicators' | 'timeline'>('indicators');

  const node = selectedNodeId ? nodeIndex.get(selectedNodeId) : null;
  const showEntity = panelMode === 'entity' && node;

  const related = useMemo(() => {
    if (!node) return [];
    return links
      .filter((l) => nid(l.source) === node.id || nid(l.target) === node.id)
      .map((l) => {
        const otherId = nid(l.source) === node.id ? nid(l.target) : nid(l.source);
        return { link: l, other: nodeIndex.get(otherId) };
      })
      .filter((r): r is { link: GraphLink; other: GraphNode } => !!r.other);
  }, [node, links, nodeIndex]);

  const relatedCompanies = related.filter((r) => r.other.kind === 'company');
  const relatedPeople = related.filter((r) => r.other.kind === 'person');

  const ownership = useMemo(() => {
    if (!node || node.kind !== 'company') return [];
    return relatedPeople
      .filter((r) => r.link.meta.percentual)
      .sort((a, b) => (b.link.meta.percentual ?? 0) - (a.link.meta.percentual ?? 0))
      .slice(0, 6);
  }, [node, relatedPeople]);

  const nodeHistory = useMemo(
    () => (node ? timeline.filter((t) => t.nodeId === node.id).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [node, timeline],
  );

  const globalTimeline = useMemo(() => [...timeline].sort((a, b) => b.date.localeCompare(a.date)), [timeline]);
  const stats = useMemo(() => computeStats(nodes, links), [nodes, links]);

  const situacao = node?.company?.situacao;
  const statusClass = situacao === 'ATIVA' ? '' : situacao === 'BAIXADA' ? 'bad' : 'off';

  const goTo = (id: string) => {
    selectNode(id);
    focusNode(id);
  };

  return (
    <aside className={`details ${open ? 'open' : ''}`} id="details">
      {showEntity ? (
        <>
          <div className="entity-head">
            <button className="close" onClick={onClose} aria-label="Fechar painel">
              ×
            </button>
            <div
              className="entity-icon"
              style={{
                background:
                  node.kind === 'person'
                    ? node.person?.administrador
                      ? 'var(--amber)'
                      : 'var(--green)'
                    : situacao === 'BAIXADA'
                      ? 'var(--red)'
                      : 'var(--blue)',
              }}
            >
              {node.kind === 'person' ? <PersonIcon /> : <CompanyIcon />}
            </div>
            <div>
              <h2>{node.label}</h2>
              {node.kind === 'company' ? (
                <span className={`status ${statusClass}`}>{situacao ?? 'DESCONHECIDA'}</span>
              ) : (
                <span className="status">{node.person?.administrador ? 'ADMINISTRADOR' : 'PESSOA FÍSICA'}</span>
              )}
              <div className="cnpj">
                {node.kind === 'company' ? formatCNPJ(node.company?.cnpj ?? '') : node.person?.cpf}
                {' · '}Camada {node.depth}
              </div>
            </div>
          </div>
          <div className="tabs">
            <button className={entityTab === 'overview' ? 'active' : ''} onClick={() => setEntityTab('overview')}>
              Visão geral
            </button>
            <button className={entityTab === 'partners' ? 'active' : ''} onClick={() => setEntityTab('partners')}>
              {node.kind === 'company' ? 'Sócios' : 'Participações'}
            </button>
            <button className={entityTab === 'history' ? 'active' : ''} onClick={() => setEntityTab('history')}>
              Histórico
            </button>
          </div>
          <div className="details-scroll">
            {entityTab === 'overview' && (
              <>
                <div className="data">
                  {node.kind === 'company' && node.company ? (
                    <>
                      <DataRow icon="◉" label="Capital social" value={formatCurrency(node.company.capitalSocial)} />
                      <DataRow icon="▦" label="Abertura" value={formatDate(node.company.dataAbertura)} />
                      <DataRow
                        icon="⚑"
                        label="CNAE"
                        value={
                          node.company.cnaePrincipal
                            ? `${node.company.cnaePrincipal.codigo} — ${node.company.cnaePrincipal.descricao}`
                            : undefined
                        }
                      />
                      {node.company.cnaesSecundarios && node.company.cnaesSecundarios.length > 0 && (
                        <DataRow
                          icon="⚐"
                          label="CNAEs secundários"
                          value={node.company.cnaesSecundarios.map((c) => c.codigo).join(', ')}
                        />
                      )}
                      <DataRow icon="§" label="Natureza jurídica" value={node.company.naturezaJuridica} />
                      <DataRow icon="⌖" label="Endereço" value={node.company.endereco} />
                      <DataRow
                        icon="⌂"
                        label="Município"
                        value={[node.company.municipio, node.company.uf].filter(Boolean).join(' · ')}
                      />
                      <DataRow icon="✆" label="Telefone" value={node.company.telefone} />
                      <DataRow icon="✉" label="E-mail" value={node.company.email} />
                      <DataRow
                        icon="⌘"
                        label="Matriz / Filial"
                        value={node.company.matriz == null ? undefined : node.company.matriz ? 'Matriz' : 'Filial'}
                      />
                      <div className="stat-cards">
                        <div className="stat">
                          <i>
                            <PersonIcon className="mini-building" />
                          </i>
                          <div>
                            <b>{relatedPeople.length}</b>
                            <small>sócios</small>
                          </div>
                        </div>
                        <div className="stat">
                          <i style={{ color: '#1671f9', background: '#edf5ff' }}>
                            <CompanyIcon className="mini-building" />
                          </i>
                          <div>
                            <b>{relatedCompanies.length}</b>
                            <small>empresas relacionadas</small>
                          </div>
                        </div>
                      </div>
                      {ownership.length > 0 && (
                        <>
                          <h4 className="subheading">Participação de sócios</h4>
                          <div className="ownership">
                            {ownership.map((o, i) => (
                              <i
                                key={o.link.id}
                                style={{
                                  width: `${o.link.meta.percentual}%`,
                                  background: OWNERSHIP_SHADES[i % OWNERSHIP_SHADES.length],
                                }}
                              />
                            ))}
                          </div>
                          {ownership.map((o, i) => (
                            <div className="owner-row" key={o.link.id}>
                              <i style={{ background: OWNERSHIP_SHADES[i % OWNERSHIP_SHADES.length] }} />
                              {o.other.label}
                              <strong>{o.link.meta.percentual}%</strong>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <DataRow icon="◉" label="Nome" value={node.person?.nome} />
                      <DataRow icon="§" label="CPF" value={node.person?.cpf} />
                      <DataRow icon="⚑" label="Administrador" value={node.person?.administrador ? 'Sim' : 'Não'} />
                      <DataRow
                        icon="⌘"
                        label="Funções exercidas"
                        value={[...new Set(related.map((r) => r.link.meta.funcao ?? RELATION_LABELS[r.link.type]))].join(
                          ' · ',
                        )}
                      />
                      <div className="stat-cards">
                        <div className="stat">
                          <i style={{ color: '#1671f9', background: '#edf5ff' }}>
                            <CompanyIcon className="mini-building" />
                          </i>
                          <div>
                            <b>{relatedCompanies.length}</b>
                            <small>participações</small>
                          </div>
                        </div>
                        <div className="stat">
                          <i>
                            <PersonIcon className="mini-building" />
                          </i>
                          <div>
                            <b>{node.depth}</b>
                            <small>camada na rede</small>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="connections">
                  <h4 className="subheading" style={{ marginTop: 0 }}>
                    Principais conexões
                  </h4>
                  {related.slice(0, 6).map(({ link, other }) => (
                    <button className="connection" key={link.id} onClick={() => goTo(other.id)}>
                      <span
                        className="tiny-avatar"
                        style={
                          other.kind === 'company'
                            ? { background: other.company?.situacao === 'BAIXADA' ? '#f04e57' : '#1671f9', color: '#fff' }
                            : undefined
                        }
                      >
                        {other.kind === 'company' ? (
                          <CompanyIcon className="tiny-company-icon" />
                        ) : (
                          <PersonIcon className="tiny-company-icon" />
                        )}
                      </span>
                      <span className="conn-label">{other.label}</span>
                      <span className="tag">{link.meta.funcao ?? RELATION_LABELS[link.type]}</span>
                      {link.meta.percentual != null && <b>{link.meta.percentual}%</b>}
                    </button>
                  ))}
                </div>
              </>
            )}

            {entityTab === 'partners' && (
              <div className="connections" style={{ borderTop: 0 }}>
                {related.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Nenhuma conexão carregada.</p>}
                {related.map(({ link, other }) => (
                  <button className="connection" key={link.id} onClick={() => goTo(other.id)}>
                    <span
                      className="tiny-avatar"
                      style={
                        other.kind === 'company'
                          ? { background: other.company?.situacao === 'BAIXADA' ? '#f04e57' : '#1671f9', color: '#fff' }
                          : undefined
                      }
                    >
                      {other.kind === 'company' ? (
                        <CompanyIcon className="tiny-company-icon" />
                      ) : (
                        <PersonIcon className="tiny-company-icon" />
                      )}
                    </span>
                    <span className="conn-label">
                      {other.label}
                      {link.meta.dataEntrada && (
                        <small style={{ display: 'block', color: 'var(--muted)' }}>
                          desde {formatDate(link.meta.dataEntrada)}
                          {link.meta.situacao === 'RETIRADO' ? ' · retirado' : ''}
                        </small>
                      )}
                    </span>
                    <span className="tag">{link.meta.funcao ?? RELATION_LABELS[link.type]}</span>
                    {link.meta.percentual != null && <b>{link.meta.percentual}%</b>}
                  </button>
                ))}
              </div>
            )}

            {entityTab === 'history' && (
              <div className="timeline-list">
                {nodeHistory.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>Nenhum evento registrado para esta entidade.</p>
                )}
                {nodeHistory.map((ev, i) => (
                  <div className="timeline-item" key={i}>
                    <span className="tl-dot" style={{ background: TL_COLORS[ev.kind] }} />
                    <time>{formatDate(ev.date)}</time>
                    <span>{ev.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            className="btn primary details-cta"
            onClick={() => {
              if (!node.expanded) void expandNode(node.id);
              else focusNode(node.id);
            }}
            disabled={expandingIds.has(node.id)}
          >
            {expandingIds.has(node.id)
              ? 'Expandindo…'
              : !node.expanded
                ? 'Expandir conexões ↗'
                : 'Centralizar no mapa ↗'}
          </button>
        </>
      ) : (
        <>
          <div className="entity-head">
            <button className="close" onClick={onClose} aria-label="Fechar painel">
              ×
            </button>
            <div className="entity-icon" style={{ background: 'var(--purple)' }}>
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
                    <i style={{ color: '#1671f9', background: '#edf5ff' }}>
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
                    <i style={{ color: '#8257e6', background: '#f2edff' }}>⌁</i>
                    <div>
                      <b>{stats.totalLinks}</b>
                      <small>conexões</small>
                    </div>
                  </div>
                  <div className="stat">
                    <i style={{ color: '#ff762a', background: '#fff3ec' }}>≣</i>
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
                    <i style={{ color: '#f04e57', background: '#fff1f2' }}>✕</i>
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
                        <i style={{ background: '#1671f9' }} />
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
        </>
      )}
    </aside>
  );
}
