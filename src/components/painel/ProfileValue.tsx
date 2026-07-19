import { useEffect, useState, type ReactNode } from 'react';
import { applyMask, type MaskClass } from '../../lib/mask';
import {
  MAX_RENDER_DEPTH,
  classifyLeaf,
  decodeBase64ToBlob,
  formatApproxSize,
  formatScalarValue,
  humanizeKey,
  truncateItems,
} from '../../lib/profileRender';
import { normalizeText } from '../../lib/format';

/**
 * Primitivas de renderização de valor do perfil da APIFull, compartilhadas
 * entre o painel em accordion (`PersonProfilePanel`) e a visão em cartões de
 * tela cheia (`EntityDetail`). Concentrar aqui garante que as regras de
 * segurança (mascaramento, Base64 nunca cru, imagem só via miniatura) sejam
 * as mesmas nas duas visões — ver também `classifyLeaf` em profileRender.
 */

export function countRecords(value: unknown): number | undefined {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === 'object') return Object.keys(value).length;
  return undefined;
}

export function categoryRecordCount(entries: [string, unknown][]): number {
  return entries.reduce((sum, [, v]) => sum + (countRecords(v) ?? 1), 0);
}

/** Realce discreto do trecho encontrado — só o primeiro match, sem HTML perigoso (texto React puro). */
export function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/** Busca recursiva por nome de campo/valor textual — mesmo limite de profundidade da renderização. */
export function valueMatchesQuery(value: unknown, query: string, depth = 0): boolean {
  if (depth > MAX_RENDER_DEPTH) return false;
  if (value == null) return false;
  if (typeof value === 'string') return normalizeText(value).includes(query);
  if (typeof value === 'number' || typeof value === 'boolean') return normalizeText(String(value)).includes(query);
  if (Array.isArray(value)) return value.some((v) => valueMatchesQuery(v, query, depth + 1));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([k, v]) => normalizeText(k).includes(query) || valueMatchesQuery(v, query, depth + 1),
    );
  }
  return false;
}

export function entryMatchesQuery(key: string, value: unknown, query: string): boolean {
  return normalizeText(key).includes(query) || valueMatchesQuery(value, query);
}

/**
 * Base64/documento grande: nunca renderizado como texto cru. Só decodifica e
 * cria um Blob URL quando o usuário clica em "Visualizar" — o URL é revogado
 * ao trocar de documento ou desmontar, nunca persiste em storage. Se o
 * conteúdo for imagem, abre no lightbox; caso contrário (PDF etc.), abre em
 * nova aba.
 */
export function DocumentValue({ base64, onOpenImage }: { base64: string; onOpenImage: (url: string) => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <span className="profile-doc">
      <span>Documento disponível ({formatApproxSize(base64.length)})</span>
      <button
        type="button"
        className="btn plain"
        onClick={() => {
          const blob = decodeBase64ToBlob(base64);
          const url = URL.createObjectURL(blob);
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          if (blob.type.startsWith('image/')) {
            onOpenImage(url);
          } else {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        }}
      >
        Visualizar
      </button>
    </span>
  );
}

/** URL http(s) de imagem: miniatura clicável (lazy, fallback de erro), nunca texto cru. */
export function ImageUrlValue({ url, alt, onOpen }: { url: string; alt: string; onOpen: (url: string) => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="profile-row-value">Imagem indisponível</span>;
  }
  return (
    <button type="button" className="profile-image-thumb" onClick={() => onOpen(url)} aria-label={`Ampliar imagem: ${alt}`}>
      <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
    </button>
  );
}

/**
 * Campos "soft" mascaram por padrão com botão de revelar — conveniência de
 * UI, não controle de acesso (ver README). Campos "hard" nunca mostram
 * "Revelar" — applyMask já garante isso independente do estado local.
 */
export function MaskedValue({ value, cls }: { value: string; cls: MaskClass }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span className="profile-masked">
      <span>{applyMask(value, cls, revealed)}</span>
      {cls === 'soft' && (
        <button type="button" className="profile-reveal" onClick={() => setRevealed((r) => !r)}>
          {revealed ? 'Ocultar' : 'Revelar'}
        </button>
      )}
    </span>
  );
}

