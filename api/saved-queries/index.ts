import { requireSession, validateOrigin, forbiddenOriginResponse } from '../_lib/auth';
import { getSupabaseClient } from '../_lib/supabase';
import {
  ALLOWED_MIME,
  MAX_IMAGE_BYTES,
  decodeBase64,
  fetchExternalImage,
  sha256Hex,
  sniffMimeType,
  uploadImageToBucket,
} from '../_lib/uploads';
import { stripHardFields } from '../../src/lib/mask';

export const config = { runtime: 'edge' };

const MAX_BODY_BYTES = 5 * 1024 * 1024; // snapshot + perfis sanitizados podem ser grandes, mas com teto
const MAX_IMAGES_PER_QUERY = 80;
const MAX_TITULO_LENGTH = 200;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
}

interface ImageInput {
  personId?: unknown;
  sourceUrl?: unknown;
  base64?: unknown;
}

/** Baixa/decodifica, valida MIME por magic bytes, deduplica por hash e faz upload. Nunca lança. */
async function processImage(
  supabase: ReturnType<typeof getSupabaseClient>,
  savedQueryId: string,
  raw: ImageInput,
): Promise<{ ok: true } | { ok: false }> {
  if (typeof raw.personId !== 'string' || !raw.personId) return { ok: false };

  let bytes: Uint8Array;
  if (typeof raw.sourceUrl === 'string') {
    const result = await fetchExternalImage(raw.sourceUrl, { maxBytes: MAX_IMAGE_BYTES });
    if (!result.ok) return { ok: false };
    bytes = result.bytes;
  } else if (typeof raw.base64 === 'string') {
    try {
      bytes = decodeBase64(raw.base64);
    } catch {
      return { ok: false };
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false };
  } else {
    return { ok: false };
  }

  const mimeType = sniffMimeType(bytes);
  if (!ALLOWED_MIME.has(mimeType)) return { ok: false };

  const hash = await sha256Hex(bytes);
  const path = `${savedQueryId}/${hash}`;

  const uploadResult = await uploadImageToBucket(path, bytes, mimeType);
  if (!uploadResult.ok) return { ok: false };

  const { error: insertError } = await supabase.from('saved_query_images').insert({
    saved_query_id: savedQueryId,
    person_id: raw.personId,
    storage_path: path,
    mime_type: mimeType,
    file_hash: hash,
  });
  // Conflito de dedupe (mesmo hash já registrado para esta consulta) não é falha.
  if (insertError && !/duplicate|unique/i.test(insertError.message)) return { ok: false };

  return { ok: true };
}

async function handleList(req: Request): Promise<Response> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('saved_queries')
    .select('id, titulo, cnpj_raiz, created_at, updated_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false });

  if (error) return jsonResponse({ code: 'list_failed', message: 'Não foi possível listar as consultas salvas.' }, 500);
  return jsonResponse({ items: data ?? [] }, 200);
}

async function handleCreate(req: Request): Promise<Response> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  if (!validateOrigin(req)) return forbiddenOriginResponse();

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ code: 'payload_too_large', message: 'Corpo da requisição excede o tamanho permitido.' }, 413);
  }
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return jsonResponse({ code: 'payload_too_large', message: 'Corpo da requisição excede o tamanho permitido.' }, 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ code: 'invalid_body', message: 'Corpo da requisição deve ser JSON válido.' }, 400);
  }

  const body = parsed as { titulo?: unknown; cnpjRaiz?: unknown; snapshot?: unknown; images?: unknown };
  if (typeof body.cnpjRaiz !== 'string' || !body.cnpjRaiz) {
    return jsonResponse({ code: 'invalid_body', message: 'Campo "cnpjRaiz" é obrigatório.' }, 400);
  }
  if (typeof body.snapshot !== 'object' || body.snapshot === null) {
    return jsonResponse({ code: 'invalid_body', message: 'Campo "snapshot" é obrigatório.' }, 400);
  }

  const titulo =
    typeof body.titulo === 'string' && body.titulo.trim() ? body.titulo.trim().slice(0, MAX_TITULO_LENGTH) : null;
  // Defesa em profundidade: mesmo que o client já sanitize, o servidor nunca confia
  // no payload — nenhum campo "hard" (senha/hash/token/chave/sessão) chega ao banco.
  const sanitizedSnapshot = stripHardFields(body.snapshot);

  const supabase = getSupabaseClient();
  const { data: inserted, error: insertError } = await supabase
    .from('saved_queries')
    .insert({ user_id: auth.userId, titulo, cnpj_raiz: body.cnpjRaiz, snapshot: sanitizedSnapshot })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return jsonResponse({ code: 'create_failed', message: 'Não foi possível salvar a consulta.' }, 500);
  }

  const savedQueryId = inserted.id as string;
  const images = Array.isArray(body.images) ? (body.images as ImageInput[]).slice(0, MAX_IMAGES_PER_QUERY) : [];

  let imagesFailed = 0;
  // Sequencial: cada imagem tem seu próprio download/upload; uma falha nunca aborta a consulta já salva.
  for (const raw of images) {
    // eslint-disable-next-line no-await-in-loop -- upload sequencial, sem concorrência descontrolada de rede
    const result = await processImage(supabase, savedQueryId, raw);
    if (!result.ok) imagesFailed += 1;
  }

  return jsonResponse({ id: savedQueryId, imagesFailed }, 201);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') return handleList(req);
  if (req.method === 'POST') return handleCreate(req);
  return jsonResponse({ code: 'method_not_allowed', message: 'Use GET ou POST.' }, 405);
}
