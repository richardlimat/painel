import { useMemo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { coveredKeysForFields, type FieldSpec, type SectionSpec } from '../../lib/profileSchema';
import { fmtText, getPath, isEmptyValue } from '../../lib/profileFormat';
import { classifyKey } from '../../lib/mask';
import { MaskedValue, ProfileCardEntries, countRecords } from './ProfileValue';
import { ProfileSectionView, sectionHasContent } from './ProfileSections';

/**
 * Aba "Carreira & Negócios": um dossiê de trajetória profissional. No topo, um
 * panorama calculado (sociedades, vínculos, RAIS, profissões, tempo de carreira)
 * com alertas (exposição política/PPE, MEI, OAB…). O centro é a "Trajetória" —
 * uma linha do tempo única que funde SOCIEDADES + EMPREGOS + RAIS em ordem
 * cronológica. Abaixo, os demais registros em domínios.
 *
 * NADA é omitido: a trajetória mostra os campos curados no "rosto" do cartão e
 * TODOS os demais (curados restantes + não curados) via `FieldVal` +
 * `ProfileCardEntries` — o mesmo mascaramento do `ListSection`. As seções não
 * cronológicas seguem no `ProfileSectionView`, e a seção "Conexões no mapa" é
 * injetada intacta via `connectionsSlot`.
 */

const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : [];

const num = (v: unknown): number => countRecords(v) ?? (isEmptyValue(v) ? 0 : 1);

const lastSeg = (path: string) => path.split('.').pop() ?? path;

function formattedOf(item: unknown, field: FieldSpec): string {
  const raw = field.path === '' ? item : getPath(item, field.path);
  return field.format ? field.format(raw) : fmtText(raw);
}

function FieldVal({ item, field }: { item: unknown; field?: FieldSpec }) {
  if (!field) return <span className="ef-muted">—</span>;
  const formatted = formattedOf(item, field);
  if (formatted === '—') return <span className="ef-muted">—</span>;
  const cls = field.maskOverride ?? classifyKey(field.maskKey ?? lastSeg(field.path));
  return cls !== 'none' ? <MaskedValue value={formatted} cls={cls} /> : <>{formatted}</>;
}

function restEntries(item: unknown, fields: FieldSpec[]): [string, unknown][] {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
  const covered = coveredKeysForFields(fields);
  return Object.entries(item as Record<string, unknown>).filter(([k]) => !covered.has(k));
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

// ─── Ícones ────────────────────────────────────────────────────────────────
const I = {
  building: (<><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" /><path d="M14 10h5a1 1 0 0 1 1 1v10" /><path d="M8 8h.01M8 12h.01M8 16h.01M4 21h16" /></>),
  briefcase: (<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></>),
  doc: (<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>),
  span: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  scale: (<><path d="M12 3v18M5 21h14M7 7h10M7 7 4 13a3 3 0 0 0 6 0L7 7ZM17 7l-3 6a3 3 0 0 0 6 0l-3-6Z" /></>),
  flag: (<><path d="M5 21V4M5 4c3-1.5 6 1.5 9 0s5-1 5-1v10s-2 .5-5 1-6-1.5-9 0" /></>),
  alert: (<><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>),
  id: (<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="12" r="2.4" /><path d="M14 10h4M14 14h4M5.5 17c0-1.6 1.6-2.6 3.5-2.6s3.5 1 3.5 2.6" /></>),
  link: (<><path d="M9 15l6-6M8 12l-2 2a3.5 3.5 0 0 0 5 5l2-2M16 12l2-2a3.5 3.5 0 0 0-5-5l-2 2" /></>),
  award: (<><circle cx="12" cy="9" r="6" /><path d="M9 14.5 8 22l4-2.5L16 22l-1-7.5" /></>),
};

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

// ─── Trajetória (timeline unificada) ─────────────────────────────────────────
interface CareerEvent {
  kind: 'sociedade' | 'emprego' | 'rais';
  item: Record<string, unknown>;
  fields: FieldSpec[];
  title: string;
  role: string;
  status: string;
  startTxt: string;
  endTxt: string;
  sortKey: number;
  ongoing: boolean;
  consumed: Set<string>;
}

const KIND_META: Record<CareerEvent['kind'], { label: string; color: string; soft: string; icon: ReactNode }> = {
  sociedade: { label: 'Sociedade', color: '#7c3aed', soft: '#f5f3ff', icon: I.building },
  emprego: { label: 'Emprego', color: '#2563eb', soft: '#eff6ff', icon: I.briefcase },
  rais: { label: 'RAIS', color: '#0891b2', soft: '#ecfeff', icon: I.doc },
};

function fieldByPath(fields: FieldSpec[], path: string) {
  return fields.find((f) => f.path === path);
}

function buildEvents(sr: Record<string, unknown>, bySource: (s: string) => SectionSpec | undefined): CareerEvent[] {
  const events: CareerEvent[] = [];
  const push = (
    kind: CareerEvent['kind'],
    source: string,
    map: (item: Record<string, unknown>, fields: FieldSpec[]) => Omit<CareerEvent, 'kind' | 'item' | 'fields'>,
  ) => {
    const spec = bySource(source);
    const fields = spec?.fields ?? [];
    for (const item of arr(sr[source])) events.push({ kind, item, fields, ...map(item, fields) });
  };

  push('sociedade', 'sociedades', (item, fields) => {
    const startTxt = fieldByPath(fields, 'dt_entrada') ? formattedOf(item, fieldByPath(fields, 'dt_entrada')!) : '—';
    const status = fieldByPath(fields, 'situacao_cadastral') ? formattedOf(item, fieldByPath(fields, 'situacao_cadastral')!) : '';
    const ongoing = /ativ/i.test(status);
    return {
      title: fmtText(item.razao_social),
      role: fmtText(item.qualificacao_socio_descricao),
      status,
      startTxt,
      endTxt: '',
      sortKey: parseDate(item.dt_entrada)?.getTime() ?? -Infinity,
      ongoing,
      consumed: new Set(['razao_social', 'qualificacao_socio_descricao', 'situacao_cadastral', 'dt_entrada']),
    };
  });

  push('emprego', 'empregos', (item, fields) => {
    const startTxt = fieldByPath(fields, 'data_admissao') ? formattedOf(item, fieldByPath(fields, 'data_admissao')!) : '—';
    const endRaw = item.data_demissao;
    const endTxt = fieldByPath(fields, 'data_demissao') ? formattedOf(item, fieldByPath(fields, 'data_demissao')!) : '—';
    return {
      title: fmtText(item.razao_social),
      role: fmtText(item.descricao_cbo),
      status: '',
      startTxt,
      endTxt: endTxt === '—' ? '' : endTxt,
      sortKey: parseDate(item.data_admissao)?.getTime() ?? -Infinity,
      ongoing: isEmptyValue(endRaw),
      consumed: new Set(['razao_social', 'descricao_cbo', 'data_admissao', 'data_demissao']),
    };
  });

  push('rais', 'rais', (item, fields) => {
    const startTxt = fieldByPath(fields, 'admissao') ? formattedOf(item, fieldByPath(fields, 'admissao')!) : '—';
    const endTxt = fieldByPath(fields, 'demissao_tratada') ? formattedOf(item, fieldByPath(fields, 'demissao_tratada')!) : '—';
    return {
      title: fmtText(item.razao_social),
      role: !isEmptyValue(item.ano_base) ? `Ano-base ${fmtText(item.ano_base)}` : '',
      status: '',
      startTxt,
      endTxt: endTxt === '—' ? '' : endTxt,
      sortKey: parseDate(item.admissao)?.getTime() ?? -Infinity,
      ongoing: false,
      consumed: new Set(['razao_social', 'admissao', 'demissao_tratada']),
    };
  });

  return events.sort((a, b) => b.sortKey - a.sortKey);
}

function JourneyCard({ ev, onOpenImage }: { ev: CareerEvent; onOpenImage: (u: string) => void }) {
  const meta = KIND_META[ev.kind];
  const details = ev.fields.filter((f) => !ev.consumed.has(f.path) && formattedOf(ev.item, f) !== '—');
  const rest = restEntries(ev.item, ev.fields);
  const range = [ev.startTxt !== '—' ? ev.startTxt : null, ev.ongoing ? 'atual' : ev.endTxt || null]
    .filter(Boolean)
    .join(' — ');

  return (
    <div className="car-item">
      <span className="car-node" style={{ background: meta.color, boxShadow: `0 0 0 4px ${meta.soft}` }}>
        <Svg size={14}>{meta.icon}</Svg>
      </span>
      <div className="car-card">
        <div className="car-card-head">
          <span className="car-badge" style={{ background: meta.soft, color: meta.color }}>{meta.label}</span>
          {range && <span className="car-range">{range}</span>}
          {ev.ongoing && <span className="car-live">Atual</span>}
        </div>
        <div className="car-card-title">{ev.title !== '—' ? ev.title : meta.label}</div>
        {ev.role && ev.role !== '—' && <div className="car-card-role">{ev.role}</div>}
        {ev.status && <span className={`car-status ${/ativ/i.test(ev.status) ? 'ok' : 'off'}`}>{ev.status}</span>}
        {details.length > 0 && (
          <div className="car-kv">
            {details.map((f) => (
              <span className="car-kv-item" key={f.label}>
                <small>{f.label}</small>
                <b><FieldVal item={ev.item} field={f} /></b>
              </span>
            ))}
          </div>
        )}
        {rest.length > 0 && (
          <div className="car-extra">
            <ProfileCardEntries entries={rest} query="" onOpenImage={onOpenImage} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Domínios (demais registros) ─────────────────────────────────────────────
const REST_DOMAINS: { id: string; title: string; sub: string; color: string; sources: string[]; alwaysRender?: boolean }[] = [
  { id: 'registros', title: 'Formação & registros', sub: 'Profissões, conselhos de classe, OAB e MEI', color: '#0891b2', sources: ['profissoes', 'dadosConselho', 'inscricoesOab', 'meiDetalhado'] },
  { id: 'rede', title: 'Rede & presença comercial', sub: 'Contatos comerciais, empresas relacionadas e conexões no mapa', color: '#2563eb', sources: ['contatosComerciais', 'empresasRelacionadas', 'linkedin'], alwaysRender: true },
  { id: 'politica', title: 'Exposição política', sub: 'Pessoa politicamente exposta e filiações', color: '#b45309', sources: ['ppe', 'politica'] },
];

export function CareerPage({
  sections,
  serviceResponse,
  onOpenImage,
  onConsult,
  connectionsSlot,
}: {
  sections: SectionSpec[];
  serviceResponse: Record<string, unknown>;
  onOpenImage: (url: string) => void;
  onConsult: (cpf: string) => void;
  connectionsSlot: ReactNode;
}) {
  const sr = serviceResponse;
  const bySource = (src: string) => sections.find((s) => s.source === src);

  const events = useMemo(() => buildEvents(sr, bySource), [sr]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const soc = arr(sr.sociedades);
    const admin = soc.filter((s) => /admin/i.test(String(s.qualificacao_socio_descricao ?? ''))).length;
    const years = events
      .flatMap((e) => [parseDate(e.item.dt_entrada ?? e.item.data_admissao ?? e.item.admissao)])
      .filter((d): d is Date => !!d)
      .map((d) => d.getFullYear());
    const span = years.length ? new Date().getFullYear() - Math.min(...years) : 0;
    return {
      sociedades: soc.length,
      admin,
      empregos: num(sr.empregos),
      rais: num(sr.rais),
      profissoes: num(sr.profissoes),
      span,
      ppe: num(sr.ppe),
      mei: num(sr.meiDetalhado),
      oab: num(sr.inscricoesOab),
      linkedin: num(sr.linkedin),
      conselho: num(sr.dadosConselho),
    };
  }, [sr, events]);

  const metricTiles = [
    { icon: I.building, value: stats.sociedades, label: stats.sociedades === 1 ? 'sociedade' : 'sociedades', color: '#7c3aed', soft: '#f5f3ff' },
    { icon: I.briefcase, value: stats.empregos, label: stats.empregos === 1 ? 'vínculo' : 'vínculos', color: '#2563eb', soft: '#eff6ff' },
    { icon: I.doc, value: stats.rais, label: 'RAIS', color: '#0891b2', soft: '#ecfeff' },
    { icon: I.award, value: stats.profissoes, label: stats.profissoes === 1 ? 'profissão' : 'profissões', color: '#059669', soft: '#ecfdf5' },
    { icon: I.span, value: stats.span ? `${stats.span}a` : '—', label: 'de carreira', color: '#475569', soft: '#f1f5f9' },
  ];

  const badges: { key: string; label: string; tone: string; icon: ReactNode }[] = [];
  if (stats.ppe > 0) badges.push({ key: 'ppe', label: 'Politicamente exposta (PPE)', tone: 'alert', icon: I.alert });
  if (stats.admin > 0) badges.push({ key: 'admin', label: `Administrador(a) em ${stats.admin}`, tone: 'accent', icon: I.building });
  if (stats.oab > 0) badges.push({ key: 'oab', label: 'Inscrição na OAB', tone: 'info', icon: I.scale });
  if (stats.conselho > 0) badges.push({ key: 'con', label: 'Conselho de classe', tone: 'info', icon: I.award });
  if (stats.mei > 0) badges.push({ key: 'mei', label: 'MEI', tone: 'info', icon: I.id });
  if (stats.linkedin > 0) badges.push({ key: 'in', label: 'LinkedIn', tone: 'info', icon: I.link });

  const restDomains = REST_DOMAINS.map((d) => ({
    domain: d,
    specs: d.sources.map(bySource).filter((s): s is SectionSpec => !!s && sectionHasContent(s, sr)),
  })).filter((d) => d.specs.length > 0 || d.domain.alwaysRender);

  return (
    <div className="car">
      {/* Panorama */}
      <div className="car-hero">
        <div className="car-hero-head">
          <span className="car-eyebrow">Panorama profissional</span>
        </div>
        <div className="car-metrics">
          {metricTiles.map((m, i) => (
            <div className="car-tile" key={i} style={{ '--c': m.color, '--c-soft': m.soft } as React.CSSProperties}>
              <span className="car-tile-icon"><Svg size={17}>{m.icon}</Svg></span>
              <b className="car-tile-value">{m.value}</b>
              <small className="car-tile-label">{m.label}</small>
            </div>
          ))}
        </div>
        {badges.length > 0 && (
          <div className="car-badges">
            {badges.map((b) => (
              <span className={`car-hl tone-${b.tone}`} key={b.key}>
                <Svg size={14}>{b.icon}</Svg>
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Trajetória */}
      <section className="car-journey">
        <header className="car-journey-head">
          <h2 className="car-journey-title">Trajetória profissional</h2>
          <p className="car-journey-sub">Sociedades, empregos e RAIS reunidos em ordem cronológica</p>
        </header>
        {events.length === 0 ? (
          <div className="car-empty">
            <span className="car-empty-icon"><Svg size={22}>{I.briefcase}</Svg></span>
            <p className="car-empty-title">Sem vínculos de trabalho ou sociedade registrados</p>
            <p className="car-empty-sub">Não encontramos empregos, RAIS ou participações societárias para esta pessoa.</p>
          </div>
        ) : (
          <div className="car-track">
            {events.map((ev, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.28, delay: Math.min(i * 0.04, 0.24) }}
              >
                <JourneyCard ev={ev} onOpenImage={onOpenImage} />
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Demais registros */}
      {restDomains.map(({ domain, specs }, di) => (
        <motion.section
          key={domain.id}
          className="car-domain"
          style={{ '--c': domain.color } as React.CSSProperties}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: Math.min(di * 0.05, 0.2) }}
        >
          <header className="car-domain-head">
            <h2 className="car-domain-title">{domain.title}</h2>
            <p className="car-domain-sub">{domain.sub}</p>
          </header>
          <div className="car-domain-body">
            {specs.map((spec) => (
              <ProfileSectionView key={spec.title} spec={spec} serviceResponse={sr} query="" onOpenImage={onOpenImage} onConsult={onConsult} />
            ))}
            {domain.id === 'rede' && connectionsSlot}
          </div>
        </motion.section>
      ))}
    </div>
  );
}
