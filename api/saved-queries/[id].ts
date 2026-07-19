import { requireSession, validateOrigin, forbiddenOriginResponse } from '../_lib/auth';
import { getSupabaseClient } from '../_lib/supabase';
import { createSignedImageUrl, removeBucketImages } from '../_lib/uploads';

export const config = { runtime: 'edge' };

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
}

function extractId(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? null;
}

async function handleGet(req: Request, id: string): Promise<Response> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseClient();
  const { data: query, error } = await supabase
    .from('saved_queries')
    .select('id, user_id, titulo, cnpj_raiz, snapshot, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  // Isolamento entre usuários: consulta de outro usuário responde 404 (não 403) — nunca confirma que existe.
  if (error || !query || query.user_id !== auth.userId) {
    return jsonResponse({ code: 'not_found', message: 'Consulta não encontrada.' }, 404);
  }

  const { data: images } = await supabase
    .from('saved_query_images')
    .select('person_id, storage_path')
    .eq('saved_query_id', id);

  const photoUrlsByPersonId: Record<string, string> = {};
  for (const img of images ?? []) {
    // eslint-disable-next-line no-await-in-loop -- poucas imagens por consulta, sem necessidade de paralelismo
    const signedUrl = await createSignedImageUrl(img.storage_path as string);
    if (signedUrl) photoUrlsByPersonId[img.person_id as string] = signedUrl;
  }

  return jsonResponse(
    {
      id: query.id,
      titulo: query.titulo,
      cnpjRaiz: query.cnpj_raiz,
      snapshot: query.snapshot,
      photoUrlsByPersonId,
      createdAt: query.created_at,
      updatedAt: query.updated_at,
    },
    200,
  );
}

async function handleDelete(req: Request, id: string): Promise<Response> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  if (!validateOrigin(req)) return forbiddenOriginResponse();

  const supabase = getSupabaseClient();
  const { data: query, error } = await supabase.from('saved_queries').select('id, user_id').eq('id', id).maybeSingle();
  if (error || !query || query.user_id !== auth.userId) {
    return jsonResponse({ code: 'not_found', message: 'Consulta não encontrada.' }, 404);
  }

  const { data: images } = await supabase.from('saved_query_images').select('storage_path').eq('saved_query_id', id);
  const paths = (images ?? []).map((i) => i.storage_path as string);
  if (paths.length > 0) {
    try {
      await removeBucketImages(paths);
    } catch {
      // Segue com a exclusão do registro mesmo se a limpeza do bucket falhar —
      // não deixamos uma consulta "presa" por causa de um erro no Storage.
    }
  }

  const { error: deleteError } = await supabase.from('saved_queries').delete().eq('id', id);
  if (deleteError) {
    return jsonResponse({ code: 'delete_failed', message: 'Não foi possível excluir a consulta.' }, 500);
  }

  return jsonResponse({ ok: true }, 200);
}

export default async function handler(req: Request): Promise<Response> {
  const id = extractId(req);
  if (!id) return jsonResponse({ code: 'invalid_id', message: 'Identificador inválido.' }, 400);

  if (req.method === 'GET') return handleGet(req, id);
  if (req.method === 'DELETE') return handleDelete(req, id);
  return jsonResponse({ code: 'method_not_allowed', message: 'Use GET ou DELETE.' }, 405);
}
