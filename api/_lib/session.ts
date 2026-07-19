/**
 * Sessão por cookie: o cookie carrega um token opaco aleatório; o banco
 * (`sessions.token_hash`) guarda só o SHA-256 do token, nunca o valor em
 * claro. Token com 256 bits de entropia dispensa PBKDF2 (não é senha de
 * baixa entropia) — SHA-256 simples já é suficiente para essa comparação.
 */

export const SESSION_COOKIE_NAME = 'painel_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Token opaco de 32 bytes (256 bits) — valor do cookie, nunca persistido em claro. */
export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(bytes);
}

/** Hash do token — o único valor gravado em `sessions.token_hash`. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}

function isProduction(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

/** Monta o header `Set-Cookie` da sessão. `maxAgeSeconds` de 0 (ou negativo) expira o cookie imediatamente (logout). */
export function buildSetCookie(token: string, maxAgeSeconds: number): string {
  const parts = [`${SESSION_COOKIE_NAME}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (isProduction()) parts.push('Secure');
  return parts.join('; ');
}

export function buildExpiredCookie(): string {
  return buildSetCookie('', 0);
}

/** Extrai o valor do cookie de sessão de um `Request`, sem depender de libs externas de parsing. */
export function readSessionCookie(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === SESSION_COOKIE_NAME) return rest.join('=');
  }
  return null;
}
