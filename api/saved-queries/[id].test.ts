import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireSessionMock, getSupabaseClientMock, createSignedImageUrlMock, removeBucketImagesMock } = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  getSupabaseClientMock: vi.fn(),
  createSignedImageUrlMock: vi.fn(),
  removeBucketImagesMock: vi.fn(),
}));

vi.mock('../_lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/auth')>();
  return { ...actual, requireSession: requireSessionMock };
});
vi.mock('../_lib/supabase', () => ({ getSupabaseClient: getSupabaseClientMock }));
vi.mock('../_lib/uploads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/uploads')>();
  return { ...actual, createSignedImageUrl: createSignedImageUrlMock, removeBucketImages: removeBucketImagesMock };
});

import handler from './[id]';

function req(id: string, method: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://painel.example.com/api/saved-queries/${id}`, {
    method,
    headers: { origin: 'https://painel.example.com', host: 'painel.example.com', ...headers },
  });
}

describe('GET /api/saved-queries/:id — abrir', () => {
  beforeEach(() => {
    requireSessionMock.mockReset();
    getSupabaseClientMock.mockReset();
    createSignedImageUrlMock.mockReset();
  });

  it('1. sem sessão retorna a resposta de requireSession', async () => {
    requireSessionMock.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    const res = await handler(req('q1', 'GET'));
    expect(res.status).toBe(401);
  });

  it('2. consulta de outro usuário retorna 404 (isolamento entre usuários)', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-A' });
    const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: { id: 'q1', user_id: 'user-B' }, error: null }) };
    getSupabaseClientMock.mockReturnValue({ from: () => builder });

    const res = await handler(req('q1', 'GET'));
    expect(res.status).toBe(404);
  });

  it('3. consulta inexistente retorna 404', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-A' });
    const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: null, error: null }) };
    getSupabaseClientMock.mockReturnValue({ from: () => builder });
    const res = await handler(req('q404', 'GET'));
    expect(res.status).toBe(404);
  });

  it('4. dono da consulta recebe snapshot + signed URLs das imagens (nunca o storage_path cru)', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-A' });
    createSignedImageUrlMock.mockResolvedValue('https://supabase.example.com/signed/xyz');

    const queryBuilder = {
      select: () => queryBuilder,
      eq: () => queryBuilder,
      maybeSingle: async () => ({
        data: { id: 'q1', user_id: 'user-A', titulo: 'Minha consulta', cnpj_raiz: '123', snapshot: { rootId: 'c:123' } },
        error: null,
      }),
    };
    const imagesBuilder = {
      select: () => imagesBuilder,
      eq: () => Promise.resolve({ data: [{ person_id: 'p:1', storage_path: 'q1/hash1' }], error: null }),
    };
    getSupabaseClientMock.mockReturnValue({
      from: (table: string) => (table === 'saved_queries' ? queryBuilder : imagesBuilder),
    });

    const res = await handler(req('q1', 'GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.snapshot).toEqual({ rootId: 'c:123' });
    expect(body.photoUrlsByPersonId).toEqual({ 'p:1': 'https://supabase.example.com/signed/xyz' });
    expect(JSON.stringify(body)).not.toContain('q1/hash1');
  });
});

describe('DELETE /api/saved-queries/:id — excluir', () => {
  beforeEach(() => {
    requireSessionMock.mockReset();
    getSupabaseClientMock.mockReset();
    removeBucketImagesMock.mockReset();
  });

  it('1. rejeita Origin divergente', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-A' });
    const res = await handler(req('q1', 'DELETE', { origin: 'https://evil.com' }));
    expect(res.status).toBe(403);
  });

  it('2. consulta de outro usuário retorna 404, sem excluir nada', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-A' });
    const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: { id: 'q1', user_id: 'user-B' }, error: null }) };
    getSupabaseClientMock.mockReturnValue({ from: () => builder });
    const res = await handler(req('q1', 'DELETE'));
    expect(res.status).toBe(404);
    expect(removeBucketImagesMock).not.toHaveBeenCalled();
  });

  it('3. exclui a consulta e as imagens do bucket associadas', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-A' });
    const deleteSpy = vi.fn().mockReturnValue({ eq: async () => ({ error: null }) });
    const queryBuilder = { select: () => queryBuilder, eq: () => queryBuilder, maybeSingle: async () => ({ data: { id: 'q1', user_id: 'user-A' }, error: null }), delete: deleteSpy };
    const imagesBuilder = { select: () => imagesBuilder, eq: () => Promise.resolve({ data: [{ storage_path: 'q1/hash1' }, { storage_path: 'q1/hash2' }], error: null }) };
    getSupabaseClientMock.mockReturnValue({
      from: (table: string) => (table === 'saved_queries' ? queryBuilder : imagesBuilder),
    });

    const res = await handler(req('q1', 'DELETE'));
    expect(res.status).toBe(200);
    expect(removeBucketImagesMock).toHaveBeenCalledWith(['q1/hash1', 'q1/hash2']);
    expect(deleteSpy).toHaveBeenCalled();
  });
});
