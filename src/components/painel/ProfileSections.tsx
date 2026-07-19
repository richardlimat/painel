import { type ReactNode } from 'react';
import { classifyKey } from '../../lib/mask';
import { isValidCPF, formatCPF } from '../../lib/format';
import { isSafeHttpUrl } from '../../lib/url';
import { stripHtmlTags, humanizeKey } from '../../lib/profileRender';
import { fmtDate, fmtIdade, fmtLocalidade, fmtMoney, fmtText, getPath, isEmptyValue } from '../../lib/profileFormat';
import type { FieldSpec, SectionSpec } from '../../lib/profileSchema';
import { MaskedValue, ProfileValueBlock, highlightMatch } from './ProfileValue';
import { PersonIcon } from '../flow/icons';

const lastSegment = (path: string) => path.split('.').pop() ?? path;

/** Um cartão rótulo/valor de campo curado, com mascaramento por chave sensível. */
function FieldCard({ field, source, query }: { field: FieldSpec; source: unknown; query: string }) {
  const raw = field.path === '' ? source : getPath(source, field.path);
  const formatted = field.format ? field.format(raw) : fmtText(raw);
  const cls = classifyKey(field.maskKey ?? lastSegment(field.path));

  let value: ReactNode;
  if (formatted === '—') {
    value = <span className="ef-muted">—</span>;
  } else if (cls !== 'none') {
    value = <MaskedValue value={formatted} cls={cls} />;
  } else {
    value = highlightMatch(formatted, query);
  }

  return (
    <div className="ef-card">
      <span className="ef-card-label">{highlightMatch(field.label, query)}</span>
      <div className="ef-card-value">{value}</div>
    </div>
  );
}

/** Grade de campos rotulados a partir de um único objeto (kind 'fields'). */
function FieldsGrid({ source, fields, query }: { source: unknown; fields: FieldSpec[]; query: string }) {
  return (
    <div className="ef-grid">
      {fields.map((f) => (
        <FieldCard key={f.label} field={f} source={source} query={query} />
      ))}
    </div>
  );
}

