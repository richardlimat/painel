import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireSessionMock, getSupabaseClientMock } = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  getSupabaseClientMock: vi.fn(),
}));
vi.mock('../_lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/auth')>();
  return { ...actual, requireSession: requireSessionMock };
});
vi.mock('../_lib/supabase', () => ({ getSupabaseClient: getSupabaseClientMock }));

import handler from './session';

describe('GET /api/auth/session', () => {
  beforeEach(() => {
    requireSessionMock.mockReset();
    getSupabaseClientMock.mockReset();
  });

  it('1. rejeita método diferente de GET', async () => {
    const res = await handler(new Request('https://painel.example.com/api/auth/session', { method: 'POST' }));
    expect(res.status).toBe(405);
  });

  it('2. sem sessão válida repassa a resposta 401 de requireSession', async () => {
    requireSessionMock.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    const res = await handler(new Request('https://painel.example.com/api/auth/session'));
    expect(res.status).toBe(401);
    expect(getSupabaseClientMock).not.toHaveBeenCalled();
  });

  it('3. com sessão válida retorna os dados do usuário (sem password_hash)', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'u1' });
    getSupabaseClientMock.mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'u1', nome: 'Fulano', email: 'a@b.com' }, error: null }) }) }),
      }),
    });
    const res = await handler(new Request('https://painel.example.com/api/auth/session'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toEqual({ id: 'u1', nome: 'Fulano', email: 'a@b.com' });
  });

  it('4. usuário não encontrado (removido após a sessão ser criada) retorna 401', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'u1' });
    getSupabaseClientMock.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    });
    const res = await handler(new Request('https://painel.example.com/api/auth/session'));
    expect(res.status).toBe(401);
  });
});