/**
 * Renderiza apenas a FOLHA de um valor (imagem/documento/mascarado/escalar),
 * já com realce de busca. Retorna `null` quando o valor é um container
 * (array/objeto) — nesse caso o chamador percorre a estrutura. Fonte única
 * das decisões de exibição segura, via `classifyLeaf`.
 */
export function ProfileLeafValue({
  keyName,
  label,
  value,
  query,
  onOpenImage,
}: {
  keyName: string;
  label: string;
  value: unknown;
  query: string;
  onOpenImage: (url: string) => void;
}): ReactNode | null {
  const leaf = classifyLeaf(keyName, value);
  if (!leaf) return null;
  switch (leaf.kind) {
    case 'image':
      return <ImageUrlValue url={leaf.url} alt={label} onOpen={onOpenImage} />;
    case 'document':
      return <DocumentValue base64={leaf.base64} onOpenImage={onOpenImage} />;
    case 'masked':
      return <MaskedValue value={leaf.value} cls={leaf.cls} />;
    case 'text':
      return <span className="profile-row-value">{highlightMatch(leaf.value, query)}</span>;
  }
}

/**
 * Árvore genérica em accordion (usada pelo `PersonProfilePanel`). Mantida com
 * a mesma estrutura de DOM/classes de antes — só as folhas passam a vir de
 * `ProfileLeafValue`, single-source com a visão em cartões.
 */
export function RenderValue({
  label,
  keyName,
  value,
  depth,
  query,
  onOpenImage,
}: {
  label: string;
  keyName: string;
  value: unknown;
  depth: number;
  query: string;
  onOpenImage: (url: string) => void;
}) {
  if (depth > MAX_RENDER_DEPTH) {
    return (
      <div className="profile-row">
        <span>{highlightMatch(label, query)}</span>
        <span className="profile-row-value">…</span>
      </div>
    );
  }

  const leaf = ProfileLeafValue({ keyName, label, value, query, onOpenImage });
  if (leaf !== null) {
    return (
      <div className="profile-row">
        <span>{highlightMatch(label, query)}</span>
        {leaf}
      </div>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className="profile-row">
          <span>{highlightMatch(label, query)}</span>
          <span className="profile-row-value">Nenhum registro encontrado</span>
        </div>
      );
    }
    const { visible, hiddenCount } = truncateItems(value);
    return (
      <div className="profile-array">
        {visible.map((item, i) => (
          <div className="profile-array-item" key={i}>
            <RenderValue
              label={`#${i + 1}`}
              keyName={keyName}
              value={item}
              depth={depth + 1}
              query={query}
              onOpenImage={onOpenImage}
            />
          </div>
        ))}
        {hiddenCount > 0 && <p className="profile-more">+{hiddenCount} mais</p>}
      </div>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return (
      <div className="profile-row">
        <span>{highlightMatch(label, query)}</span>
        <span className="profile-row-value">Nenhum registro encontrado</span>
      </div>
    );
  }
  return (
    <div className="profile-object">
      {entries.map(([k, v]) => (
        <RenderValue key={k} label={k} keyName={k} value={v} depth={depth + 1} query={query} onOpenImage={onOpenImage} />
      ))}
    </div>
  );
}

// ─── Visão em cartões (tela cheia) ─────────────────────────────────────────

/** Um valor escalar dentro de um cartão — folha segura, ou fallback textual. */
function CardScalar({
  keyName,
  label,
  value,
  query,
  onOpenImage,
}: {
  keyName: string;
  label: string;
  value: unknown;
  query: string;
  onOpenImage: (url: string) => void;
}) {
  const leaf = ProfileLeafValue({ keyName, label, value, query, onOpenImage });
  return leaf ?? <span className="profile-row-value">{highlightMatch(formatScalarValue(keyName, value), query)}</span>;
}

