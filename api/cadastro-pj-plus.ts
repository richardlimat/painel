export const config = { runtime: 'edge' };

/**
 * Proxy same-origin para a FonteData (cadastro-pj-plus): evita CORS ao
 * chamar a API a partir do navegador e mantém a chave fora do bundle
 * client-side. Repassa status e corpo do upstream sem reinterpretar —
 * o mapeamento de erros vive em src/services/fontedata.ts.
 */
export default async function handler(req: Request): Promise<Response> {
  const cnpj = new URL(req.url).searchParams.get('CNPJ');
  if (!cnpj) {
    return new Response(JSON.stringify({ message: 'Parâmetro CNPJ é obrigatório.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const apiKey = process.env.VITE_FONTEDATA_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ message: 'VITE_FONTEDATA_API_KEY não configurada no servidor.' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const upstream = await fetch(
    `https://app.fontedata.com/api/v1/consulta/cadastro-pj-plus?CNPJ=${encodeURIComponent(cnpj)}`,
    { headers: { 'X-API-Key': apiKey } },
  );
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
