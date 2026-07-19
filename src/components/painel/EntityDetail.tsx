import { useEffect, useMemo, useState } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { usePersonProfileStore } from '../../store/personProfileStore';
import { formatCNPJ, formatCPF, formatCurrency, formatDate, normalizeText } from '../../lib/format';
import { PROFILE_PAGE_ORDER, groupServiceResponseIntoPages } from '../../lib/profilePages';
import { RELATION_LABELS } from '../../lib/colors';
import { CompanyIcon, PersonIcon } from '../flow/icons';
import { ImageLightbox } from './ImageLightbox';
import { ProfileCardEntries, entryMatchesQuery } from './ProfileValue';
import type { GraphLink, GraphNode } from '../../types/graph';

const nid = (v: string | GraphNode) => (typeof v === 'string' ? v : v.id);

/** Abas exibidas (desabilitadas) enquanto o perfil ainda carrega — evita o layout "pular". */
const NAV_PLACEHOLDER = PROFILE_PAGE_ORDER;

/** Conexões (arestas) de um nó já carregadas no grafo. */
function useRelated(node: GraphNode | null) {
  const links = useGraphStore((s) => s.links);
  const nodeIndex = useGraphStore((s) => s.nodeIndex);
  return useMemo(() => {
    if (!node) return [];
    return links
      .filter((l) => nid(l.source) === node.id || nid(l.target) === node.id)
      .map((l) => {
        const otherId = nid(l.source) === node.id ? nid(l.target) : nid(l.source);
        return { link: l, other: nodeIndex.get(otherId) };
      })
      .filter((r): r is { link: GraphLink; other: GraphNode } => !!r.other);
  }, [node, links, nodeIndex]);
}

/** Cartão simples rótulo/valor — usado pelas seções montadas manualmente (empresa). */
function FieldCard({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <div className="ef-card">
      <span className="ef-card-label">{label}</span>
      <div className="ef-card-value">{value}</div>
    </div>
  );
}

