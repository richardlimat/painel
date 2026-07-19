import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../_lib/password';

const { getSupabaseClientMock } = vi.hoisted(() => ({ getSupabaseClientMock: vi.fn() }));
vi.mock('../_lib/supabase', () => ({ getSupabaseClient: getSupabaseClientMock }));

import handler, { parseLoginBody } from './login';

function makeSupabaseMock(opts: { user: unknown; insertError?: unknown }) {
  return {
    from: (table: string) => {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.user, error: null }) }) }) };
      }
      if (table === 'sessions') {
        return { insert: async () => ({ error: opts.insertError ?? null }) };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://painel.example.com/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://painel.example.com', host: 'painel.example.com', ...headers },
    body: JSON.stringify(body),
  });
}

describe('parseLoginBody', () => {
  it('1. corpo válido normaliza e-mail para minúsculo/trim', () => {
    const result = parseLoginBody(JSON.stringify({ email: '  Foo@Bar.com ', password: 'x' }));
    expect(result).toEqual({ ok: true, email: 'foo@bar.com', password: 'x' });
  });

  it('2. corpo inválido (json quebrado, campos ausentes/vazios) retorna ok:false', () => {
    expect(parseLoginBody('{not json')).toEqual({ ok: false });
    expect(parseLoginBody(JSON.stringify({ email: 'a@b.com' }))).toEqual({ ok: false });
    expect(parseLoginBody(JSON.stringify({ email: '', password: 'x' }))).toEqual({ ok: false });
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    getSupabaseClientMock.mockReset();
  });

  it('3. rejeita método diferente de POST', async () => {
    const res = await handler(new Request('https://painel.example.com/api/auth/login', { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('4. rejeita Origin divergente do Host', async () => {
    const res = await handler(req({ email: 'a@b.com', password: 'x' }, { origin: 'https://evil.com' }));
    expect(res.status).toBe(403);
  });

  it('5. e-mail inexistente retorna 401 com mensagem genérica (não revela se existe)', async () => {
    getSupabaseClientMock.mockReturnValue(makeSupabaseMock({ user: null }));
    const res = await handler(req({ email: 'ninguem@example.com', password: 'x' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('invalid_credentials');
  });

  it('6. senha errada retorna 401 com a MESMA mensagem genérica', async () => {
    const hash = await hashPassword('senhaCorreta');
    getSupabaseClientMock.mockReturnValue(
      makeSupabaseMock({ user: { id: 'u1', nome: 'Fulano', email: 'a@b.com', password_hash: hash, ativo: true } }),
    );
    const res = await handler(req({ email: 'a@b.com', password: 'senhaErrada' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('invalid_credentials');
  });

  it('7. usuário inativo retorna 401 mesmo com senha certa', async () => {
    const hash = await hashPassword('senhaCorreta');
    getSupabaseClientMock.mockReturnValue(
      makeSupabaseMock({ user: { id: 'u1', nome: 'Fulano', email: 'a@b.com', password_hash: hash, ativo: false } }),
    );
    const res = await handler(req({ email: 'a@b.com', password: 'senhaCorreta' }));
    expect(res.status).toBe(401);
  });

  it('8. login correto define cookie HttpOnly/SameSite=Lax e retorna dados do usuário (sem hash)', async () => {
    const hash = await hashPassword('senhaCorreta');
    getSupabaseClientMock.mockReturnValue(
      makeSupabaseMock({ user: { id: 'u1', nome: 'Fulano', email: 'a@b.com', password_hash: hash, ativo: true } }),
    );
    const res = await handler(req({ email: 'a@b.com', password: 'senhaCorreta' }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const body = await res.json();
    expect(body.user).toEqual({ id: 'u1', nome: 'Fulano', email: 'a@b.com' });
    expect(JSON.stringify(body)).not.toContain(hash);
  });

  it('9. falha ao criar sessão retorna 500', async () => {
    const hash = await hashPassword('senhaCorreta');
    getSupabaseClientMock.mockReturnValue(
      makeSupabaseMock({
        user: { id: 'u1', nome: 'Fulano', email: 'a@b.com', password_hash: hash, ativo: true },
        insertError: { message: 'boom' },
      }),
    );
    const res = await handler(req({ email: 'a@b.com', password: 'senhaCorreta' }));
    expect(res.status).toBe(500);
  });
});
