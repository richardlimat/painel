import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAME, hashToken } from './session';

const { getSupabaseClientMock } = vi.hoisted(() => ({ getSupabaseClientMock: vi.fn() }));
vi.mock('./supabase', () => ({ getSupabaseClient: getSupabaseClientMock }));

import { forbiddenOriginResponse, requireSession, validateOrigin } from './auth';

/** Monta um client Supabase falso: cada chamada a `.from(table)` consome a próxima resposta da fila daquela tabela. */
function makeSupabaseMock(responses: Record<string, Array<{ data: unknown; error: unknown }>>) {
  const queues = new Map(Object.entries(responses).map(([k, v]) => [k, [...v]]));
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            const queue = queues.get(table);
            const next = queue?.shift();
            return next ?? { data: null, error: null };
          },
        }),
      }),
    }),
  };
}

function requestWithCookie(token: string | null, extraHeaders: Record<string, string> = {}): Request {
  const headers: Record<string, string> = { ...extraHeaders };
  if (token !== null) headers.cookie = `${SESSION_COOKIE_NAME}=${token}`;
  return new Request('https://painel.example.com/api/x', { headers });
}

describe('requireSession', () => {
  beforeEach(() => {
    getSupabaseClientMock.mockReset();
  });

  it('1. sem cookie retorna 401 sem consultar o banco', async () => {
    const req = requestWithCookie(null);
    const result = await requireSession(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(getSupabaseClientMock).not.toHaveBeenCalled();
  });

  it('2. sessão válida + usuário ativo retorna ok com userId', async () => {
    const token = 'token-valido';
    const tokenHash = await hashToken(token);
    getSupabaseClientMock.mockReturnValue(
      makeSupabaseMock({
        sessions: [
          {
            data: { user_id: 'user-1', expires_at: new Date(Date.now() + 3600_000).toISOString(), revoked_at: null },
            error: null,
          },
        ],
        users: [{ data: { ativo: true }, error: null }],
      }),
    );
    const result = await requireSession(requestWithCookie(token));
    expect(result).toEqual({ ok: true, userId: 'user-1' });
  });

  it('3. sessão expirada retorna 401', async () => {
    const token = 'token-expirado';
    getSupabaseClientMock.mockReturnValue(
      makeSupabaseMock({
        sessions: [
          { data: { user_id: 'user-1', expires_at: new Date(Date.now() - 1000).toISOString(), revoked_at: null }, error: null },
        ],
      }),
    );
    const result = await requireSession(requestWithCookie(token));
    expect(result.ok).toBe(false);
  });

  it('4. sessão revogada retorna 401', async () => {
    const token = 'token-revogado';
    getSupabaseClientMock.mockReturnValue(
      makeSupabaseMock({
        sessions: [
          {
            data: { user_id: 'user-1', expires_at: new Date(Date.now() + 3600_000).toISOString(), revoked_at: new Date().toISOString() },
            error: null,
          },
        ],
      }),
    );
    const result = await requireSession(requestWithCookie(token));
    expect(result.ok).toBe(false);
  });

  it('5. usuário inativo retorna 401 mesmo com sessão válida', async () => {
    const token = 'token-usuario-inativo';
    getSupabaseClientMock.mockReturnValue(
      makeSupabaseMock({
        sessions: [
          { data: { user_id: 'user-1', expires_at: new Date(Date.now() + 3600_000).toISOString(), revoked_at: null }, error: null },
        ],
        users: [{ data: { ativo: false }, error: null }],
      }),
    );
    const result = await requireSession(requestWithCookie(token));
    expect(result.ok).toBe(false);
  });

  it('6. token não encontrado no banco retorna 401', async () => {
    const token = 'token-desconhecido';
    getSupabaseClientMock.mockReturnValue(makeSupabaseMock({ sessions: [{ data: null, error: null }] }));
    const result = await requireSession(requestWithCookie(token));
    expect(result.ok).toBe(false);
  });
});

describe('validateOrigin — defesa contra CSRF em rotas mutáveis', () => {
  it('7. Origin igual ao Host é aceito', () => {
    const req = requestWithCookie(null, { origin: 'https://painel.example.com', host: 'painel.example.com' });
    expect(validateOrigin(req)).toBe(true);
  });

  it('8. Origin de outro domínio é rejeitado', () => {
    const req = requestWithCookie(null, { origin: 'https://evil.example.com', host: 'painel.example.com' });
    expect(validateOrigin(req)).toBe(false);
  });

  it('9. Origin ausente é rejeitado', () => {
    const req = requestWithCookie(null, { host: 'painel.example.com' });
    expect(validateOrigin(req)).toBe(false);
  });

  it('10. forbiddenOriginResponse retorna 403', () => {
    expect(forbiddenOriginResponse().status).toBe(403);
  });
});
