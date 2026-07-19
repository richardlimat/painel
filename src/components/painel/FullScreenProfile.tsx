import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { usePersonProfileStore } from '../../store/personProfileStore';
import { companyToProfileSource, groupServiceResponse, PROFILE_CATEGORY_NAMES, type ProfileCategoryGroup } from '../../lib/profileCategories';
import { formatCNPJ, formatCurrency, formatDate, normalizeText } from '../../lib/format';
import { RELATION_LABELS } from '../../lib/colors';
import { CompanyIcon, PersonIcon } from '../flow/icons';
import { CollapsibleSection } from './CollapsibleSection';
import { QueueProgress } from './QueueProgress';
import { RenderValue, categoryRecordCount, countRecords, entryMatchesQuery, highlightMatch } from './ProfileFieldRenderer';
import type { GraphLink, GraphNode, TimelineEvent } from '../../types/graph';

const nid = (v: string | GraphNode) => (typeof v === 'string' ? v : v.id);

const TL_COLORS: Record<TimelineEvent['kind'], string> = {
  abertura: '#111827',
  entrada_socio: '#6b7280',
  saida_socio: '#9ca3af',
  alteracao: '#d1d5db',
};

/** Ícone textual discreto por página — mesmo estilo minimalista dos glifos já usados em DataRow. */
const TAB_ICONS: Record<string, string> = {
  'Cadastral & Civil': '◉',
  'Contatos & Endereços': '✉',
  'Financeiro & Consumo': '◈',
  'Carreira & Negócios': '⌘',
  'Cyber Sec & Vazamentos': '⛨',
  'Presença & Viagens': '✈',
  'Bens & Patrimônio': '⌂',
  'Saúde & Outros': '✚',
};

function CategoryPage({
  group,
  query,
  extra,
  maskSoft,
}: {
  group: ProfileCategoryGroup;
  query: string;
  extra?: ReactNode;
  maskSoft: boolean;
}) {
  return (
    <div className="fsp-category-page">
      {extra}
      {group.entries.length === 0 && !extra && <p className="profile-status">Nenhum registro encontrado.</p>}
      {group.entries.map(([key, value]) => (
        <CollapsibleSection key={key} title={highlightMatch(key, query)} count={countRecords(value)} forceOpen={!!query}>
          <RenderValue label={key} keyName={key} value={value} depth={0} query={query} maskSoft={maskSoft} />
        </CollapsibleSection>
      ))}
    </div>
  );
}

/**
 * Painel de detalhes em tela cheia (substitui o antigo painel lateral para
 * empresas e sócios): organiza tudo que se sabe sobre a entidade em 8
 * páginas fixas. Pessoas usam o perfil completo da APIFull; empresas usam
 * os campos estruturados de `CompanyData` remapeados pra mesma forma
 * (`companyToProfileSource`) — assim as duas usam o mesmo renderizador e
 * a mesma taxonomia, sem duplicar lógica de categorização.
 */
