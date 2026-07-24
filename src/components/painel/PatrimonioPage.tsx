import { useMemo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { SectionSpec } from '../../lib/profileSchema';
import { fmtText, isEmptyValue } from '../../lib/profileFormat';
import { ProfileCardEntries, ProfileValueBlock, countRecords } from './ProfileValue';

/**
 * Aba "Bens & Patrimônio": um inventário de bens. No topo, o resumo do
 * patrimônio (veículos, imóveis, aeronaves, drones e total). Abaixo, cada
 * classe de bem vira uma "coleção" com cartões de ativo — os veículos ganham
 * uma placa estilizada quando há um campo de placa.
 *
 * As seções do schema são todas `generic` (forma desconhecida), então NADA é
 * reimplementado a ponto de arriscar omissão: cada item vira um cartão cujo
 * corpo é o `ProfileCardEntries` (todos os campos, com o mesmo mascaramento);
 * a placa do veículo é o único campo "promovido" ao cabeçalho e é excluída do
 * corpo para não duplicar. Valores que não sejam lista de objetos caem no
 * `ProfileValueBlock` padrão. Contagens/`emptyText` preservados.
 */

const num = (v: unknown): number => countRecords(v) ?? (isEmptyValue(v) ? 0 : 1);

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const I = {
  car: (<><path d="M3 13l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5M5 13h14v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-4Z" /><circle cx="7.5" cy="15.5" r="1" /><circle cx="16.5" cy="15.5" r="1" /></>),
  house: (<><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>),
  plane: (<><path d="M10 3.5 4 12l-1.5-.5L3 9 1.5 8 3 6.5 6 8l4-5.5a1.3 1.3 0 0 1 2 0L16 8l3-1.5L20.5 8 19 9l.5 2.5L18 12l-6-8.5Z" /><path d="M8.5 15 6 21l2-.5L10 16M15.5 15 18 21l-2-.5L14 16" /></>),
  drone: (<><rect x="9" y="9" width="6" height="6" rx="1" /><circle cx="5" cy="5" r="2.5" /><circle cx="19" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" /><path d="M7 7l2 2M17 7l-2 2M7 17l2-2M17 17l-2-2" /></>),
  vault: (<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="12" cy="12" r="4" /><path d="M12 8v-1M12 17v-1M8 12H7M17 12h-1" /></>),
};

interface AssetClass {
  source: string;
  label: string;
  singular: string;
  color: string;
  soft: string;
  icon: ReactNode;
  sub: string;
}

const CLASSES: AssetClass[] = [
  { source: 'placas', label: 'Veículos', singular: 'Veículo', color: '#2563eb', soft: '#eff6ff', icon: I.car, sub: 'Veículos e placas vinculados' },
  { source: 'imoveisSp', label: 'Imóveis', singular: 'Imóvel', color: '#059669', soft: '#ecfdf5', icon: I.house, sub: 'Registros de imóveis (SP)' },
  { source: 'aeronaves', label: 'Aeronaves', singular: 'Aeronave', color: '#7c3aed', soft: '#f5f3ff', icon: I.plane, sub: 'Aeronaves registradas (ANAC)' },
  { source: 'drones', label: 'Drones', singular: 'Drone', color: '#ea580c', soft: '#fff7ed', icon: I.drone, sub: 'Drones/RPAs registrados' },
];

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** Acha um campo de placa (escalar) no item — só a placa é promovida ao cabeçalho. */
function findPlate(item: Record<string, unknown>): { key: string; value: string } | null {
  for (const [k, v] of Object.entries(item)) {
    if (/plac/i.test(k) && (typeof v === 'string' || typeof v === 'number') && !isEmptyValue(v)) {
      return { key: k, value: fmtText(v) };
    }
  }
  return null;
}

function PlateBadge({ value }: { value: string }) {
  return (
    <span className="pt-plate" aria-label={`Placa ${value}`}>
      <span className="pt-plate-top">BRASIL</span>
      <span className="pt-plate-num">{value}</span>
    </span>
  );
}

function AssetCard({ item, klass, index, onOpenImage }: { item: Record<string, unknown>; klass: AssetClass; index: number; onOpenImage: (u: string) => void }) {
  const plate = klass.source === 'placas' ? findPlate(item) : null;
  const entries = Object.entries(item).filter(([k]) => !(plate && k === plate.key));

  return (
    <div className="pt-asset" style={{ '--c': klass.color, '--c-soft': klass.soft } as React.CSSProperties}>
      <div className="pt-asset-head">
        <span className="pt-asset-icon"><Svg size={18}>{klass.icon}</Svg></span>
        <span className="pt-asset-index">{klass.singular} {index + 1}</span>
        {plate && <PlateBadge value={plate.value} />}
      </div>
      <div className="pt-asset-body">
        {entries.length > 0 ? (
          <ProfileCardEntries entries={entries} query="" onOpenImage={onOpenImage} />
        ) : (
          <p className="ef-empty">Sem detalhes adicionais.</p>
        )}
      </div>
    </div>
  );
}

function AssetCollection({ klass, spec, sr, onOpenImage, delay }: { klass: AssetClass; spec: SectionSpec; sr: Record<string, unknown>; onOpenImage: (u: string) => void; delay: number }) {
  const val = sr[spec.source];
  const count = countRecords(val);
  const empty = isEmptyValue(val) || (Array.isArray(val) && val.length === 0) || (isPlainObject(val) && Object.keys(val).length === 0);
  const objectItems = Array.isArray(val) && val.length > 0 && val.every(isPlainObject) ? (val as Record<string, unknown>[]) : null;

  return (
    <motion.section
      className="pt-collection"
      style={{ '--c': klass.color, '--c-soft': klass.soft } as React.CSSProperties}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <header className="pt-collection-head">
        <span className="pt-collection-icon"><Svg size={22}>{klass.icon}</Svg></span>
        <div className="pt-collection-titles">
          <h2 className="pt-collection-title">{klass.label}</h2>
          <p className="pt-collection-sub">{klass.sub}</p>
        </div>
        {count != null && count > 0 && <span className="pt-collection-count">{count}</span>}
      </header>

      {empty ? (
        <p className="ef-empty">{spec.emptyText ?? `Nenhum registro de ${klass.label.toLowerCase()}.`}</p>
      ) : objectItems ? (
        <div className="pt-assets">
          {objectItems.map((item, i) => (
            <AssetCard key={i} item={item} klass={klass} index={i} onOpenImage={onOpenImage} />
          ))}
        </div>
      ) : (
        <ProfileValueBlock keyName={spec.source} value={val} query="" onOpenImage={onOpenImage} />
      )}
    </motion.section>
  );
}

export function PatrimonioPage({
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

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    let total = 0;
    for (const k of CLASSES) {
      const n = num(sr[k.source]);
      c[k.source] = n;
      total += n;
    }
    c.__total = total;
    return c;
  }, [sr]);

  // Só renderiza a coleção se a seção existir na página e (tiver conteúdo ou for alwaysShow).
  const collections = CLASSES.map((klass) => ({ klass, spec: bySource(klass.source) }))
    .filter((x): x is { klass: AssetClass; spec: SectionSpec } => !!x.spec)
    .filter(({ spec, klass }) => spec.alwaysShow || !isEmptyValue(sr[klass.source]));

  return (
    <div className="pt">
      {/* Resumo do patrimônio */}
      <div className="pt-vault">
        <div className="pt-vault-brand">
          <span className="pt-vault-icon"><Svg size={24}>{I.vault}</Svg></span>
          <div>
            <span className="pt-vault-eyebrow">Inventário de bens</span>
            <div className="pt-vault-total">
              <b>{counts.__total}</b>
              <span>{counts.__total === 1 ? 'bem localizado' : 'bens localizados'}</span>
            </div>
          </div>
        </div>
        <div className="pt-vault-metrics">
          {CLASSES.map((k) => (
            <div className="pt-vault-tile" key={k.source} style={{ '--c': k.color, '--c-soft': k.soft } as React.CSSProperties}>
              <span className="pt-vault-tile-icon"><Svg size={17}>{k.icon}</Svg></span>
              <b>{counts[k.source]}</b>
              <small>{k.label}</small>
            </div>
          ))}
        </div>
      </div>

      {/* Coleções */}
      {collections.map(({ klass, spec }, i) => (
        <AssetCollection key={klass.source} klass={klass} spec={spec} sr={sr} onOpenImage={onOpenImage} delay={Math.min(i * 0.05, 0.2)} />
      ))}
    </div>
  );
}
