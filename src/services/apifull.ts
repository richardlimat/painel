import { isValidCNPJ, isValidCPF, onlyDigits } from '../lib/format';
import { readNeutralErrorMessage } from './proxyError';

/**
 * Perfil completo devolvido pela rota interna de consulta de pessoa.
 * `SERVICE_RESPONSE` é preservado integralmente — a origem pode adicionar
 * novas seções no futuro e nenhuma chave é descartada aqui.
 */
export interface ApiFullProfile {
  SERVICE_RESPONSE: Record<string, unknown>;
}

/** Um item de `SERVICE_RESPONSE.sociedades[]` — única parte da resposta que pode alterar o grafo. */
export interface ApiFullSociedade {
  cnpj: string;
  razaoSocial?: string;
  situacaoCadastral?: string;
  qualificacaoSocioDescricao?: string;
  dtEntrada?: string;
  nomeSocio?: string;
  documentoSocio: string;
}

export class PersonNotFoundError extends Error {
  constructor(cpf: string) {
    super(`CPF ${cpf} não encontrado.`);
    this.name = 'PersonNotFoundError';
  }
}

function isValidApiFullBody(
  data: unknown,
): data is { status: string; dados: { SERVICE_RESPONSE: Record<string, unknown> } } {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (d.status !== 'sucesso') return false;
  if (typeof d.dados !== 'object' || d.dados === null) return false;
  const dados = d.dados as Record<string, unknown>;
  const serviceResponse = dados.SERVICE_RESPONSE;
  return typeof serviceResponse === 'object' && serviceResponse !== null && !Array.isArray(serviceResponse);
}

/**
 * Consulta o perfil completo de uma pessoa através da rota interna
 * `/api/consulta-pessoa` — nenhuma credencial ou detalhe de origem chega ao
 * cliente. Erros do servidor já vêm neutralizados (ver
 * `api/_lib/upstreamError.ts`); `readNeutralErrorMessage` nunca repassa texto
 * cru mesmo que o formato mude inesperadamente. Sem cache aqui: o
 * cache/dedup mora em `personProfileStore`, compartilhado entre o clique no
 * painel e a expansão de camada.
 */
export async function getApiFullProfile(cpf: string): Promise<ApiFullProfile> {
  const digits = onlyDigits(cpf);
  if (!isValidCPF(digits)) {
    throw new Error('CPF inválido: informe um CPF com 11 dígitos e dígitos verificadores válidos.');
  }

  const res = await fetch('/api/consulta-pessoa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cpf: digits }),
  });

  if (res.status === 404) throw new PersonNotFoundError(digits);
  if (!res.ok) {
    throw new Error(await readNeutralErrorMessage(res));
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('Não foi possível processar a resposta da consulta.');
  }

  if (!isValidApiFullBody(data)) {
    throw new Error('Consulta sem sucesso ou em formato inesperado.');
  }

  return { SERVICE_RESPONSE: data.dados.SERVICE_RESPONSE };
}

/**
 * Extrai e valida `SERVICE_RESPONSE.sociedades[]` — só CPF (11 dígitos,
 * checksum válido) e CNPJ (14 dígitos, checksum válido) são aceitos; itens
 * malformados são descartados silenciosamente (dado desconhecido/ruído, não
 * um erro de consulta).
 */
export function extractSociedades(profile: ApiFullProfile): ApiFullSociedade[] {
  const raw = profile.SERVICE_RESPONSE.sociedades;
  if (!Array.isArray(raw)) return [];

  const result: ApiFullSociedade[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const it = item as Record<string, unknown>;
    const cnpj = onlyDigits(String(it.cnpj ?? ''));
    const documentoSocio = onlyDigits(String(it.documento_socio ?? ''));
    if (!isValidCNPJ(cnpj) || !isValidCPF(documentoSocio)) continue;
    result.push({
      cnpj,
      razaoSocial: typeof it.razao_social === 'string' ? it.razao_social : undefined,
      situacaoCadastral: typeof it.situacao_cadastral === 'string' ? it.situacao_cadastral : undefined,
      qualificacaoSocioDescricao:
        typeof it.qualificacao_socio_descricao === 'string' ? it.qualificacao_socio_descricao : undefined,
      dtEntrada: typeof it.dt_entrada === 'string' ? it.dt_entrada : undefined,
      nomeSocio: typeof it.nome_socio === 'string' ? it.nome_socio : undefined,
      documentoSocio,
    });
  }
  return result;
}