export function FullScreenProfile({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const nodeIndex = useGraphStore((s) => s.nodeIndex);
  const links = useGraphStore((s) => s.links);
  const timeline = useGraphStore((s) => s.timeline);
  const selectNode = useGraphStore((s) => s.selectNode);
  const focusNode = useGraphStore((s) => s.focusNode);
  const expandNode = useGraphStore((s) => s.expandNode);
  const expandingIds = useGraphStore((s) => s.expandingIds);

  const cpf = node.person?.cpf ?? '';
  const loadProfile = usePersonProfileStore((s) => s.loadProfile);
  const personProfile = usePersonProfileStore((s) => s.profilesByCpf.get(cpf));
  const personLoading = usePersonProfileStore((s) => s.requestsByCpf.has(cpf));
  const personError = usePersonProfileStore((s) => s.errorsByCpf.get(cpf));

  const [activeTab, setActiveTab] = useState(PROFILE_CATEGORY_NAMES[0]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (node.kind === 'person' && cpf) void loadProfile(cpf);
    setActiveTab(PROFILE_CATEGORY_NAMES[0]);
    setSearchQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset ao trocar de entidade, não a cada render de loadProfile
  }, [node.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const related = useMemo(() => {
    return links
      .filter((l) => nid(l.source) === node.id || nid(l.target) === node.id)
      .map((l) => {
        const otherId = nid(l.source) === node.id ? nid(l.target) : nid(l.source);
        return { link: l, other: nodeIndex.get(otherId) };
      })
      .filter((r): r is { link: GraphLink; other: GraphNode } => !!r.other);
  }, [node.id, links, nodeIndex]);

  const relatedCompanies = related.filter((r) => r.other.kind === 'company');
  const relatedPeople = related.filter((r) => r.other.kind === 'person');

  const nodeHistory = useMemo(
    () => timeline.filter((t) => t.nodeId === node.id).sort((a, b) => a.date.localeCompare(b.date)),
    [node.id, timeline],
  );

  const rawSource = useMemo(
    () => (node.kind === 'person' ? (personProfile?.SERVICE_RESPONSE ?? null) : companyToProfileSource(node.company ?? { cnpj: '', razaoSocial: '', situacao: 'DESCONHECIDA' })),
    [node.kind, node.company, personProfile],
  );

  const query = normalizeText(searchQuery.trim());

  const categoryGroups = useMemo(() => {
    const groups = groupServiceResponse(rawSource ?? {});
    if (!query) return groups;
    return groups
      .map((g) => ({ ...g, entries: g.entries.filter(([k, v]) => entryMatchesQuery(k, v, query)) }))
      .filter((g) => g.entries.length > 0);
  }, [rawSource, query]);

  const groupByName = new Map(categoryGroups.map((g) => [g.name, g]));

  const goTo = (id: string) => {
    selectNode(id);
    focusNode(id);
  };

  const situacao = node.company?.situacao;
  const statusClass = situacao === 'ATIVA' ? '' : situacao === 'BAIXADA' ? 'bad' : 'off';

  const connectionsList = (
    <div className="fsp-connections">
      <h4 className="subheading" style={{ marginTop: 0 }}>
        {node.kind === 'company' ? 'Sócios e administradores' : 'Participações societárias'}
      </h4>
      {related.length === 0 && <p className="profile-row-value">Nenhuma conexão carregada.</p>}
      {related.map(({ link, other }) => (
        <button className="connection" key={link.id} onClick={() => goTo(other.id)}>
          <span
            className="tiny-avatar"
            style={
              other.kind === 'company'
                ? { background: other.company?.situacao === 'BAIXADA' ? '#9ca3af' : '#374151', color: '#fff' }
                : undefined
            }
          >
            {other.kind === 'company' ? <CompanyIcon className="tiny-company-icon" /> : <PersonIcon className="tiny-company-icon" />}
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
        </button>
      ))}
    </div>
  );

  const historyList = (
    <div className="fsp-history">
      <h4 className="subheading" style={{ marginTop: 0 }}>
        Histórico no grafo
      </h4>
      {nodeHistory.length === 0 && <p className="profile-row-value">Nenhum evento registrado para esta entidade.</p>}
      {nodeHistory.map((ev, i) => (
        <div className="timeline-item" key={i}>
          <span className="tl-dot" style={{ background: TL_COLORS[ev.kind] }} />
          <time>{formatDate(ev.date)}</time>
          <span>{ev.description}</span>
        </div>
      ))}
    </div>
  );

  const tabCount = (name: string) => {
    const g = groupByName.get(name);
    let n = g ? categoryRecordCount(g.entries) : 0;
    if (name === 'Carreira & Negócios') n += related.length;
    if (name === 'Cadastral & Civil') n += nodeHistory.length;
    return n;
  };

  return (
    <div className="fsp-overlay" role="dialog" aria-modal="true" aria-label={`Detalhes de ${node.label}`}>
      <QueueProgress />
      <header className="fsp-header">
        <button className="fsp-back" onClick={onClose} aria-label="Voltar ao mapa">
          <svg className="icon" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Voltar ao mapa
        </button>
        <div className="fsp-header-row">
          <div className="fsp-identity">
            <div
              className="entity-icon"
              style={{ background: node.kind === 'person' ? '#6b7280' : situacao === 'BAIXADA' ? '#9ca3af' : '#374151' }}
            >
              {node.kind === 'person' ? <PersonIcon /> : <CompanyIcon />}
            </div>
            <div>
              <h1>{node.label}</h1>
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
          <div className="fsp-stat-cards">
            <div className="stat">
              <i style={{ color: '#374151', background: '#f3f4f6' }}>
                {node.kind === 'company' ? <PersonIcon className="mini-building" /> : <CompanyIcon className="mini-building" />}
              </i>
              <div>
                <b>{node.kind === 'company' ? relatedPeople.length : relatedCompanies.length}</b>
                <small>{node.kind === 'company' ? 'sócios' : 'participações'}</small>
              </div>
            </div>
            {node.kind === 'company' && (
              <div className="stat">
                <i style={{ color: '#374151', background: '#f3f4f6' }}>
                  <CompanyIcon className="mini-building" />
                </i>
                <div>
                  <b>{relatedCompanies.length}</b>
                  <small>empresas relacionadas</small>
                </div>
              </div>
            )}
            {node.kind === 'company' && (
              <div className="stat">
                <i style={{ color: '#374151', background: '#f3f4f6' }}>◈</i>
                <div>
                  <b>{formatCurrency(node.company?.capitalSocial)}</b>
                  <small>capital social</small>
                </div>
              </div>
            )}
          </div>
          <button
            className="btn primary fsp-cta"
            onClick={() => {
              if (!node.expanded) void expandNode(node.id);
              else focusNode(node.id);
            }}
            disabled={expandingIds.has(node.id)}
          >
            {expandingIds.has(node.id) ? 'Expandindo…' : !node.expanded ? 'Expandir conexões ↗' : 'Centralizar no mapa ↗'}
          </button>
        </div>
      </header>

      <div className="fsp-body">
        <nav className="fsp-nav" aria-label="Categorias do perfil">
          {PROFILE_CATEGORY_NAMES.map((name) => (
            <button
              key={name}
              className={activeTab === name ? 'active' : ''}
              onClick={() => setActiveTab(name)}
            >
              <span className="fsp-nav-icon" aria-hidden="true">
                {TAB_ICONS[name]}
              </span>
              <span className="fsp-nav-label">{name}</span>
              <span className="fsp-nav-count">{tabCount(name)}</span>
            </button>
          ))}
        </nav>

        <div className="fsp-content">
          <label className="profile-search">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar nas informações desta entidade"
              aria-label="Buscar nas informações desta entidade"
            />
          </label>

          {node.kind === 'person' && personLoading && <p className="profile-status">Carregando perfil…</p>}
          {node.kind === 'person' && !personLoading && personError && (
            <p className="profile-status profile-error">
              <span>{personError}</span>
              <button type="button" className="btn plain" onClick={() => void loadProfile(cpf)}>
                Tentar novamente
              </button>
            </p>
          )}

          {(node.kind === 'company' || (!personLoading && !personError)) && (
            <CategoryPage
              group={groupByName.get(activeTab) ?? { name: activeTab, entries: [] }}
              query={searchQuery.trim()}
              maskSoft={node.kind === 'person'}
              extra={
                activeTab === 'Carreira & Negócios' ? connectionsList : activeTab === 'Cadastral & Civil' ? historyList : undefined
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
