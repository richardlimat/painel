import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { fmtText, isEmptyValue } from '../../lib/profileFormat';
import { stripHtmlTags } from '../../lib/profileRender';

/**
 * Aba "Timeline": a linha do tempo da pessoa (evento `linhaDoTempo` da APIFull)
 * numa leitura cronológica rica — resumo no topo, filtro por categoria,
 * inversão de ordem e uma trilha vertical agrupada por ano. Substitui o
 * `TimelineSection` genérico (que continua sendo usado só nos resultados de
 * busca). Nenhum HTML da descrição é interpretado — sempre `stripHtmlTags`.
 */

interface CategoryMeta {
  label: string;
  color: string;
  soft: string;
  icon: ReactNode;
}

const ICONS = {
  pessoa: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
    </>
  ),
  familia: (
    <>
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.4" />
      <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
      <path d="M15 20c0-2.2 1.4-3.6 3.4-3.6S22 17.8 22 20" />
    </>
  ),
  trabalho: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </>
  ),
  empresa: (
    <>
      <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
      <path d="M14 10h5a1 1 0 0 1 1 1v10" />
      <path d="M8 8h.01M8 12h.01M8 16h.01M4 21h16" />
    </>
  ),
  politica: (
    <>
      <path d="M3 21h18M5 21V10M19 21V10M4 10l8-5 8 5M9 21v-6h6v6" />
    </>
  ),
  saude: (
    <>
      <path d="M3 12h4l2-5 4 10 2-5h6" />
    </>
  ),
  cnh: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="8.5" cy="12" r="2" />
      <path d="M13 10h5M13 14h5" />
    </>
  ),
  outros: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </>
  ),
};

const CATEGORIES: Record<string, CategoryMeta> = {
  PESSOAL: { label: 'Pessoal', color: '#0891b2', soft: '#ecfeff', icon: ICONS.pessoa },
  FAMILIA: { label: 'Família', color: '#db2777', soft: '#fdf2f8', icon: ICONS.familia },
  TRABALHO: { label: 'Trabalho', color: '#2563eb', soft: '#eff6ff', icon: ICONS.trabalho },
  EMPRESARIAL: { label: 'Empresarial', color: '#7c3aed', soft: '#f5f3ff', icon: ICONS.empresa },
  POLITICA: { label: 'Política', color: '#ca8a04', soft: '#fefce8', icon: ICONS.politica },
  SAUDE: { label: 'Saúde', color: '#059669', soft: '#ecfdf5', icon: ICONS.saude },
  CNH: { label: 'CNH', color: '#ea580c', soft: '#fff7ed', icon: ICONS.cnh },
};

const DEFAULT_CATEGORY: CategoryMeta = { label: 'Outros', color: '#64748b', soft: '#f8fafc', icon: ICONS.outros };

function categoryMeta(categoria: string): CategoryMeta {
  return CATEGORIES[categoria] ?? DEFAULT_CATEGORY;
}

interface TimelineEvent {
  categoria: string;
  date: Date | null;
  year: number | null;
  sortKey: number;
  descricao: string;
  idade: string;
  metadata: { label: string; value: string }[];
}

/** Datas vêm em ISO ("1973-03-16"), BR ("16/03/1973") ou com hora — cobre os três. */
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