/** Lista curada: um "record" por item, só com os campos com valor (kind 'list'). */
function ListSection({ items, fields, query }: { items: unknown[]; fields: FieldSpec[]; query: string }) {
  return (
    <div className="ef-records">
      {items.map((item, i) => {
        const present = fields.filter((f) => {
          const raw = f.path === '' ? item : getPath(item, f.path);
          const formatted = f.format ? f.format(raw) : fmtText(raw);
          return formatted !== '—';
        });
        if (present.length === 0) return null;
        return (
          <div className="ef-record" key={i}>
            <div className="ef-grid">
              {present.map((f) => (
                <FieldCard key={f.label} field={f} source={item} query={query} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const pick = (item: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) if (!isEmptyValue(item[k])) return item[k];
  return undefined;
};

const FLAG_LABELS: Record<string, string> = {
  OBITO: 'Óbito',
  INDICATIVO_CRIMINAL: 'Indicativo criminal',
};

/** Cards de pessoas relacionadas (parentes, relacionados por endereço, genitores). */
function PeopleSection({
  items,
  query,
  onOpenImage,
  onConsult,
}: {
  items: unknown[];
  query: string;
  onOpenImage: (url: string) => void;
  onConsult: (cpf: string) => void;
}) {
  return (
    <div className="ef-people">
      {items.map((raw, i) => {
        const item = (raw ?? {}) as Record<string, unknown>;
        const nome = pick(item, ['nome']);
        const grau = pick(item, ['grau', 'relacao', 'vinculo']);
        const cpfRaw = pick(item, ['cpfParente', 'cpf', 'cpf_genitor']);
        const cpf = cpfRaw != null ? String(cpfRaw) : '';
        const foto = pick(item, ['foto']);
        const idade = pick(item, ['idade']);
        const dataNasc = pick(item, ['dataNasc', 'dataNascimento']);
        const renda = pick(item, ['renda']);
        const cidade = pick(item, ['cidade']);
        const uf = pick(item, ['uf']);
        const profissao = pick(item, ['profissao']);
        const flags = Array.isArray(item.flag) ? (item.flag as string[]) : [];
        const localidade = fmtLocalidade(cidade, uf);
        const canConsult = isValidCPF(cpf);

        const attrs: { label: string; value: string; maskKey?: string }[] = [
          { label: 'CPF', value: canConsult ? formatCPF(cpf) : fmtText(cpfRaw), maskKey: 'cpf' },
          { label: 'Renda estimada', value: fmtMoney(renda) },
          { label: 'Nascimento', value: fmtDate(dataNasc) },
          { label: 'Idade', value: fmtIdade(idade) },
          { label: 'Localidade', value: localidade },
          { label: 'Profissão', value: fmtText(profissao) },
        ].filter((a) => a.value !== '—');

        return (
          <div className="ef-person-card" key={i}>
            <div className="ef-person-head">
              <button
                type="button"
                className="ef-person-avatar"
                onClick={() => (isSafeHttpUrl(foto) ? onOpenImage(String(foto)) : undefined)}
                aria-label={isSafeHttpUrl(foto) ? 'Ampliar foto' : undefined}
                disabled={!isSafeHttpUrl(foto)}
              >
                {isSafeHttpUrl(foto) ? <img src={String(foto)} alt="" loading="lazy" /> : <PersonIcon className="ef-person-avatar-icon" />}
              </button>
              <div className="ef-person-title">
                <strong>{highlightMatch(fmtText(nome), query)}</strong>
                <div className="ef-person-badges">
                  {!isEmptyValue(grau) && <span className="ef-relation">{fmtText(grau)}</span>}
                  {flags.map((f) => (
                    <span className="ef-flag" key={f}>
                      {FLAG_LABELS[f] ?? f}
                    </span>
                  ))}
                </div>
              </div>
              {canConsult && (
                <button type="button" className="ef-consult" onClick={() => onConsult(cpf)}>
                  Consultar
                </button>
              )}
            </div>
            <div className="ef-grid ef-person-grid">
              {attrs.map((a) => (
                <div className="ef-card" key={a.label}>
                  <span className="ef-card-label">{a.label}</span>
                  <div className="ef-card-value">
                    {a.maskKey && classifyKey(a.maskKey) !== 'none' ? (
                      <MaskedValue value={a.value} cls={classifyKey(a.maskKey)} />
                    ) : (
                      highlightMatch(a.value, query)
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Credenciais vazadas: agrupadas por alvo (e-mail/usuário); senha SEMPRE mascarada (hard). */
function LeaksSection({ items, query }: { items: unknown[]; query: string }) {
  return (
    <div className="ef-records">
      {items.map((raw, i) => {
        const item = (raw ?? {}) as Record<string, unknown>;
        const resultados = Array.isArray(item.resultados) ? item.resultados : [];
        return (
          <div className="ef-record" key={i}>
            <h4 className="ef-group-title">
              {fmtText(item.tipo)}: {highlightMatch(fmtText(item.valor), query)}
              <span className="ef-count">{resultados.length}</span>
            </h4>
            <div className="ef-leak-list">
              {resultados.map((r, j) => {
                const res = (r ?? {}) as Record<string, unknown>;
                return (
                  <div className="ef-leak" key={j}>
                    <span className="ef-leak-host">{fmtText(res.host ?? res.url)}</span>
                    <span className="ef-leak-login">
                      <MaskedValue value={fmtText(res.login)} cls="soft" />
                    </span>
                    <span className="ef-leak-pass">
                      <MaskedValue value={fmtText(res.password)} cls="hard" />
                    </span>
                    <span className="ef-leak-date">{fmtDate(res.file_date)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TL_CATEGORY_CLASS: Record<string, string> = {
  PESSOAL: 'pessoal',
  FAMILIA: 'familia',
  TRABALHO: 'trabalho',
  EMPRESARIAL: 'empresarial',
  POLITICA: 'politica',
  SAUDE: 'saude',
  CNH: 'cnh',
};

/** Linha do tempo cronológica (mais recente no topo); HTML da descrição sempre removido. */
function TimelineSection({ items, query }: { items: unknown[]; query: string }) {
  const sorted = [...items].sort((a, b) => {
    const da = String((a as Record<string, unknown>)?.data ?? '');
    const db = String((b as Record<string, unknown>)?.data ?? '');
    return db.localeCompare(da);
  });
  return (
    <div className="ef-timeline">
      {sorted.map((raw, i) => {
        const ev = (raw ?? {}) as Record<string, unknown>;
        const categoria = String(ev.categoria ?? '');
        return (
          <div className="ef-timeline-item" key={i}>
            <span className={`ef-timeline-dot ${TL_CATEGORY_CLASS[categoria] ?? ''}`} />
            <time className="ef-timeline-date">{fmtDate(ev.data)}</time>
            <div className="ef-timeline-body">
              {categoria && <span className="ef-timeline-cat">{categoria}</span>}
              <span className="ef-timeline-desc">
                {highlightMatch(stripHtmlTags(fmtText(ev.descricao)), query)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Propensões de consumo: mostra como chips só os interesses ativos (valor truthy). */
function FlagsSection({ data, query }: { data: Record<string, unknown>; query: string }) {
  const skip = new Set(['cpf', 'csb8', 'csb8_faixa']);
  const active = Object.entries(data)
    .filter(([k, v]) => !skip.has(k) && (v === 1 || v === true))
    .map(([k]) => humanizeKey(k));
  return (
    <>
      {(data.csb8_faixa != null || data.csb8 != null) && (
        <div className="ef-grid">
          {data.csb8_faixa != null && (
            <div className="ef-card">
              <span className="ef-card-label">Faixa de poder de compra</span>
              <div className="ef-card-value">{fmtText(data.csb8_faixa)}</div>
            </div>
          )}
          {data.csb8 != null && (
            <div className="ef-card">
              <span className="ef-card-label">Índice CSB8</span>
              <div className="ef-card-value">{fmtText(data.csb8)}</div>
            </div>
          )}
        </div>
      )}
      {active.length > 0 ? (
        <div className="ef-chips" style={{ marginTop: 12 }}>
          {active.map((label) => (
            <span className="ef-chip" key={label}>
              {highlightMatch(label, query)}
            </span>
          ))}
        </div>
      ) : (
        <p className="ef-empty">Nenhuma propensão de consumo ativa.</p>
      )}
    </>
  );
}

function sourceIsEmpty(val: unknown): boolean {
  if (val == null) return true;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'object') return Object.keys(val as object).length === 0;
  return isEmptyValue(val);
}

function countFor(val: unknown): number | undefined {
  return Array.isArray(val) ? val.length : undefined;
}

/**
 * Renderiza uma seção do schema a partir do SERVICE_RESPONSE. Seções com
 * `alwaysShow` aparecem mesmo vazias (com `emptyText`); as demais somem quando
 * não há dados, para não poluir a página.
 */
export function ProfileSectionView({
  spec,
  serviceResponse,
  query,
  onOpenImage,
  onConsult,
}: {
  spec: SectionSpec;
  serviceResponse: Record<string, unknown>;
  query: string;
  onOpenImage: (url: string) => void;
  onConsult: (cpf: string) => void;
}) {
  const val = serviceResponse[spec.source];
  const empty = sourceIsEmpty(val);
  if (empty && !spec.alwaysShow) return null;

  const count = countFor(val);

  let body: ReactNode;
  if (empty) {
    body = <p className="ef-empty">{spec.emptyText ?? 'Nenhum registro encontrado.'}</p>;
  } else if (spec.kind === 'fields') {
    body = <FieldsGrid source={val} fields={spec.fields ?? []} query={query} />;
  } else if (spec.kind === 'list') {
    body = <ListSection items={val as unknown[]} fields={spec.fields ?? []} query={query} />;
  } else if (spec.kind === 'people') {
    body = <PeopleSection items={val as unknown[]} query={query} onOpenImage={onOpenImage} onConsult={onConsult} />;
  } else if (spec.kind === 'leaks') {
    body = <LeaksSection items={val as unknown[]} query={query} />;
  } else if (spec.kind === 'timeline') {
    body = <TimelineSection items={val as unknown[]} query={query} />;
  } else if (spec.kind === 'flags') {
    body = <FlagsSection data={val as Record<string, unknown>} query={query} />;
  } else {
    body = <ProfileValueBlock keyName={spec.source} value={val} query={query} onOpenImage={onOpenImage} />;
  }

  return (
    <section className="ef-section">
      <h3 className="ef-section-title">
        {highlightMatch(spec.title, query)}
        {count != null && count > 0 && <span className="ef-count">{count}</span>}
      </h3>
      {body}
    </section>
  );
}
