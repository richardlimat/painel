/**
 * Helpers puros para o renderizador genérico do painel de pessoa
 * (src/components/painel/PersonProfilePanel.tsx). Mantidos livres de JSX/DOM
 * (exceto Blob, disponível em Node/browser) para serem testáveis
 * isoladamente — a árvore de renderização e o ciclo de vida de
 * `URL.createObjectURL`/`revokeObjectURL` ficam no componente.
 */

import { formatCurrency, formatDate } from './format';
import { isSafeHttpUrl } from './url';
import { classifyKey, type MaskClass } from './mask';

export const MAX_RENDER_DEPTH = 6;
export const MAX_RENDER_ITEMS = 50;

const BASE64_CHARSET_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const DOCUMENT_KEY_HINT_RE = /(base64|docsbase64|foto|imagem|imagembase64|documento|pdf|anexo)/;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i;
const IMAGE_KEY_HINT_RE = /(foto|imagem|selfie|fotografia|avatar|picture|photo)/;

/**
 * URL (http/https apenas — `javascript:`/`data:`/`file:` nunca passam aqui,
 * ver `isSafeHttpUrl`) que deve virar miniatura clicável em vez de texto.
 */
export function isLikelyImageUrl(key: string, value: unknown): boolean {
  if (!isSafeHttpUrl(value)) return false;
  if (IMAGE_EXT_RE.test(value)) return true;
  return IMAGE_KEY_HINT_RE.test(key.toLowerCase());
}

/**
 * Detecta conteúdo que não deve ser renderizado como texto cru (Base64 de
 * documento/foto, ou qualquer string muito longa que travaria o DOM).
 */
export function isLikelyDocumentBlob(key: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length > 2000) return true;
  const hinted = DOCUMENT_KEY_HINT_RE.test(key.toLowerCase());
  return hinted && value.length > 200 && BASE64_CHARSET_RE.test(value);
}

/** Tamanho aproximado (Base64 é ~4/3 do binário decodificado). */
export function formatApproxSize(base64Length: number): string {
  const bytes = Math.floor((base64Length * 3) / 4);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Formatação básica de valor primitivo (item 9: booleano, null, string vazia). */
export function describePrimitive(value: unknown): string {
  if (value === null || value === undefined) return 'Não informado';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'string') return value.trim() === '' ? 'Não informado' : value;
  return String(value);
}

const HTML_TAG_RE = /<[^>]*>/g;

/**
 * Remove marcação HTML de uma string antes de exibir — nunca
 * `dangerouslySetInnerHTML` em lugar nenhum do painel, então tag alguma
 * chega a ser interpretada pelo navegador; isto só limpa o texto visível
 * (aplicado a qualquer campo com cara de HTML, não só `linhaDoTempo`).
 */
export function stripHtmlTags(value: string): string {
  return value.replace(HTML_TAG_RE, '');
}

const DATE_KEY_HINT_RE = /(data|dt_|nascimento|entrada|saida|abertura|validade|emissao|vencimento)/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/;
const MONEY_KEY_HINT_RE = /(valor|renda|salario|salário|capital|patrimonio|patrimônio|preco|preço|credito|crédito|divida|dívida|receita|faturamento)/;

/**
 * Formatação por tipo/nome de campo (item 8): datas (ISO ou nome de campo
 * sugerindo data) em DD/MM/AAAA; número com nome de campo sugerindo dinheiro
 * em reais; string comum tem HTML removido antes de exibir; demais tipos
 * caem em `describePrimitive` (booleano→Sim/Não, null/vazio→"Não informado").
 */
export function formatScalarValue(keyName: string, value: unknown): string {
  const normalizedKey = keyName.toLowerCase();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return 'Não informado';
    const looksLikeDate = ISO_DATE_RE.test(trimmed) || (DATE_KEY_HINT_RE.test(normalizedKey) && !Number.isNaN(Date.parse(trimmed)));
    if (looksLikeDate) return formatDate(trimmed);
    return stripHtmlTags(value);
  }
  if (typeof value === 'number' && MONEY_KEY_HINT_RE.test(normalizedKey)) {
    return formatCurrency(value);
  }
  return describePrimitive(value);
}

/**
 * Transforma o nome cru de uma chave (camelCase/snake_case) num rótulo
 * legível — `dataNascimento` → "Data nascimento", `nome_mae` → "Nome mae".
 * Só formatação visual; acentos preservados. O CSS decide maiúsculas.
 */
export function humanizeKey(key: string): string {
  const cleaned = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return key;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Forma segura de exibir um valor FOLHA (não-container) do perfil. Retorna
 * `null` quando o valor é um container (array/objeto) que o chamador deve
 * percorrer. Concentra num único ponto as mesmas decisões de segurança da
 * árvore de renderização (imagem/documento/mascaramento/escalar), pra que a
 * versão em cartões (tela cheia) e a em accordion nunca divirjam.
 */
export type ProfileLeaf =
  | { kind: 'image'; url: string }
  | { kind: 'document'; base64: string }
  | { kind: 'masked'; cls: MaskClass; value: string }
  | { kind: 'text'; value: string };

export function classifyLeaf(keyName: string, value: unknown): ProfileLeaf | null {
  if (typeof value === 'string' && isLikelyImageUrl(keyName, value)) return { kind: 'image', url: value };
  if (typeof value === 'string' && isLikelyDocumentBlob(keyName, value)) return { kind: 'document', base64: value };
  const cls = classifyKey(keyName);
  if (cls !== 'none' && typeof value === 'string' && value !== '') return { kind: 'masked', cls, value };
  if (value === null || typeof value !== 'object') return { kind: 'text', value: formatScalarValue(keyName, value) };
  return null; // array ou objeto — container, o chamador percorre
}

/** Limita quantos itens de um array são renderizados diretamente. */
export function truncateItems<T>(items: T[], max: number = MAX_RENDER_ITEMS): { visible: T[]; hiddenCount: number } {
  if (items.length <= max) return { visible: items, hiddenCount: 0 };
  return { visible: items.slice(0, max), hiddenCount: items.length - max };
}

/** Sniffing simples de magic bytes — só o suficiente para abrir num preview razoável. */
export function guessMimeType(bytes: Uint8Array): string {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }
  return 'application/octet-stream';
}

/**
 * Decodifica Base64 para um Blob tipado — usado só quando o usuário clica
 * em "Visualizar" (nunca automaticamente). O chamador é responsável por
 * `URL.createObjectURL`/`revokeObjectURL` e por nunca persistir o resultado.
 */
export function decodeBase64ToBlob(base64: string): Blob {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: guessMimeType(bytes) });
}
