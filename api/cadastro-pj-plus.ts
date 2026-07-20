import { requireSession } from './_lib/auth';

export const config = { runtime: 'edge' };

/** Testável isoladamente (ver api/cadastro-pj-plus.test.ts) */
export function buildFonteDataUrl(cnpj: string): URL {
  const url = new URL('https://app.fontedata.com/api/v1/consulta/cadastro-pj-plus');
  url.searchParams.set('cnpj', cnpj); // case-sensitive na FonteData — minúsculo, confirmado na doc deles
  return url;
}

/**
 * Proxy same-origin para a FonteData (cadastro-pj-plus), protegido por
 * sessão (ver api/_lib/auth.ts): evita CORS ao chamar a API a partir do
 * navegador e mantém a chave fora do bundle client-side. Repassa status e
 * corpo do upstream sem reinterpretar — o mapeamento de erros vive em
 * src/services/fontedata.ts.
 */
export default async function handler(req: Request): Promise<Response> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const cnpj = new URL(req.url).searchParams.get('CNPJ');
  if (!cnpj || !/^\d{14}$/.test(cnpj)) {
    return new Response(
      JSON.stringify({ code: 'invalid_cnpj', message: 'Parâmetro CNPJ deve ter exatamente 14 dígitos.' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const apiKey = process.env.FONTEDATA_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ code: 'missing_api_key', message: 'Credenciais de consulta não configuradas no servidor.' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  const url = buildFonteDataUrl(cnpj);
  const startedAt = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    });
  } catch {
    // Log de diagnóstico — nunca CNPJ, nunca corpo da resposta, nunca a chave.
    console.log('[fontedata-proxy]', { method: 'GET', status: 'unreachable', durationMs: Date.now() - startedAt });
    return new Response(
      JSON.stringify({ code: 'upstream_unreachable', message: 'Não foi possível conectar ao serviço de consulta.' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }
  const body = await upstream.text();

  // Log de diagnóstico (Vercel → Deployments → Functions → Logs) — nunca CNPJ, corpo ou chave.
  console.log('[fontedata-proxy]', {
    method: 'GET',
    status: upstream.status,
    durationMs: Date.now() - startedAt,
    requestId: upstream.headers.get('x-request-id') ?? undefined,
  });

  return new Response(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
