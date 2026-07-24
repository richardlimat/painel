import { getSupabaseClient } from './supabase';
import { hashToken, readSessionCookie } from './session';

export type AuthResult = { ok: true; userId: string } | { ok: false; response: Response };

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
}

function unauthorizedResponse(): Response {
  return jsonResponse({ code: 'unauthorized', message: 'Sessão ausente, expirada ou inválida.' }, 401);
}

/**
 * Valida a sessão do cookie contra `sessions`/`users`. Usado por toda rota
 * protegida: `/api/consulta-empresa`, `/api/consulta-pessoa`, `/api/saved-queries/*`.
 */
export async function requireSession(req: Request): Promise<AuthResult> {
  const token = readSessionCookie(req);
  if (!token) return { ok: false, response: unauthorizedResponse() };

  const tokenHash = await hashToken(token);
  const supabase = getSupabaseClient();

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('user_id, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (sessionError || !session) return { ok: false, response: unauthorizedResponse() };
  if (session.revoked_at) return { ok: false, response: unauthorizedResponse() };
  if (new Date(session.expires_at as string).getTime() <= Date.now()) {
    return { ok: false, response: unauthorizedResponse() };
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('ativo')
    .eq('id', session.user_id as string)
    .maybeSingle();
  if (userError || !user || !user.ativo) return { ok: false, response: unauthorizedResponse() };

  return { ok: true, userId: session.user_id as string };
}

/**
 * CSRF/defesa em profundidade: rotas mutáveis (POST/DELETE) de auth e de
 * consultas salvas exigem `Origin` presente e igual ao host da própria
 * requisição (via header `Host`, que a Vercel preenche corretamente).
 */
export function validateOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function forbiddenOriginResponse(): Response {
  return jsonResponse({ code: 'invalid_origin', message: 'Origem da requisição não permitida.' }, 403);
}