const isLeafEntry = ([k, v]: [string, unknown]) => classifyLeaf(k, v) !== null;

/**
 * Renderiza uma lista de entradas [chave, valor] como conteúdo de uma página
 * em cartões: escalares viram cartões rotulados numa grade; objetos e arrays
 * viram sub-seções tituladas (recursivas). Toda folha passa pelas mesmas
 * primitivas seguras acima.
 */
export function ProfileCardEntries({
  entries,
  query,
  onOpenImage,
  depth = 0,
}: {
  entries: [string, unknown][];
  query: string;
  onOpenImage: (url: string) => void;
  depth?: number;
}) {
  if (depth > MAX_RENDER_DEPTH) {
    return <p className="ef-empty">…</p>;
  }
  const scalars = entries.filter(isLeafEntry);
  const groups = entries.filter((e) => !isLeafEntry(e));

  return (
    <>
      {scalars.length > 0 && (
        <div className="ef-grid">
          {scalars.map(([k, v]) => (
            <div className="ef-card" key={k}>
              <span className="ef-card-label">{highlightMatch(humanizeKey(k), query)}</span>
              <div className="ef-card-value">
                <CardScalar keyName={k} label={humanizeKey(k)} value={v} query={query} onOpenImage={onOpenImage} />
              </div>
            </div>
          ))}
        </div>
      )}
      {groups.map(([k, v]) => (
        <ProfileCardGroup key={k} name={humanizeKey(k)} keyName={k} value={v} query={query} onOpenImage={onOpenImage} depth={depth} />
      ))}
    </>
  );
}

/** Uma sub-seção titulada (objeto ou array) dentro de uma página. */
function ProfileCardGroup({
  name,
  keyName,
  value,
  query,
  onOpenImage,
  depth,
}: {
  name: string;
  keyName: string;
  value: unknown;
  query: string;
  onOpenImage: (url: string) => void;
  depth: number;
}) {
  const count = countRecords(value);

  let body: ReactNode;
  if (Array.isArray(value)) {
    if (value.length === 0) {
      body = <p className="ef-empty">Nenhum registro encontrado</p>;
    } else {
      const { visible, hiddenCount } = truncateItems(value);
      const allScalars = visible.every((item) => classifyLeaf(keyName, item) !== null);
      body = (
        <>
          {allScalars ? (
            <div className="ef-chips">
              {visible.map((item, i) => (
                <span className="ef-chip" key={i}>
                  <CardScalar keyName={keyName} label={name} value={item} query={query} onOpenImage={onOpenImage} />
                </span>
              ))}
            </div>
          ) : (
            <div className="ef-records">
              {visible.map((item, i) => (
                <div className="ef-record" key={i}>
                  {classifyLeaf(keyName, item) !== null ? (
                    <div className="ef-card-value">
                      <CardScalar keyName={keyName} label={name} value={item} query={query} onOpenImage={onOpenImage} />
                    </div>
                  ) : (
                    <ProfileCardEntries
                      entries={Object.entries(item as Record<string, unknown>)}
                      query={query}
                      onOpenImage={onOpenImage}
                      depth={depth + 1}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {hiddenCount > 0 && <p className="profile-more">+{hiddenCount} mais</p>}
        </>
      );
    }
  } else {
    const entries = Object.entries(value as Record<string, unknown>);
    body =
      entries.length === 0 ? (
        <p className="ef-empty">Nenhum registro encontrado</p>
      ) : (
        <ProfileCardEntries entries={entries} query={query} onOpenImage={onOpenImage} depth={depth + 1} />
      );
  }

  return (
    <section className="ef-group">
      <h4 className="ef-group-title">
        {highlightMatch(name, query)}
        {count != null && <span className="ef-count">{count}</span>}
      </h4>
      {body}
    </section>
  );
}
