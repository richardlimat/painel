import { useEffect, useMemo, useState } from 'react';
import type { GraphNode } from '../../types/graph';
import { usePersonProfileStore } from '../../store/personProfileStore';
import { groupServiceResponse, type ProfileCategoryGroup } from '../../lib/profileCategories';
import { normalizeText } from '../../lib/format';
import { CollapsibleSection } from './CollapsibleSection';
import { ImageLightbox } from './ImageLightbox';
import {
  RenderValue,
  categoryRecordCount,
  countRecords,
  entryMatchesQuery,
  highlightMatch,
} from './ProfileValue';

function CategorySection({
  group,
  query,
  onOpenImage,
}: {
  group: ProfileCategoryGroup;
  query: string;
  onOpenImage: (url: string) => void;
}) {
  return (
    <CollapsibleSection
      title={highlightMatch(group.name, query)}
      count={categoryRecordCount(group.entries)}
      forceOpen={!!query}
    >
      {group.entries.length === 0 ? (
        <p className="profile-row-value">Nenhum registro encontrado</p>
      ) : (
        group.entries.map(([key, value]) => (
          <CollapsibleSection key={key} title={highlightMatch(key, query)} count={countRecords(value)} forceOpen={!!query}>
            <RenderValue label={key} keyName={key} value={value} depth={0} query={query} onOpenImage={onOpenImage} />
          </CollapsibleSection>
        ))
      )}
    </CollapsibleSection>
  );
}

/**
 * Perfil completo da APIFull, organizado em categorias (Etapa 2): busca no
 * topo filtra por nome de seção/campo/valores e força abertura das
 * categorias/chaves com resultado; sem busca, todas as 14 categorias +
 * "Outros dados" aparecem recolhidas por padrão. Carrega o perfil ao
 * selecionar a pessoa — nunca expande o grafo (isso só acontece ao avançar
 * de camada, via o botão "+"/"Expandir conexões").
 */
export function PersonProfilePanel({ node }: { node: GraphNode }) {
  const cpf = node.person?.cpf ?? '';
  const loadProfile = usePersonProfileStore((s) => s.loadProfile);
  const profile = usePersonProfileStore((s) => s.profilesByCpf.get(cpf));
  const loading = usePersonProfileStore((s) => s.requestsByCpf.has(cpf));
  const error = usePersonProfileStore((s) => s.errorsByCpf.get(cpf));

  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (cpf) void loadProfile(cpf);
    setSearchQuery('');
    setLightboxSrc(null);
  }, [cpf, loadProfile]);

  const query = normalizeText(searchQuery.trim());

  const categoryGroups = useMemo(() => {
    if (!profile) return [];
    const groups = groupServiceResponse(profile.SERVICE_RESPONSE);
    if (!query) return groups;
    return groups
      .map((g) => {
        const nameMatches = normalizeText(g.name).includes(query);
        const entries = nameMatches ? g.entries : g.entries.filter(([k, v]) => entryMatchesQuery(k, v, query));
        return { ...g, entries };
      })
      .filter((g) => g.entries.length > 0);
  }, [profile, query]);

  if (!cpf) return null;

  return (
    <div className="profile-panel">
      <h4 className="subheading" style={{ marginTop: 0 }}>
        Perfil completo
      </h4>
      {loading && <p className="profile-status">Carregando perfil…</p>}
      {!loading && error && (
        <p className="profile-status profile-error">
          <span>{error}</span>
          <button type="button" className="btn plain" onClick={() => void loadProfile(cpf)}>
            Tentar novamente
          </button>
        </p>
      )}
      {!loading && !error && profile && (
        <div className="profile-sections">
          <label className="profile-search">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar nas informações da pessoa"
              aria-label="Buscar nas informações da pessoa"
            />
          </label>
          {query && categoryGroups.length === 0 && <p className="profile-status">Nenhum registro encontrado.</p>}
          {categoryGroups.map((group) => (
            <CategorySection key={group.name} group={group} query={searchQuery.trim()} onOpenImage={setLightboxSrc} />
          ))}
        </div>
      )}
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
