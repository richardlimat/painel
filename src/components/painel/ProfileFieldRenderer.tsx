import { useEffect, useState, type ReactNode } from 'react';
import { applyMask, classifyKey, type MaskClass } from '../../lib/mask';
import {
  MAX_RENDER_DEPTH,
  decodeBase64ToBlob,
  formatApproxSize,
  formatScalarValue,
  isLikelyDocumentBlob,
  truncateItems,
} from '../../lib/profileRender';
import { normalizeText } from '../../lib/format';

/**
 * Renderizador genérico de campos do perfil (pessoa via APIFull ou empresa
 * via `companyToProfileSource`) — extraído de PersonProfilePanel para ser
 * reaproveitado tanto pelas categorias em tela cheia quanto por qualquer
 * outra visão futura. Sem estado de fonte de dados aqui, só apresentação.
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
function valueMatchesQuery(value: unknown, query: string, depth = 0): boolean {
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
 * Base64/documento grande: nunca renderizado como texto cru. Só decodifica
 * e cria um Blob URL quando o usuário clica em "Visualizar" — o URL é
 * revogado ao trocar de documento ou desmontar o painel, nunca persiste em
 * localStorage/sessionStorage.
 */
function DocumentValue({ base64 }: { base64: string }) {
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
          const url = URL.createObjectURL(decodeBase64ToBlob(base64));
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          window.open(url, '_blank', 'noopener,noreferrer');
        }}
      >
        Visualizar
      </button>
    </span>
  );
}

/**
 * Campos "soft" mascaram por padrão com botão de revelar — isso é só
 * conveniência de UI, não controle de acesso (ver README/aviso de
 * segurança). Campos "hard" (credenciaisVazadas etc.) nunca mostram
 * `Revelar` — applyMask já garante isso independente do estado local.
 */
function MaskedValue({ value, cls }: { value: string; cls: MaskClass }) {
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

export function RenderValue({
  label,
  keyName,
  value,
  depth,
  query,
  maskSoft = true,
}: {
  label: string;
  keyName: string;
  value: unknown;
  depth: number;
  query: string;
  /**
   * Dados de empresa vindos do registro público (CNPJ, endereço, telefone…)
   * não precisam do mascaramento "soft" pensado pra dados pessoais da
   * APIFull — só campos "hard" (senha/credenciais) continuam sempre
   * ocultos, em qualquer fonte. Pessoa (padrão) mantém o comportamento
   * original.
   */
  maskSoft?: boolean;
}) {
  if (depth > MAX_RENDER_DEPTH) {
    return (
      <div className="profile-row">
        <span>{highlightMatch(label, query)}</span>
        <span className="profile-row-value">…</span>
      </div>
    );
  }

  if (typeof value === 'string' && isLikelyDocumentBlob(keyName, value)) {
    return (
      <div className="profile-row">
        <span>{highlightMatch(label, query)}</span>
        <DocumentValue base64={value} />
      </div>
    );
  }

  const rawCls = classifyKey(keyName);
  const cls = rawCls === 'soft' && !maskSoft ? 'none' : rawCls;
  if (cls !== 'none' && typeof value === 'string' && value !== '') {
    return (
      <div className="profile-row">
        <span>{highlightMatch(label, query)}</span>
        <MaskedValue value={value} cls={cls} />
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
            <RenderValue label={`#${i + 1}`} keyName={keyName} value={item} depth={depth + 1} query={query} maskSoft={maskSoft} />
          </div>
        ))}
        {hiddenCount > 0 && <p className="profile-more">+{hiddenCount} mais</p>}
      </div>
    );
  }

  if (value !== null && typeof value === 'object') {
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
          <RenderValue key={k} label={k} keyName={k} value={v} depth={depth + 1} query={query} maskSoft={maskSoft} />
        ))}
      </div>
    );
  }

  return (
    <div className="profile-row">
      <span>{highlightMatch(label, query)}</span>
      <span className="profile-row-value">{highlightMatch(formatScalarValue(keyName, value), query)}</span>
    </div>
  );
}
