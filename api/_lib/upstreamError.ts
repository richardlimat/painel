/**
 * Normalizador central de erros de upstream (fornecedores externos de dados).
 * Server-only — nunca importado por `src/`.
 *
 * Regra: nenhum corpo, texto ou detalhe cru de uma resposta de erro do
 * upstream chega ao navegador. O detalhe (status + request-id do upstream,
 * NUNCA o corpo — pode conter CPF/CNPJ/dado da pessoa consultada) fica só no
 * log do servidor, correlacionável por um identificador de diagnóstico curto
 * devolvido ao cliente. O cliente recebe sempre o mesmo formato neutro:
 * `{ code, message, id }`, preservando o status HTTP original (a semântica
 * do status não revela o fornecedor).
 */

export interface NeutralErrorEnvelope {
  code: string;
  message: string;
  id: string;
}

/** 4 bytes aleatórios em hex — suficiente para correlacionar com o log do servidor, sem expor nada. */
export function diagnosticId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function neutralEnvelopeFor(status: number): { code: string; message: string } {
  switch (status) {
    case 400:
      return { code: 'invalid_request', message: 'Parâmetro de consulta inválido.' };
    case 401:
    case 403:
      return { code: 'service_unavailable', message: 'Serviço temporariamente indisponível.' };
    case 402:
      return { code: 'service_unavailable', message: 'Não foi possível processar a solicitação neste momento.' };
    case 404:
      return { code: 'not_found', message: 'Nenhum resultado encontrado.' };
    case 413:
      return { code: 'payload_too_large', message: 'Requisição excede o tamanho permitido.' };
    case 429:
      return { code: 'rate_limited', message: 'Limite de requisições atingido. Tente novamente em instantes.' };
    default:
      if (status >= 500) return { code: 'service_unavailable', message: 'Serviço temporariamente indisponível.' };
      return { code: 'processing_failed', message: 'Não foi possível concluir a operação.' };
  }
}

function jsonResponse(envelope: NeutralErrorEnvelope, status: number): Response {
  return new Response(JSON.stringify(envelope), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
}

/**
 * Resposta neutra para uma falha HTTP do upstream (status != 2xx). Loga
 * status + duração + request-id do upstream + id de diagnóstico (nunca o
 * corpo) e devolve `{ code, message, id }` ao cliente, com o MESMO status
 * HTTP do upstream (a Vercel loga por status; o cliente já trata 404
 * especialmente para "não encontrado").
 */
export function normalizeUpstreamError(logTag: string, upstream: Response, startedAt: number): Response {
  const id = diagnosticId();
  console.log(`[${logTag}]`, {
    id,
    status: upstream.status,
    durationMs: Date.now() - startedAt,
    requestId: upstream.headers.get('x-request-id') ?? undefined,
  });
  const { code, message } = neutralEnvelopeFor(upstream.status);
  return jsonResponse({ code, message, id }, upstream.status);
}

/** Resposta neutra quando o upstream não pôde nem ser alcançado (rede/timeout) — sem Response para inspecionar. */
export function normalizeUnreachableError(
  logTag: string,
  startedAt: number,
  kind: 'unreachable' | 'timeout',
): Response {
  const id = diagnosticId();
  console.log(`[${logTag}]`, { id, status: kind, durationMs: Date.now() - startedAt });
  const envelope: NeutralErrorEnvelope =
    kind === 'timeout'
      ? { code: 'timeout', message: 'A operação demorou mais que o esperado.', id }
      : { code: 'service_unavailable', message: 'Serviço temporariamente indisponível.', id };
  return jsonResponse(envelope, kind === 'timeout' ? 504 : 502);
}