function normalizeEvents(items: unknown[]): TimelineEvent[] {
  return items.map((raw) => {
    const ev = (raw ?? {}) as Record<string, unknown>;
    const date = parseDate(ev.data);
    const metaRaw = Array.isArray(ev.metadata) ? (ev.metadata as Record<string, unknown>[]) : [];
    const metadata = metaRaw
      .map((m) => ({
        label: fmtText(m.descricao ?? m.chave),
        value: stripHtmlTags(fmtText(m.valor)),
      }))
      .filter((m) => m.value !== '—');
    return {
      categoria: String(ev.categoria ?? '').toUpperCase(),
      date,
      year: date ? date.getFullYear() : null,
      sortKey: date ? date.getTime() : -Infinity,
      descricao: stripHtmlTags(fmtText(ev.descricao)),
      idade: isEmptyValue(ev.idade) ? '' : `${ev.idade} anos`,
      metadata,
    };
  });
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function PersonTimeline({ items }: { items: unknown[] }) {
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');

  const events = useMemo(() => normalizeEvents(items), [items]);

  /** Categorias presentes, na ordem canônica + extras, com contagem. */
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.categoria, (counts.get(e.categoria) ?? 0) + 1);
    const known = Object.keys(CATEGORIES).filter((k) => counts.has(k));
    const extras = [...counts.keys()].filter((k) => !CATEGORIES[k]);
    return [...known, ...extras].map((key) => ({ key, count: counts.get(key) ?? 0 }));
  }, [events]);

  const years = useMemo(() => {
    const withDate = events.filter((e) => e.year != null).map((e) => e.year as number);
    if (withDate.length === 0) return null;
    return { min: Math.min(...withDate), max: Math.max(...withDate) };
  }, [events]);

  /** Eventos filtrados e agrupados por ano, na ordem escolhida. */
  const groups = useMemo(() => {
    const dir = order === 'desc' ? -1 : 1;
    const filtered = activeCat ? events.filter((e) => e.categoria === activeCat) : events;
    const sorted = [...filtered].sort((a, b) => (a.sortKey - b.sortKey) * dir);
    const byYear: { year: number | null; events: TimelineEvent[] }[] = [];
    for (const ev of sorted) {
      const last = byYear[byYear.length - 1];
      if (last && last.year === ev.year) last.events.push(ev);
      else byYear.push({ year: ev.year, events: [ev] });
    }
    return byYear;
  }, [events, activeCat, order]);

  if (events.length === 0) {
    return (
      <div className="tl-empty">
        <span className="tl-empty-icon">
          <ClockIcon />
        </span>
        <p className="tl-empty-title">Sem eventos na linha do tempo</p>
        <p className="tl-empty-sub">Não encontramos marcos cronológicos para esta pessoa.</p>
      </div>
    );
  }

  const filteredCount = activeCat ? (categoryCounts.find((c) => c.key === activeCat)?.count ?? 0) : events.length;

  return (
    <div className="tl">
      {/* Resumo */}
      <div className="tl-summary">
        <div className="tl-summary-head">
          <span className="tl-summary-icon">
            <ClockIcon />
          </span>
          <div>
            <h3 className="tl-summary-title">Linha do tempo</h3>
            <p className="tl-summary-sub">
              Marcos da vida da pessoa em ordem cronológica
            </p>
          </div>
        </div>
        <div className="tl-stats">
          <div className="tl-stat">
            <b>{events.length}</b>
            <small>eventos</small>
          </div>
          {years && (
            <div className="tl-stat">
              <b>
                {years.min}
                <span className="tl-stat-arrow">→</span>
                {years.max}
              </b>
              <small>{years.max - years.min} anos de histórico</small>
            </div>
          )}
          <div className="tl-stat">
            <b>{categoryCounts.length}</b>
            <small>categorias</small>
          </div>
        </div>
      </div>

      {/* Controles: filtro por categoria + ordem */}
      <div className="tl-controls">
        <div className="tl-filters" role="group" aria-label="Filtrar por categoria">
          <button
            type="button"
            className={`tl-filter ${activeCat === null ? 'active' : ''}`}
            onClick={() => setActiveCat(null)}
          >
            Todos
            <span className="tl-filter-count">{events.length}</span>
          </button>
          {categoryCounts.map(({ key, count }) => {
            const meta = categoryMeta(key);
            const active = activeCat === key;
            return (
              <button
                key={key}
                type="button"
                className={`tl-filter ${active ? 'active' : ''}`}
                onClick={() => setActiveCat(active ? null : key)}
                style={active ? { borderColor: meta.color, background: meta.soft, color: meta.color } : undefined}
              >
                <span className="tl-filter-dot" style={{ background: meta.color }} />
                {meta.label}
                <span className="tl-filter-count">{count}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="tl-order"
          onClick={() => setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
          title="Inverter a ordem cronológica"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 4v16M7 20l-3-3M7 20l3-3" />
            <path d="M17 20V4M17 4l-3 3M17 4l3 3" />
          </svg>
          {order === 'desc' ? 'Mais recentes' : 'Mais antigos'}
        </button>
      </div>

      {/* Trilha */}
      {filteredCount === 0 ? (
        <p className="tl-noresult">Nenhum evento nesta categoria.</p>
      ) : (
        <div className="tl-track">
          {groups.map((group, gi) => (
            <div className="tl-year-group" key={`${group.year ?? 'sem'}-${gi}`}>
              <div className="tl-year">
                <span className="tl-year-label">{group.year ?? 'Sem data'}</span>
                <span className="tl-year-count">{group.events.length}</span>
              </div>
              <div className="tl-items">
                {group.events.map((ev, i) => {
                  const meta = categoryMeta(ev.categoria);
                  return (
                    <motion.div
                      className="tl-item"
                      key={i}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.28, delay: Math.min(i * 0.04, 0.24) }}
                    >
                      <span className="tl-node" style={{ background: meta.color, boxShadow: `0 0 0 4px ${meta.soft}` }}>
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          {meta.icon}
                        </svg>
                      </span>
                      <div className="tl-card">
                        <div className="tl-card-head">
                          <span className="tl-badge" style={{ background: meta.soft, color: meta.color }}>
                            {meta.label}
                          </span>
                          <time className="tl-date">
                            {ev.date ? ev.date.toLocaleDateString('pt-BR') : 'Data desconhecida'}
                          </time>
                          {ev.idade && <span className="tl-age">aos {ev.idade}</span>}
                        </div>
                        <p className="tl-desc">{ev.descricao}</p>
                        {ev.metadata.length > 0 && (
                          <div className="tl-meta">
                            {ev.metadata.map((m, k) => (
                              <span className="tl-meta-chip" key={k}>
                                <span className="tl-meta-label">{m.label}</span>
                                {m.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
