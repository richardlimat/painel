import { isValidCPF, onlyDigits } from '../src/lib/format';

export const config = { runtime: 'edge' };

/**
 * ⚠️ SEGURANÇA: esta rota é pública. O projeto não tem autenticação (sem
 * login/sessão/middleware em lugar nenhum do repositório). Qualquer pessoa
 * que descubra a URL do deployment pode chamar este endpoint e consumir
 * créditos pagos da APIFull. Isso é uma decisão consciente da primeira
 * versão, não uma configuração pendente — ver README para o aviso completo
 * e a recomendação de ativar Vercel Deployment Protection antes de uso real.
 *
 * Também não há rate-limit nem controle de concorrência no servidor (exige
 * KV/Redis, que este projeto não tem) — a única mitigação hoje é client-side
 * (cache por CPF, lotes com concorrência limitada, confirmação antes de
 * cascatas grandes). Ver plano/README.
 */

const MAX_BODY_BYTES = 2048; // {"cpf":"...","link":"cpf-ultra"} nunca chega perto disso
const UPSTREAM_TIMEOUT_MS = 15000;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
}

/** Testável isoladamente (ver api/cpf-ultra.test.ts). Nunca lança — sempre retorna um resultado. */
export function normalizeAndValidateCpf(rawBody: string): { ok: true; cpf: string } | { ok: false; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, message: 'Corpo da requisição deve ser JSON válido.' };
  }
  if (typeof parsed !== 'object' || parsed === null || !('cpf' in parsed)) {
    return { ok: false, message: 'Campo "cpf" é obrigatório.' };
  }
  const rawCpf = (parsed as { cpf: unknown }).cpf;
  if (typeof rawCpf !== 'string') {
    return { ok: false, message: 'Campo "cpf" deve ser uma string.' };
  }
  const cpf = onlyDigits(rawCpf);
  if (!isValidCPF(cpf)) {
    return { ok: false, message: 'CPF inválido: informe um CPF com 11 dígitos e dígitos verificadores válidos.' };
  }
  return { ok: true, cpf };
}

/**
 * Proxy same-origin para a APIFull (cpf-ultra): o frontend nunca chama a
 * APIFull diretamente. `link` é sempre fixado aqui — o cliente não escolhe.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ code: 'method_not_allowed', message: 'Use POST.' }, 405);
  }

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ code: 'payload_too_large', message: 'Corpo da requisição excede o tamanho permitido.' }, 413);
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return jsonResponse({ code: 'payload_too_large', message: 'Corpo da requisição excede o tamanho permitido.' }, 413);
  }

  const validated = normalizeAndValidateCpf(rawBody);
  if (!validated.ok) {
    return jsonResponse({ code: 'invalid_cpf', message: validated.message }, 400);
  }

  const authorization = process.env.APIFULL_AUTHORIZATION;
  if (!authorization) {
    return jsonResponse({ code: 'missing_authorization', message: 'APIFULL_AUTHORIZATION não configurada no servidor.' }, 500);
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch('https://api.apifull.com.br/api/cpf-ultra', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authorization },
      body: JSON.stringify({ cpf: validated.cpf, link: 'cpf-ultra' }),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    // Log de diagnóstico — nunca CPF, nunca Authorization, nunca corpo da resposta.
    console.log('[apifull-proxy]', {
      status: aborted ? 'timeout' : 'unreachable',
      durationMs: Date.now() - startedAt,
    });
    return jsonResponse(
      aborted
        ? { code: 'upstream_timeout', message: 'A consulta à APIFull excedeu o tempo limite.' }
        : { code: 'upstream_unreachable', message: 'Não foi possível conectar à APIFull.' },
      aborted ? 504 : 502,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const body = await upstream.text();

  console.log('[apifull-proxy]', {
    status: upstream.status,
    durationMs: Date.now() - startedAt,
    requestId: upstream.headers.get('x-request-id') ?? undefined,
  });

  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'private, no-store',
    },
  });
}
