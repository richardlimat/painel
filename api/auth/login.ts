import { getSupabaseClient } from '../_lib/supabase';
import { verifyPassword } from '../_lib/password';
import { buildSetCookie, createSessionToken, hashToken, SESSION_TTL_MS } from '../_lib/session';
import { forbiddenOriginResponse, validateOrigin } from '../_lib/auth';

export const config = { runtime: 'edge' };

const MAX_BODY_BYTES = 1024;

function jsonResponse(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store', ...extraHeaders },
  });
}

const GENERIC_INVALID_CREDENTIALS = { code: 'invalid_credentials', message: 'E-mail ou senha inválidos.' };

/** Testável isoladamente (ver login.test.ts). Nunca lança. */
export function parseLoginBody(rawBody: string): { ok: true; email: string; password: string } | { ok: false } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false };
  const { email, password } = parsed as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) return { ok: false };
  return { ok: true, email: email.trim().toLowerCase(), password };
}

/**
 * Login por e-mail/senha contra tabelas próprias (`users`/`sessions`) — sem
 * Supabase Auth. Nunca revela se o e-mail existe (mensagem sempre genérica).
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ code: 'method_not_allowed', message: 'Use POST.' }, 405);
  }
  if (!validateOrigin(req)) return forbiddenOriginResponse();

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ code: 'payload_too_large', message: 'Corpo da requisição excede o tamanho permitido.' }, 413);
  }
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return jsonResponse({ code: 'payload_too_large', message: 'Corpo da requisição excede o tamanho permitido.' }, 413);
  }

  const parsed = parseLoginBody(rawBody);
  if (!parsed.ok) {
    return jsonResponse({ code: 'invalid_body', message: 'Informe e-mail e senha.' }, 400);
  }

  const supabase = getSupabaseClient();
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, nome, email, password_hash, ativo')
    .eq('email', parsed.email)
    .maybeSingle();

  if (userError || !user || !user.ativo) {
    return jsonResponse(GENERIC_INVALID_CREDENTIALS, 401);
  }

  const validPassword = await verifyPassword(parsed.password, user.password_hash as string);
  if (!validPassword) {
    return jsonResponse(GENERIC_INVALID_CREDENTIALS, 401);
  }

  const token = createSessionToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const { error: insertError } = await supabase
    .from('sessions')
    .insert({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt });
  if (insertError) {
    return jsonResponse({ code: 'session_creation_failed', message: 'Não foi possível iniciar a sessão.' }, 500);
  }

  return jsonResponse(
    { user: { id: user.id, nome: user.nome, email: user.email } },
    200,
    { 'set-cookie': buildSetCookie(token, Math.floor(SESSION_TTL_MS / 1000)) },
  );
}
