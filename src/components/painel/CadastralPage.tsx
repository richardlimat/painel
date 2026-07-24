import { useMemo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { SectionSpec } from '../../lib/profileSchema';
import { ProfileSectionView, sectionHasContent } from './ProfileSections';

/**
 * Aba "Cadastral & Civil": reorganiza as 18 seções curadas do schema em
 * grupos temáticos ("clusters") com um índice de atalho no topo. NÃO
 * reimplementa nenhuma renderização — cada seção continua passando por
 * `ProfileSectionView` (mascaramento, imagens, `absorbRest` e o "restante"
 * dos campos ficam idênticos), então nada é omitido. Qualquer seção cuja
 * origem não esteja mapeada num cluster cai no grupo final "Outros registros".
 */

interface ClusterDef {
  id: string;
  title: string;
  sub: string;
  color: string;
  soft: string;
  icon: ReactNode;
  sources: string[];
}

const ICON = {
  id: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="12" r="2.4" />
      <path d="M5.5 17c0-1.6 1.6-2.6 3.5-2.6s3.5 1 3.5 2.6" />
      <path d="M15 10h4M15 13.5h4" />
    </>
  ),
  docs: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  edu: (
    <>
      <path d="M12 4 2 9l10 5 10-5-10-5Z" />
      <path d="M6 11v5c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-5" />
    </>
  ),
  familia: (
    <>
      <circle cx="8" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.4" />
      <path d="M2 20c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2" />
      <path d="M15 20c0-2.3 1.4-3.8 3.5-3.8S22 17.7 22 20" />
    </>
  ),
  certidao: (
    <>
      <path d="M6 3h9l5 5v13a0 0 0 0 1 0 0H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v6h6" />
      <circle cx="11" cy="14" r="2.5" />
      <path d="M9.5 16.5 8.5 20l2.5-1.4L13.5 20l-1-3.5" />
    </>
  ),
  fotos: (
    <>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <circle cx="12" cy="13" r="3.2" />
      <path d="M8 6l1.5-2h5L16 6" />
    </>
  ),
  outros: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </>
  ),
};

const CLUSTERS: ClusterDef[] = [
  {
    id: 'identificacao',
    title: 'Identificação',
    sub: 'Registro civil, RFB, título de eleitor e grafias do nome',
    color: '#2563eb',
    soft: '#eff6ff',
    icon: ICON.id,
    sources: ['cadastral', 'outrosNomes'],
  },
  {
    id: 'documentos',
    title: 'Documentos & habilitação',
    sub: 'CIN, CNH e registros de RG',
    color: '#7c3aed',
    soft: '#f5f3ff',
    icon: ICON.docs,
    sources: ['cin', 'cnh', 'rgs'],
  },
  {
    id: 'educacao',
    title: 'Educação & formação',
    sub: 'Escolaridade, SISU, ProUni e histórico acadêmico',
    color: '#ca8a04',
    soft: '#fefce8',
    icon: ICON.edu,
    sources: ['escolaridade', 'sisu', 'prouni', 'universitarios', 'historicoEscolar'],
  },
  {
    id: 'familia',
    title: 'Família & filiação',
    sub: 'Genitores, parentes e árvore genealógica',
    color: '#db2777',
    soft: '#fdf2f8',
    icon: ICON.familia,
    sources: ['genitores', 'parentes'],
  },
  {
    id: 'certidoes',
    title: 'Certidões & registros',
    sub: 'Certidões cíveis e certidão de óbito',
    color: '#059669',
    soft: '#ecfdf5',
    icon: ICON.certidao,
    sources: ['certidoes', 'certidaoObito'],
  },
  {
    id: 'fotos',
    title: 'Fotos & documentos',
    sub: 'Fotos encontradas e documentos digitalizados',
    color: '#ea580c',
    soft: '#fff7ed',
    icon: ICON.fotos,
    sources: ['fotos', 'extraFotos', 'docsBase64'],
  },
];

const OUTROS_CLUSTER: Omit<ClusterDef, 'sources'> = {
  id: 'outros',
  title: 'Outros registros',
  sub: 'Demais dados cadastrais desta pessoa',
  color: '#64748b',
  soft: '#f8fafc',
  icon: ICON.outros,
};

export function CadastralPage({
  sections,
  serviceResponse,
  onOpenImage,
  onConsult,
}: {
  sections: SectionSpec[];
  serviceResponse: Record<string, unknown>;
  onOpenImage: (url: string) => void;
  onConsult: (cpf: string) => void;
}) {
  /** Agrupa as seções nos clusters, preservando a ordem do schema; o que sobra vai para "Outros registros". */
  const groups = useMemo(() => {
    const claimed = new Set<string>();
    const built = CLUSTERS.map((cluster) => {
      const members = sections.filter((s) => cluster.sources.includes(s.source));
      members.forEach((s) => claimed.add(s.source));
      const visible = members.filter((s) => sectionHasContent(s, serviceResponse));
      return { cluster, sections: members, visible };
    });
    const leftovers = sections.filter((s) => !claimed.has(s.source));
    if (leftovers.length > 0) {
      built.push({
        cluster: { ...OUTROS_CLUSTER, sources: [] },
        sections: leftovers,
        visible: leftovers.filter((s) => sectionHasContent(s, serviceResponse)),
      });
    }
    return built.filter((g) => g.visible.length > 0);
  }, [sections, serviceResponse]);

  const goTo = (id: string) => {
    document.getElementById(`cad-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="cad">
      {groups.length > 1 && (
        <nav className="cad-nav" aria-label="Ir para a seção">
          {groups.map(({ cluster }) => (
            <button key={cluster.id} type="button" className="cad-chip" onClick={() => goTo(cluster.id)}>
              <span className="cad-chip-dot" style={{ background: cluster.color }} />
              {cluster.title}
            </button>
          ))}
        </nav>
      )}

      {groups.map(({ cluster, visible }, gi) => (
        <motion.section
          key={cluster.id}
          id={`cad-${cluster.id}`}
          className="cad-cluster"
          style={{ '--c': cluster.color, '--c-soft': cluster.soft } as React.CSSProperties}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: Math.min(gi * 0.05, 0.3) }}
        >
          <header className="cad-cluster-head">
            <span className="cad-cluster-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {cluster.icon}
              </svg>
            </span>
            <div className="cad-cluster-titles">
              <h2 className="cad-cluster-title">{cluster.title}</h2>
              <p className="cad-cluster-sub">{cluster.sub}</p>
            </div>
            <span className="cad-cluster-count">{visible.length}</span>
          </header>

          <div className="cad-cluster-body">
            {visible.map((spec, i) => (
              <ProfileSectionView
                key={`${spec.title}-${i}`}
                spec={spec}
                serviceResponse={serviceResponse}
                query=""
                onOpenImage={onOpenImage}
                onConsult={onConsult}
              />
            ))}
          </div>
        </motion.section>
      ))}
    </div>
  );
}
