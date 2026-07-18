export const config = { runtime: 'edge' };

/** Testável isoladamente (ver api/cadastro-pj-plus.test.ts) */
export function buildFonteDataUrl(cnpj: string): URL {
  const url = new URL('https://app.fontedata.com/api/v1/consulta/cadastro-pj-plus');
  url.searchParams.set('cnpj', cnpj); // case-sensitive na FonteData — minúsculo, confirmado na doc deles
  return url;
}

/**
 * Proxy same-origin para a FonteData (cadastro-pj-plus): evita CORS ao
 * chamar a API a partir do navegador e mantém a chave fora do bundle
 * client-side. Repassa status e corpo do upstream sem reinterpretar —
 * o mapeamento de erros vive em src/services/fontedata.ts.
 */
export default async function handler(req: Request): Promise<Response> {
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
      JSON.stringify({ code: 'missing_api_key', message: 'FONTEDATA_API_KEY não configurada no servidor.' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  const url = buildFonteDataUrl(cnpj);
  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    });
  } catch {
    console.log('[fontedata-proxy]', { method: 'GET', url: url.toString(), cnpj, status: 'unreachable' });
    return new Response(
      JSON.stringify({ code: 'upstream_unreachable', message: 'Não foi possível conectar à FonteData.' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }
  const body = await upstream.text();

  // Log de diagnóstico (Vercel → Deployments → Functions → Logs) — nunca inclui a chave.
  console.log('[fontedata-proxy]', {
    method: 'GET',
    url: url.toString(),
    cnpj,
    status: upstream.status,
    requestId: upstream.headers.get('x-request-id') ?? undefined,
    body,
  });

  return new Response(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
