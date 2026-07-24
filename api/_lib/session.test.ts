import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE_NAME,
  buildExpiredCookie,
  buildSetCookie,
  createSessionToken,
  hashToken,
  readSessionCookie,
} from './session';

describe('session — token opaco, hash e cookie', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.VERCEL_ENV = undefined;
    process.env.NODE_ENV = 'test';
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('1. createSessionToken gera valores diferentes e sem caracteres de base64 padrão (base64url)', () => {
    const a = createSessionToken();
    const b = createSessionToken();
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/[+/=]/);
  });

  it('2. hashToken é determinístico e nunca igual ao token original', async () => {
    const token = createSessionToken();
    const h1 = await hashToken(token);
    const h2 = await hashToken(token);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(token);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('3. buildSetCookie inclui HttpOnly e SameSite=Lax sempre, e Secure só em produção', () => {
    const cookieDev = buildSetCookie('tok', 3600);
    expect(cookieDev).toContain('HttpOnly');
    expect(cookieDev).toContain('SameSite=Lax');
    expect(cookieDev).not.toContain('Secure');

    process.env.VERCEL_ENV = 'production';
    const cookieProd = buildSetCookie('tok', 3600);
    expect(cookieProd).toContain('Secure');
  });

  it('4. buildExpiredCookie expira imediatamente (Max-Age=0)', () => {
    expect(buildExpiredCookie()).toContain('Max-Age=0');
  });

  it('5. readSessionCookie extrai o valor certo entre vários cookies', () => {
    const req = new Request('https://example.com', {
      headers: { cookie: `other=1; ${SESSION_COOKIE_NAME}=abc123; another=2` },
    });
    expect(readSessionCookie(req)).toBe('abc123');
  });

  it('6. readSessionCookie retorna null sem cookie de sessão', () => {
    const req = new Request('https://example.com', { headers: { cookie: 'other=1' } });
    expect(readSessionCookie(req)).toBeNull();
    const reqNoCookie = new Request('https://example.com');
    expect(readSessionCookie(reqNoCookie)).toBeNull();
  });
});
