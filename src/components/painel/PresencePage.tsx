import { useMemo, type ReactNode } from 'react';
import type { SectionSpec } from '../../lib/profileSchema';
import { fmtText, isEmptyValue } from '../../lib/profileFormat';
import { isLikelyImageUrl } from '../../lib/profileRender';
import { ImageUrlValue, ProfileCardEntries, ProfileValueBlock, countRecords } from './ProfileValue';

/**
 * Aba "Presença & Viagens": a pegada digital e os deslocamentos da pessoa. No
 * topo, um resumo calculado (viagens, locais mapeados, avaliações,
 * contribuições, fontes online) com destaques (Local Guide, situação
 * migratória). Abaixo: uma galeria de lugares (fotos do Google Maps), as
 * viagens como cartões e a situação de estrangeiro.
 *
 * Seções todas `generic` — nada é reimplementado a ponto de omitir: as fotos
 * usam a MESMA primitiva segura (`ImageUrlValue` — miniatura clicável, nunca a
 * URL crua) e todo o resto de cada item vai pelo `ProfileCardEntries`/
 * `ProfileValueBlock` (mesmo mascaramento). Só as fotos são "promovidas" à
 * galeria e excluídas do corpo para não duplicar. Contagens/emptyText mantidos.
 */

const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : [];

