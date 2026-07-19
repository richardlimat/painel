import { getSupabaseClient } from '../_lib/supabase';
import { buildExpiredCookie, hashToken, readSessionCookie } from '../_lib/session';
import { forbiddenOriginResponse, validateOrigin } from '../_lib/auth';

export const config = { runtime: 'edge' };

function jsonResponse(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store', ...extraHeaders },
  });
}

/** Revoga a sessão atual (se houver) e expira o cookie. Sempre responde 200 — logout é idempotente. */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ code: 'method_not_allowed', message: 'Use POST.' }, 405);
  }
  if (!validateOrigin(req)) return forbiddenOriginResponse();

  const token = readSessionCookie(req);
  if (token) {
    const tokenHash = await hashToken(token);
    const supabase = getSupabaseClient();
    await supabase.from('sessions').update({ revoked_at: new Date().toISOString() }).eq('token_hash', tokenHash);
  }

  return jsonResponse({ ok: true }, 200, { 'set-cookie': buildExpiredCookie() });
}
