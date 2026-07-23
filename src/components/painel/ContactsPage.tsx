import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { SectionSpec } from '../../lib/profileSchema';
import { fmtLocalidade, isEmptyValue } from '../../lib/profileFormat';
import { ProfileSectionView, sectionHasContent } from './ProfileSections';

/**
 * Aba "Contatos & Endereços": um painel-dossiê. No topo, uma "visão geral"
 * calculada a partir dos dados (quantos telefones/e-mails/endereços, quantos
 * com WhatsApp, alertas de senha vazada, cidades cobertas). Abaixo, um filtro
 * por categoria (padrão "Todos" — nada fica escondido) e as seções agrupadas
 * em dois domínios (contato x localização).
 *
 * NADA é reimplementado nem omitido: cada seção continua passando pelo mesmo
 * `ProfileSectionView` (mascaramento, `absorbRest`, o "restante" dos campos e
 * os cards de pessoas ficam idênticos). A visão geral é puramente aditiva e só
 * usa dados não sensíveis (contagens e cidade/UF) — telefone, e-mail e senha
 * seguem só nos cards mascarados das seções.
 */

const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : [];

type Filter = 'all' | string;

interface CatMeta {
  source: string;
  label: string;
  color: string;
  soft: string;
  icon: ReactNode;
}

const ICON = {
  phone: (
    <path d="M6.6 3.5 8.9 3l1.6 4-1.9 1.3a11 11 0 0 0 5.1 5.1L15 11.5l4 1.6-.5 2.3a2 2 0 0 1-2.2 1.5C9.7 16.1 4.9 11.3 4.1 5.7A2 2 0 0 1 6.6 3.5Z" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  users: (
    <>
      <circle cx="8" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.4" />
      <path d="M2 20c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2" />
      <path d="M15 20c0-2.3 1.4-3.8 3.5-3.8S22 17.7 22 20" />
    </>
  ),
  whatsapp: (
    <path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.6-1.2A9 9 0 1 0 12 3Zm-3 5c.2 0 .5 0 .7.5l.7 1.6c.1.3 0 .5-.1.7l-.5.6c-.2.2-.2.4-.1.6a6 6 0 0 0 2.9 2.6c.3.1.5.1.7-.1l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.4.5 0 1-1 1.8-2 1.8-1.6 0-3.6-1.2-5-2.9-1-1.2-1.7-2.7-1.7-4 0-1 .8-2 1.4-2.3.2-.1.3-.1.5-.1Z" />
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3Z" />
      <path d="M9.5 12.5 11 14l3.5-3.5" />
    </>
  ),
  lockOpen: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.5-2" />
    </>
  ),
};

const CATS: CatMeta[] = [
  { source: 'telefones', label: 'Telefones', color: '#2563eb', soft: '#eff6ff', icon: ICON.phone },
  { source: 'emails', label: 'E-mails', color: '#7c3aed', soft: '#f5f3ff', icon: ICON.mail },
  { source: 'enderecos', label: 'Endereços', color: '#059669', soft: '#ecfdf5', icon: ICON.pin },
  { source: 'relacionadosPorEndereco', label: 'Pessoas', color: '#db2777', soft: '#fdf2f8', icon: ICON.users },
];

const DOMAINS: { id: string; title: string; sub: string; color: string; sources: string[] }[] = [
  { id: 'contato', title: 'Formas de contato', sub: 'Telefones e e-mails vinculados à pessoa', color: '#4f46e5', sources: ['telefones', 'emails'] },
  { id: 'local', title: 'Localização & vínculos', sub: 'Endereços e pessoas no mesmo local', color: '#059669', sources: ['enderecos', 'relacionadosPorEndereco'] },
];