const num = (v: unknown): number => countRecords(v) ?? (isEmptyValue(v) ? 0 : 1);

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const I = {
  pin: (<><path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></>),
  plane: (<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z" />),
  camera: (<><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.4" /><path d="M8 6l1.5-2h5L16 6" /></>),
  star: (<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />),
  hand: (<><path d="M6 11V6.5a1.5 1.5 0 0 1 3 0V11M9 10.5V4.5a1.5 1.5 0 0 1 3 0V11M12 5.5a1.5 1.5 0 0 1 3 0V12M15 8.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a5 5 0 0 1-4-2L6 15" /></>),
  globe: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></>),
  passport: (<><rect x="5" y="3" width="14" height="18" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M9 16h6" /></>),
  award: (<><circle cx="12" cy="9" r="6" /><path d="M9 14.5 8 22l4-2.5L16 22l-1-7.5" /></>),
  footprint: (<><path d="M8 5.5c1.5 0 2.5 1.6 2.5 3.5S9.5 13 8 13s-2.5-1-2.5-3S6.5 5.5 8 5.5ZM6 15c2 0 3 1 3 3s-1 2.5-2.5 2.5S4 19.5 4 18s0-3 2-3ZM16 3.5c1.4 0 2.3 1.5 2.3 3.3S17.4 10 16 10s-2.3-.9-2.3-2.8S14.6 3.5 16 3.5ZM17.6 12c1.8 0 2.4 1.4 2.4 3s-1 2.6-2.4 2.6-2.6-1-2.6-2.6.4-3 2.6-3Z" /></>),
};

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** Cartão de lugar visitado: foto (miniatura segura) + demais campos do registro. */
function PlaceCard({ foto, onOpenImage }: { foto: Record<string, unknown>; onOpenImage: (u: string) => void }) {
  const entries = Object.entries(foto);
  const imgEntry = entries.find(([k, v]) => isLikelyImageUrl(k, v, 'fotos'));
  const rest = imgEntry ? entries.filter((e) => e !== imgEntry) : entries;
  const local = fmtText(foto.local ?? foto.nome);

  return (
    <div className="pv-place">
      <div className="pv-place-photo">
        {imgEntry ? (
          <ImageUrlValue url={String(imgEntry[1])} alt={local !== '—' ? local : 'Local'} onOpen={onOpenImage} />
        ) : (
          <span className="pv-place-noimg"><Svg size={22}>{I.camera}</Svg></span>
        )}
      </div>
      <div className="pv-place-body">
        <ProfileCardEntries entries={rest} query="" onOpenImage={onOpenImage} containerKey="fotos" />
      </div>
    </div>
  );
}

/** Painel de uma fonte de presença online (ex.: Google Maps): galeria + o resto do registro. */
function PresenceSource({ item, index, onOpenImage }: { item: Record<string, unknown>; index: number; onOpenImage: (u: string) => void }) {
  const fotos = Array.isArray(item.fotos) ? (item.fotos.filter(isPlainObject) as Record<string, unknown>[]) : null;
  const rest = Object.entries(item).filter(([k]) => !(fotos && k === 'fotos'));
  const fonte = fmtText(item.fonte);

  return (
    <div className="pv-source">
      <div className="pv-source-head">
        <span className="pv-source-icon"><Svg size={16}>{I.pin}</Svg></span>
        <span className="pv-source-name">{fonte !== '—' ? fonte : `Fonte ${index + 1}`}</span>
      </div>
      {fotos && fotos.length > 0 && (
        <div className="pv-places">
          {fotos.map((foto, i) => <PlaceCard key={i} foto={foto} onOpenImage={onOpenImage} />)}
        </div>
      )}
      {rest.length > 0 && (
        <div className="pv-source-rest">
          <ProfileCardEntries entries={rest} query="" onOpenImage={onOpenImage} />
        </div>
      )}
    </div>
  );
}

function Domain({ color, icon, title, sub, count, children }: { color: string; icon: ReactNode; title: string; sub: string; count?: number; children: ReactNode }) {
  return (
    <section className="pv-domain" style={{ '--c': color } as React.CSSProperties}>
      <header className="pv-domain-head">
        <span className="pv-domain-icon"><Svg size={20}>{icon}</Svg></span>
        <div className="pv-domain-titles">
          <h2 className="pv-domain-title">{title}</h2>
          <p className="pv-domain-sub">{sub}</p>
        </div>
        {count != null && count > 0 && <span className="pv-domain-count">{count}</span>}
      </header>
      <div className="pv-domain-body">{children}</div>
    </section>
  );
}

export function PresencePage({
  sections,
  serviceResponse,
  onOpenImage,
}: {
  sections: SectionSpec[];
  serviceResponse: Record<string, unknown>;
  onOpenImage: (url: string) => void;
}) {
  const sr = serviceResponse;
  const bySource = (src: string) => sections.find((s) => s.source === src);

  const stats = useMemo(() => {
    const online = arr(sr.movimentacoesOnline);
    let places = 0;
    let reviews = 0;
    let contribs = 0;
    let guide: { nome: string; pts: number } | null = null;
    for (const item of online) {
      places += arr(item.fotos).length;
      reviews += arr(item.reviews).length;
      contribs += arr(item.contribuicoes).length;
      const perfil = isPlainObject(item.perfil) ? item.perfil : null;
      if (perfil) {
        const nivel = fmtText(perfil.nomeNivel ?? perfil.nivel);
        const pts = Number(perfil.pontosTotal ?? 0) || 0;
        if (nivel !== '—' && (!guide || pts > guide.pts)) guide = { nome: nivel, pts };
      }
    }
    return {
      viagens: num(sr.viagens),
      places,
      reviews,
      contribs,
      sources: online.length,
      guide,
      estrangeiro: !isEmptyValue(sr.estrangeiro),
    };
  }, [sr]);

  const metrics = [
    { icon: I.plane, value: stats.viagens, label: stats.viagens === 1 ? 'viagem' : 'viagens', color: '#0891b2', soft: '#ecfeff' },
    { icon: I.camera, value: stats.places, label: 'locais mapeados', color: '#2563eb', soft: '#eff6ff' },
    { icon: I.star, value: stats.reviews, label: 'avaliações', color: '#ca8a04', soft: '#fefce8' },
    { icon: I.hand, value: stats.contribs, label: 'contribuições', color: '#7c3aed', soft: '#f5f3ff' },
    { icon: I.pin, value: stats.sources, label: 'fontes online', color: '#059669', soft: '#ecfdf5' },
  ];

  const viagensSpec = bySource('viagens');
  const onlineSpec = bySource('movimentacoesOnline');
  const estrangeiroSpec = bySource('estrangeiro');

  const viagensVal = sr.viagens;
  const viagensItems = Array.isArray(viagensVal) && viagensVal.length > 0 && viagensVal.every(isPlainObject) ? (viagensVal as Record<string, unknown>[]) : null;
  const viagensEmpty = isEmptyValue(viagensVal) || (Array.isArray(viagensVal) && viagensVal.length === 0);

  const online = arr(sr.movimentacoesOnline);
  const showOnline = onlineSpec && !isEmptyValue(sr.movimentacoesOnline);
  const showEstrangeiro = estrangeiroSpec && !isEmptyValue(sr.estrangeiro);

  return (
    <div className="pv">
      {/* Pegada digital */}
      <div className="pv-hero">
        <div className="pv-hero-head">
          <span className="pv-hero-icon"><Svg size={24}>{I.footprint}</Svg></span>
          <span className="pv-eyebrow">Pegada digital &amp; deslocamentos</span>
        </div>
        <div className="pv-metrics">
          {metrics.map((m, i) => (
            <div className="pv-tile" key={i} style={{ '--c': m.color, '--c-soft': m.soft } as React.CSSProperties}>
              <span className="pv-tile-icon"><Svg size={16}>{m.icon}</Svg></span>
              <b className="pv-tile-value">{m.value}</b>
              <small className="pv-tile-label">{m.label}</small>
            </div>
          ))}
        </div>
        {(stats.guide || stats.estrangeiro) && (
          <div className="pv-badges">
            {stats.guide && (
              <span className="pv-hl tone-guide">
                <Svg size={14}>{I.award}</Svg>
                Local Guide · {stats.guide.nome}{stats.guide.pts ? ` · ${stats.guide.pts} pts` : ''}
              </span>
            )}
            {stats.estrangeiro && (
              <span className="pv-hl tone-immig">
                <Svg size={14}>{I.passport}</Svg>
                Situação migratória registrada
              </span>
            )}
          </div>
        )}
      </div>

      {/* Viagens */}
      {viagensSpec && (
        <Domain color="#0891b2" icon={I.plane} title="Viagens" sub="Deslocamentos e viagens registradas" count={num(viagensVal)}>
          {viagensEmpty ? (
            <p className="ef-empty">{viagensSpec.emptyText ?? 'Nenhuma viagem registrada.'}</p>
          ) : viagensItems ? (
            <div className="pv-trips">
              {viagensItems.map((item, i) => (
                <div className="pv-trip" key={i}>
                  <span className="pv-trip-icon"><Svg size={16}>{I.plane}</Svg></span>
                  <div className="pv-trip-body">
                    <ProfileCardEntries entries={Object.entries(item)} query="" onOpenImage={onOpenImage} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ProfileValueBlock keyName="viagens" value={viagensVal} query="" onOpenImage={onOpenImage} />
          )}
        </Domain>
      )}

      {/* Presença online (Google Maps) */}
      {showOnline && (
        <Domain color="#2563eb" icon={I.pin} title="Presença online (Google Maps)" sub="Lugares fotografados, avaliações e contribuições" count={online.length}>
          <div className="pv-sources">
            {online.map((item, i) => <PresenceSource key={i} item={item} index={i} onOpenImage={onOpenImage} />)}
          </div>
        </Domain>
      )}

      {/* Situação de estrangeiro / imigração */}
      {showEstrangeiro && (
        <Domain color="#7c3aed" icon={I.globe} title="Situação de estrangeiro / imigração" sub="Registros migratórios e de estrangeiro">
          <ProfileValueBlock keyName="estrangeiro" value={sr.estrangeiro} query="" onOpenImage={onOpenImage} />
        </Domain>
      )}
    </div>
  );
}