/** Lista de conexões clicáveis (navega para a entidade e centraliza no mapa). */
function Connections({ related, onGo }: { related: { link: GraphLink; other: GraphNode }[]; onGo: (id: string) => void }) {
  if (related.length === 0) {
    return <p className="ef-empty">Nenhuma conexão carregada no mapa.</p>;
  }
  return (
    <div className="ef-connections">
      {related.map(({ link, other }) => (
        <button className="ef-connection" key={link.id} onClick={() => onGo(other.id)} type="button">
          <span className={`ef-connection-icon ${other.kind}`}>
            {other.kind === 'company' ? <CompanyIcon className="tiny-company-icon" /> : <PersonIcon className="tiny-company-icon" />}
          </span>
          <span className="ef-connection-body">
            <strong>{other.label}</strong>
            <small>
              {other.kind === 'company' ? formatCNPJ(other.company?.cnpj ?? '') : formatCPF(other.person?.cpf ?? '')}
              {link.meta.dataEntrada ? ` · desde ${formatDate(link.meta.dataEntrada)}` : ''}
            </small>
          </span>
          <span className="ef-connection-tag">{link.meta.funcao ?? RELATION_LABELS[link.type]}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Empresa: página única ─────────────────────────────────────────────────

function CompanyDetail({ node, onGo }: { node: GraphNode; onGo: (id: string) => void }) {
  const related = useRelated(node);
  const c = node.company;
  if (!c) return null;

  const statusClass = c.situacao === 'ATIVA' ? 'ok' : c.situacao === 'BAIXADA' ? 'bad' : 'off';
  const relatedPeople = related.filter((r) => r.other.kind === 'person');
  const relatedCompanies = related.filter((r) => r.other.kind === 'company');

  return (
    <div className="ef-body">
      <div className="ef-hero">
        <div className="ef-hero-avatar company">
          <CompanyIcon className="ef-hero-avatar-icon" />
        </div>
        <div className="ef-hero-info">
          <h1 className="ef-hero-name">
            {node.label}
            <span className={`ef-status ${statusClass}`}>{c.situacao ?? 'DESCONHECIDA'}</span>
          </h1>
          <div className="ef-hero-badges">
            <span className="ef-badge mono">{formatCNPJ(c.cnpj)}</span>
            {c.nomeFantasia && <span className="ef-hero-sub">{c.nomeFantasia}</span>}
            <span className="ef-hero-sub">Camada {node.depth} na rede</span>
          </div>
        </div>
      </div>

      <section className="ef-section">
        <h3 className="ef-section-title">Informações gerais</h3>
        <div className="ef-grid">
          <FieldCard label="Razão social" value={c.razaoSocial} />
          <FieldCard label="Nome fantasia" value={c.nomeFantasia} />
          <FieldCard label="Situação cadastral" value={c.situacao} />
          <FieldCard label="Natureza jurídica" value={c.naturezaJuridica} />
          <FieldCard label="Capital social" value={c.capitalSocial != null ? formatCurrency(c.capitalSocial) : undefined} />
          <FieldCard label="Data de abertura" value={c.dataAbertura ? formatDate(c.dataAbertura) : undefined} />
          <FieldCard label="Matriz / Filial" value={c.matriz == null ? undefined : c.matriz ? 'Matriz' : 'Filial'} />
          <FieldCard label="Município / UF" value={[c.municipio, c.uf].filter(Boolean).join(' · ') || undefined} />
          <FieldCard label="Endereço" value={c.endereco} />
          <FieldCard label="Telefone" value={c.telefone} />
          <FieldCard label="E-mail" value={c.email} />
        </div>
      </section>

      <section className="ef-section">
        <h3 className="ef-section-title">CNAEs & atividades</h3>
        <div className="ef-grid">
          <FieldCard
            label="CNAE principal"
            value={c.cnaePrincipal ? `${c.cnaePrincipal.codigo} — ${c.cnaePrincipal.descricao}` : undefined}
          />
        </div>
        {c.cnaesSecundarios && c.cnaesSecundarios.length > 0 ? (
          <div className="ef-group">
            <h4 className="ef-group-title">
              CNAEs secundários<span className="ef-count">{c.cnaesSecundarios.length}</span>
            </h4>
            <div className="ef-chips">
              {c.cnaesSecundarios.map((cn) => (
                <span className="ef-chip" key={cn.codigo}>
                  {cn.codigo} — {cn.descricao}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="ef-empty">Nenhum CNAE secundário listado.</p>
        )}
      </section>

      <section className="ef-section">
        <h3 className="ef-section-title">
          Sócios & relacionados
          <span className="ef-count">{related.length}</span>
        </h3>
        <div className="ef-stat-row">
          <div className="ef-stat">
            <b>{relatedPeople.length}</b>
            <small>sócios (pessoas)</small>
          </div>
          <div className="ef-stat">
            <b>{relatedCompanies.length}</b>
            <small>empresas relacionadas</small>
          </div>
        </div>
        <Connections related={related} onGo={onGo} />
      </section>
    </div>
  );
}

// ─── Pessoa: páginas em abas ───────────────────────────────────────────────

function PersonDetail({ node, onGo }: { node: GraphNode; onGo: (id: string) => void }) {
  const cpf = node.person?.cpf ?? '';
  const digits = cpf.replace(/\D+/g, '');
  const loadProfile = usePersonProfileStore((s) => s.loadProfile);
  const profile = usePersonProfileStore((s) => s.profilesByCpf.get(digits) ?? s.profilesByCpf.get(cpf));
  const loading = usePersonProfileStore((s) => s.requestsByCpf.has(digits) || s.requestsByCpf.has(cpf));
  const error = usePersonProfileStore((s) => s.errorsByCpf.get(digits) ?? s.errorsByCpf.get(cpf));
  const related = useRelated(node);

  const [activePage, setActivePage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (digits) void loadProfile(digits);
    setActivePage(0);
    setSearchQuery('');
    setLightboxSrc(null);
  }, [digits, loadProfile]);

  const query = normalizeText(searchQuery.trim());

  const pages = useMemo(
    () => (profile ? groupServiceResponseIntoPages(profile.SERVICE_RESPONSE) : []),
    [profile],
  );

  // Resultados de busca são planos (todas as páginas), mantendo só as entradas que casam.
  const searchResults = useMemo(() => {
    if (!query) return [];
    return pages
      .flatMap((p) => p.entries)
      .filter(([k, v]) => entryMatchesQuery(k, v, query));
  }, [pages, query]);

  const current = pages[activePage];

  return (
    <>
      <nav className="ef-nav" aria-label="Seções do perfil">
        {pages.length === 0
          ? // enquanto o perfil carrega, mostra as abas nomeadas (desabilitadas) pra estrutura não "pular"
            NAV_PLACEHOLDER.map((name) => (
              <button key={name} type="button" className="ef-tab" disabled>
                {name}
              </button>
            ))
          : pages.map((p, i) => (
              <button
                key={p.name}
                type="button"
                className={`ef-tab ${!query && i === activePage ? 'active' : ''}`}
                onClick={() => {
                  setActivePage(i);
                  setSearchQuery('');
                }}
              >
                {p.name}
                {p.entries.length > 0 && <span className="ef-tab-count">{p.entries.length}</span>}
              </button>
            ))}
      </nav>

      <div className="ef-body person">
        <div className="ef-hero">
          <div className="ef-hero-avatar person">
            {node.person?.photoUrl ? (
              <img src={node.person.photoUrl} alt="" className="ef-hero-photo" />
            ) : (
              <PersonIcon className="ef-hero-avatar-icon" />
            )}
          </div>
          <div className="ef-hero-info">
            <h1 className="ef-hero-name">
              {node.label}
              <span className="ef-status">{node.person?.administrador ? 'ADMINISTRADOR' : 'PESSOA FÍSICA'}</span>
            </h1>
            <div className="ef-hero-badges">
              <span className="ef-badge mono">{formatCPF(cpf)}</span>
              <span className="ef-hero-sub">Camada {node.depth} na rede</span>
            </div>
          </div>
          <label className="ef-search">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar nas informações"
              aria-label="Buscar nas informações da pessoa"
            />
          </label>
        </div>

        {loading && <p className="ef-status-msg">Carregando perfil…</p>}
        {!loading && error && (
          <p className="ef-status-msg ef-status-error">
            <span>{error}</span>
            <button type="button" className="btn plain" onClick={() => void loadProfile(digits)}>
              Tentar novamente
            </button>
          </p>
        )}

        {!loading && !error && profile && (
          <div className="ef-pages">
            {query ? (
              <section className="ef-section">
                <h3 className="ef-section-title">
                  Resultados da busca<span className="ef-count">{searchResults.length}</span>
                </h3>
                {searchResults.length === 0 ? (
                  <p className="ef-empty">Nenhum registro encontrado.</p>
                ) : (
                  <ProfileCardEntries entries={searchResults} query={searchQuery.trim()} onOpenImage={setLightboxSrc} />
                )}
              </section>
            ) : current ? (
              <section className="ef-section">
                <h3 className="ef-section-title">{current.name}</h3>
                {current.entries.length === 0 ? (
                  <p className="ef-empty">Nenhuma informação disponível nesta seção.</p>
                ) : (
                  <ProfileCardEntries entries={current.entries} query="" onOpenImage={setLightboxSrc} />
                )}
                {current.name === 'Carreira & Negócios' && (
                  <div className="ef-group">
                    <h4 className="ef-group-title">
                      Conexões no mapa<span className="ef-count">{related.length}</span>
                    </h4>
                    <Connections related={related} onGo={onGo} />
                  </div>
                )}
              </section>
            ) : null}
          </div>
        )}

        {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      </div>
    </>
  );
}

/**
 * Detalhe da entidade em TELA CHEIA (substitui o antigo painel lateral). Ao
 * clicar num nó do mapa, sobrepõe o app inteiro: pessoa em 8 páginas/abas
 * temáticas; empresa numa página única e estruturada. O × (ou clicar numa
 * conexão) volta ao mapa.
 */
export function EntityDetail() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodeIndex = useGraphStore((s) => s.nodeIndex);
  const selectNode = useGraphStore((s) => s.selectNode);
  const focusNode = useGraphStore((s) => s.focusNode);

  const node = selectedNodeId ? nodeIndex.get(selectedNodeId) : null;

  useEffect(() => {
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectNode(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [node, selectNode]);

  if (!node) return null;

  const goTo = (id: string) => {
    selectNode(id);
    focusNode(id);
  };

  return (
    <div className="entity-full" role="dialog" aria-modal="true" aria-label={`Detalhes de ${node.label}`}>
      <div className="entity-full-topbar">
        <span className="entity-full-kind">{node.kind === 'company' ? 'Empresa / CNPJ' : 'Pessoa / CPF'}</span>
        <button className="entity-full-close" onClick={() => selectNode(null)} aria-label="Fechar e voltar ao mapa" type="button">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
          <span>Voltar ao mapa</span>
        </button>
      </div>
      {node.kind === 'company' ? <CompanyDetail node={node} onGo={goTo} /> : <PersonDetail node={node} onGo={goTo} />}
    </div>
  );
}
