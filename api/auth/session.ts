import { getSupabaseClient } from '../_lib/supabase';
import { requireSession } from '../_lib/auth';

export const config = { runtime: 'edge' };

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
}

/** Verificação da sessão atual — usada pelo client para saber se deve mostrar o Login ou o painel. */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return jsonResponse({ code: 'method_not_allowed', message: 'Use GET.' }, 405);
  }

  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseClient();
  const { data: user, error } = await supabase
    .from('users')
    .select('id, nome, email')
    .eq('id', auth.userId)
    .maybeSingle();
  if (error || !user) {
    return jsonResponse({ code: 'unauthorized', message: 'Sessão inválida.' }, 401);
  }

  return jsonResponse({ user }, 200);
}
