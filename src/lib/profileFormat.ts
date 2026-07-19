/**
 * Formatadores puros para os campos curados do perfil da APIFull
 * (src/lib/profileSchema.ts). Sem JSX/DOM — testáveis isoladamente. Reaproveitam
 * `formatDate`/`formatCurrency` de format.ts.
 */
import { formatCurrency, formatDate } from './format';

const EMPTY_TOKENS = new Set(['', 'n/a', 'na', 'null', 'undefined', 'data invalida', 'data inválida', '--', '-', '.']);

/** Resolve um caminho pontilhado (ex.: "mae.nome", "tituloEleitor.zona") num objeto. */
export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/** true para valores "vazios" que devem virar travessão (—) na exibição. */
export function isEmptyValue(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return EMPTY_TOKENS.has(v.trim().toLowerCase());
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function fmtText(v: unknown): string {
  if (isEmptyValue(v)) return '—';
  if (Array.isArray(v)) return v.map((x) => fmtText(x)).filter((s) => s !== '—').join(', ') || '—';
  return String(v).trim();
}

/** Datas vêm ora em ISO ("1998-07-25T03:00:00.000Z"), ora já em BR ("16/03/1973") — formatDate cobre os dois. */
export function fmtDate(v: unknown): string {
  if (isEmptyValue(v) || typeof v !== 'string') return '—';
  return formatDate(v);
}

/** Moeda: número → R$; string já formatada ("R$ 7.184,00") passa direto. */
export function fmtMoney(v: unknown): string {
  if (typeof v === 'number') return formatCurrency(v);
  if (typeof v === 'string' && v.trim() && !isEmptyValue(v)) return v.trim();
  return '—';
}

export function fmtSexo(v: unknown): string {
  const s = String(v ?? '').trim().toUpperCase();
  if (s === 'M') return 'Masculino';
  if (s === 'F') return 'Feminino';
  if (s === 'I') return 'Não informado';
  return isEmptyValue(v) ? '—' : s;
}

export function fmtIdade(v: unknown): string {
  if (v == null || v === '') return '—';
  return `${v} anos`;
}

export function fmtSimNao(v: unknown): string {
  return v ? 'Sim' : 'Não';
}

/** Flags "consta/nada consta" (ex.: indicativo criminal). */
export function fmtNadaConsta(v: unknown): string {
  return v ? 'Consta' : 'Nada consta';
}

/** Flag de óbito da RFB. */
export function fmtObito(v: unknown): string {
  return v ? 'Consta falecimento' : 'Não consta falecimento';
}

/** RG vem como objeto { numero, orgao, uf } — junta num rótulo só. */
export function fmtRg(v: unknown): string {
  if (v == null || typeof v !== 'object') return fmtText(v);
  const rg = v as { numero?: unknown; orgao?: unknown; uf?: unknown };
  if (isEmptyValue(rg.numero)) return '—';
  const orgao = [rg.orgao, rg.uf].map((x) => (isEmptyValue(x) ? '' : String(x))).filter(Boolean).join('/');
  return orgao ? `${rg.numero} — ${orgao}` : String(rg.numero);
}

/** CTPS vem como objeto { serie, numero }. */
export function fmtCtps(v: unknown): string {
  if (v == null || typeof v !== 'object') return fmtText(v);
  const c = v as { serie?: unknown; numero?: unknown };
  if (isEmptyValue(c.serie) && isEmptyValue(c.numero)) return '—';
  const parts: string[] = [];
  if (!isEmptyValue(c.serie)) parts.push(`Série ${c.serie}`);
  if (!isEmptyValue(c.numero)) parts.push(`Nº ${c.numero}`);
  return parts.join(' · ');
}

/** Localidade "Cidade / UF" a partir de campos separados. */
export function fmtLocalidade(cidade: unknown, uf: unknown): string {
  const parts = [cidade, uf].map((x) => (isEmptyValue(x) ? '' : String(x).trim())).filter(Boolean);
  return parts.join(' / ') || '—';
}

/** Endereço completo a partir do objeto de endereço da APIFull. */
export function fmtEndereco(v: unknown): string {
  if (v == null || typeof v !== 'object') return fmtText(v);
  const e = v as Record<string, unknown>;
  const rua = e.endereco ?? e.logradouro;
  const partes = [
    [rua, e.numero].filter((x) => !isEmptyValue(x)).join(', '),
    e.complemento,
    e.bairro,
    fmtLocalidade(e.cidade, e.uf),
    e.cep,
  ]
    .map((x) => (isEmptyValue(x) ? '' : String(x).trim()))
    .filter(Boolean);
  return partes.join(' · ') || '—';
}
