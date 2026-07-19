import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSupabaseClientMock } = vi.hoisted(() => ({ getSupabaseClientMock: vi.fn() }));
vi.mock('../_lib/supabase', () => ({ getSupabaseClient: getSupabaseClientMock }));

import handler from './logout';
import { SESSION_COOKIE_NAME } from '../_lib/session';

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://painel.example.com/api/auth/logout', {
    method: 'POST',
    headers: { origin: 'https://painel.example.com', host: 'painel.example.com', ...headers },
  });
}

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    getSupabaseClientMock.mockReset();
  });

  it('1. rejeita método diferente de POST', async () => {
    const res = await handler(new Request('https://painel.example.com/api/auth/logout', { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('2. rejeita Origin divergente', async () => {
    const res = await handler(req({ origin: 'https://evil.com' }));
    expect(res.status).toBe(403);
  });

  it('3. sem cookie ainda responde 200 e expira o cookie (idempotente)', async () => {
    const res = await handler(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(getSupabaseClientMock).not.toHaveBeenCalled();
  });

  it('4. com cookie, revoga a sessão (update de revoked_at) e expira o cookie', async () => {
    const updateSpy = vi.fn().mockReturnValue({ eq: async () => ({ error: null }) });
    getSupabaseClientMock.mockReturnValue({ from: () => ({ update: updateSpy }) });
    const res = await handler(req({ cookie: `${SESSION_COOKIE_NAME}=algum-token` }));
    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ revoked_at: expect.any(String) }));
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