function catMeta(source: string): CatMeta {
  return CATS.find((c) => c.source === source) ?? { source, label: source, color: '#64748b', soft: '#f8fafc', icon: ICON.pin };
}

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export function ContactsPage({
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
  const [filter, setFilter] = useState<Filter>('all');

  const sr = serviceResponse;
  const stats = useMemo(() => {
    const telefones = arr(sr.telefones);
    const emails = arr(sr.emails);
    const enderecos = arr(sr.enderecos);
    const pessoas = arr(sr.relacionadosPorEndereco);
    const whatsapp = telefones.filter((t) => t.flagWhatsApp === true || t.flagWhatsApp === 1 || t.flagWhatsApp === 'true').length;
    const leaked = emails.filter((e) => !isEmptyValue(e.password)).length;
    const cities = Array.from(
      new Set(enderecos.map((e) => fmtLocalidade(e.cidade, e.uf)).filter((c) => c !== '—')),
    );
    return {
      telefones: telefones.length,
      emails: emails.length,
      enderecos: enderecos.length,
      pessoas: pessoas.length,
      whatsapp,
      leaked,
      cities,
    };
  }, [sr]);

  const bySource = (src: string) => sections.find((s) => s.source === src);

  /** Categorias que têm chip: as que existem na página e vão renderizar algo. */
  const availableCats = CATS.filter((c) => {
    const spec = bySource(c.source);
    return spec && sectionHasContent(spec, sr);
  });

  const countFor = (source: string): number => {
    if (source === 'telefones') return stats.telefones;
    if (source === 'emails') return stats.emails;
    if (source === 'enderecos') return stats.enderecos;
    if (source === 'relacionadosPorEndereco') return stats.pessoas;
    return 0;
  };

  const renderSection = (spec?: SectionSpec) => {
    if (!spec) return null;
    return (
      <ProfileSectionView
        spec={spec}
        serviceResponse={sr}
        query=""
        onOpenImage={onOpenImage}
        onConsult={onConsult}
      />
    );
  };

  const metricTiles = [
    { source: 'telefones', value: stats.telefones, label: stats.telefones === 1 ? 'telefone' : 'telefones' },
    { source: 'emails', value: stats.emails, label: stats.emails === 1 ? 'e-mail' : 'e-mails' },
    { source: 'enderecos', value: stats.enderecos, label: stats.enderecos === 1 ? 'endereço' : 'endereços' },
    { source: 'relacionadosPorEndereco', value: stats.pessoas, label: 'no mesmo endereço' },
  ];

  return (
    <div className="ct">
      {/* Visão geral calculada */}
      <div className="ct-overview">
        <span className="ct-eyebrow">Visão geral dos contatos</span>
        <div className="ct-metrics">
          {metricTiles.map((m) => {
            const meta = catMeta(m.source);
            return (
              <div className="ct-tile" key={m.source} style={{ '--c': meta.color, '--c-soft': meta.soft } as React.CSSProperties}>
                <span className="ct-tile-icon">
                  <Svg size={18}>{meta.icon}</Svg>
                </span>
                <b className="ct-tile-value">{m.value}</b>
                <small className="ct-tile-label">{m.label}</small>
              </div>
            );
          })}
        </div>

        {(stats.whatsapp > 0 || stats.leaked > 0 || stats.cities.length > 0) && (
          <div className="ct-highlights">
            {stats.whatsapp > 0 && (
              <span className="ct-hl ct-hl-wa">
                <Svg size={15}>{ICON.whatsapp}</Svg>
                {stats.whatsapp} {stats.whatsapp === 1 ? 'número com WhatsApp' : 'números com WhatsApp'}
              </span>
            )}
            {stats.leaked > 0 && (
              <span className="ct-hl ct-hl-alert">
                <Svg size={15}>{ICON.lockOpen}</Svg>
                {stats.leaked} {stats.leaked === 1 ? 'senha vazada detectada' : 'senhas vazadas detectadas'}
              </span>
            )}
            {stats.cities.map((c) => (
              <span className="ct-hl ct-hl-city" key={c}>
                <Svg size={14}>{ICON.pin}</Svg>
                {c}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Filtro por categoria (padrão "Todos" — nada some) */}
      {availableCats.length > 1 && (
        <div className="ct-filters" role="group" aria-label="Filtrar por categoria">
          <button type="button" className={`ct-filter ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            Todos
          </button>
          {availableCats.map((c) => {
            const active = filter === c.source;
            return (
              <button
                key={c.source}
                type="button"
                className={`ct-filter ${active ? 'active' : ''}`}
                onClick={() => setFilter(active ? 'all' : c.source)}
                style={active ? { borderColor: c.color, background: c.soft, color: c.color } : undefined}
              >
                <span className="ct-filter-dot" style={{ background: c.color }} />
                {c.label}
                <span className="ct-filter-count">{countFor(c.source)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Conteúdo */}
      {filter === 'all' ? (
        DOMAINS.map((domain, di) => {
          const specs = domain.sources
            .map(bySource)
            .filter((s): s is SectionSpec => !!s && sectionHasContent(s, sr));
          if (specs.length === 0) return null;
          return (
            <motion.section
              key={domain.id}
              className="ct-domain"
              style={{ '--c': domain.color } as React.CSSProperties}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(di * 0.06, 0.2) }}
            >
              <header className="ct-domain-head">
                <div>
                  <h2 className="ct-domain-title">{domain.title}</h2>
                  <p className="ct-domain-sub">{domain.sub}</p>
                </div>
              </header>
              <div className="ct-domain-body">{specs.map((spec) => <div key={spec.title}>{renderSection(spec)}</div>)}</div>
            </motion.section>
          );
        })
      ) : (
        <motion.section
          className="ct-domain"
          style={{ '--c': catMeta(filter).color } as React.CSSProperties}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="ct-domain-body">{renderSection(bySource(filter))}</div>
        </motion.section>
      )}
    </div>
  );
}
