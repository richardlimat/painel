import { isValidCNPJ, isValidCPF, onlyDigits } from '../lib/format';
import { extractErrorDetail } from './fontedata';

/**
 * Perfil completo devolvido pela APIFull (cpf-ultra). `SERVICE_RESPONSE` é
 * preservado integralmente — a API pode adicionar novas seções no futuro e
 * nenhuma chave é descartada aqui.
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

function messageForStatus(status: number, detail: string | undefined): string {
  const suffix = detail ? ` Detalhe: ${detail}` : '';
  switch (status) {
    case 400:
      return `CPF ou parâmetro inválido.${suffix}`;
    case 401:
    case 403:
      return `Chave de API ausente ou inválida (configuração do servidor).${suffix}`;
    case 402:
      return `Saldo insuficiente para consulta.${suffix}`;
    case 413:
      return `Requisição rejeitada pelo servidor (corpo excede o tamanho permitido).${suffix}`;
    case 429:
      return `Limite de requisições excedido. Tente novamente em instantes.${suffix}`;
    case 502:
      return `Não foi possível conectar ao serviço de consulta.${suffix}`;
    case 504:
      return `A consulta excedeu o tempo limite.${suffix}`;
    default:
      if (status >= 500 && status <= 503) return `Serviço de consulta indisponível no momento.${suffix}`;
      return `Falha na consulta (HTTP ${status})${suffix}`;
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
 * Consulta o perfil completo de uma pessoa via APIFull (cpf-ultra), através
 * do proxy same-origin `/api/cpf-ultra` — a chave nunca chega ao cliente.
 * Sem cache aqui: o cache/dedup mora em `personProfileStore`, compartilhado
 * entre o clique no painel e a expansão de camada.
 */
export async function getApiFullProfile(cpf: string): Promise<ApiFullProfile> {
  const digits = onlyDigits(cpf);
  if (!isValidCPF(digits)) {
    throw new Error('CPF inválido: informe um CPF com 11 dígitos e dígitos verificadores válidos.');
  }

  const res = await fetch('/api/cpf-ultra', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cpf: digits }),
  });

  if (res.status === 404) throw new PersonNotFoundError(digits);
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new Error(messageForStatus(res.status, detail));
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('Resposta inesperada da consulta (endpoint indisponível).');
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
