import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireSessionMock, getSupabaseClientMock, fetchExternalImageMock, uploadImageToBucketMock } = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  getSupabaseClientMock: vi.fn(),
  fetchExternalImageMock: vi.fn(),
  uploadImageToBucketMock: vi.fn(),
}));

vi.mock('../_lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/auth')>();
  return { ...actual, requireSession: requireSessionMock };
});
vi.mock('../_lib/supabase', () => ({ getSupabaseClient: getSupabaseClientMock }));
vi.mock('../_lib/uploads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/uploads')>();
  return {
    ...actual,
    fetchExternalImage: fetchExternalImageMock,
    uploadImageToBucket: uploadImageToBucketMock,
  };
});

import handler from './index';

function req(method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://painel.example.com/api/saved-queries', {
    method,
    headers: {
      'content-type': 'application/json',
      origin: 'https://painel.example.com',
      host: 'painel.example.com',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);

describe('GET /api/saved-queries — lista', () => {
  beforeEach(() => {
    requireSessionMock.mockReset();
    getSupabaseClientMock.mockReset();
  });

  it('1. sem sessão retorna a resposta de requireSession', async () => {
    requireSessionMock.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    const res = await handler(req('GET'));
    expect(res.status).toBe(401);
    expect(getSupabaseClientMock).not.toHaveBeenCalled();
  });

  it('2. lista só as consultas do usuário autenticado', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    const eqSpy = vi.fn().mockReturnThis();
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (...args: unknown[]) => {
        eqSpy(...args);
        return builder;
      },
      order: () => Promise.resolve({ data: [{ id: 'q1', titulo: 'X', cnpj_raiz: '123' }], error: null }),
    };
    getSupabaseClientMock.mockReturnValue({ from: () => builder });

    const res = await handler(req('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'user-1');
  });
});

describe('POST /api/saved-queries — criar', () => {
  beforeEach(() => {
    requireSessionMock.mockReset();
    getSupabaseClientMock.mockReset();
    fetchExternalImageMock.mockReset();
    uploadImageToBucketMock.mockReset();
    uploadImageToBucketMock.mockResolvedValue({ ok: true });
  });

  it('1. rejeita método não suportado', async () => {
    const res = await handler(new Request('https://x.com', { method: 'PUT' }));
    expect(res.status).toBe(405);
  });

  it('2. rejeita Origin divergente', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    const res = await handler(req('POST', { cnpjRaiz: '123', snapshot: {} }, { origin: 'https://evil.com' }));
    expect(res.status).toBe(403);
  });

  it('3. rejeita corpo sem cnpjRaiz/snapshot', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    const res = await handler(req('POST', { titulo: 'x' }));
    expect(res.status).toBe(400);
  });

  it('4. cria a consulta e remove campos hard do snapshot antes de persistir', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    const insertedSnapshot: { current?: unknown } = {};
    const builder: Record<string, unknown> = {
      insert: (payload: Record<string, unknown>) => {
        insertedSnapshot.current = payload.snapshot;
        return builder;
      },
      select: () => builder,
      single: async () => ({ data: { id: 'new-id' }, error: null }),
    };
    getSupabaseClientMock.mockReturnValue({ from: () => builder });

    const res = await handler(
      req('POST', {
        cnpjRaiz: '11222333000181',
        snapshot: { profiles: { '111': { SERVICE_RESPONSE: { senha: 'segredo', nome: 'ok' } } } },
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('new-id');
    expect(JSON.stringify(insertedSnapshot.current)).not.toContain('segredo');
    expect(JSON.stringify(insertedSnapshot.current)).toContain('ok');
  });

  it('5. falha ao criar a consulta retorna 500', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    const builder: Record<string, unknown> = {
      insert: () => builder,
      select: () => builder,
      single: async () => ({ data: null, error: { message: 'boom' } }),
    };
    getSupabaseClientMock.mockReturnValue({ from: () => builder });
    const res = await handler(req('POST', { cnpjRaiz: '123', snapshot: {} }));
    expect(res.status).toBe(500);
  });

  it('6. upload de imagens só acontece ao salvar; falha de 1 imagem não impede salvar a consulta (aviso parcial)', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    fetchExternalImageMock.mockImplementation(async (url: string) =>
      url.includes('falha') ? { ok: false, error: 'falhou' } : { ok: true, bytes: PNG_BYTES },
    );
    const imagesInsertSpy = vi.fn().mockResolvedValue({ error: null });
    const savedQueriesBuilder: Record<string, unknown> = {
      insert: () => savedQueriesBuilder,
      select: () => savedQueriesBuilder,
      single: async () => ({ data: { id: 'q-imgs' }, error: null }),
    };
    const savedQueryImagesBuilder = { insert: imagesInsertSpy };
    getSupabaseClientMock.mockReturnValue({
      from: (table: string) => (table === 'saved_queries' ? savedQueriesBuilder : savedQueryImagesBuilder),
    });

    const res = await handler(
      req('POST', {
        cnpjRaiz: '123',
        snapshot: {},
        images: [
          { personId: 'p:1', sourceUrl: 'https://cdn.example.com/ok.jpg' },
          { personId: 'p:2', sourceUrl: 'https://cdn.example.com/falha.jpg' },
        ],
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.imagesFailed).toBe(1);
    expect(imagesInsertSpy).toHaveBeenCalledTimes(1); // só a imagem que baixou com sucesso é inserida
    expect(fetchExternalImageMock).toHaveBeenCalledTimes(2); // só chama a rede ao salvar, uma vez por imagem
  });

  it('7. imagem com MIME não permitido (fora da whitelist) conta como falha, sem chamar upload', async () => {
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    fetchExternalImageMock.mockResolvedValue({ ok: true, bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }); // PDF
    const savedQueriesBuilder: Record<string, unknown> = {
      insert: () => savedQueriesBuilder,
      select: () => savedQueriesBuilder,
      single: async () => ({ data: { id: 'q-pdf' }, error: null }),
    };
    getSupabaseClientMock.mockReturnValue({ from: () => savedQueriesBuilder });

    const res = await handler(
      req('POST', { cnpjRaiz: '123', snapshot: {}, images: [{ personId: 'p:1', sourceUrl: 'https://cdn.example.com/x.pdf' }] }),
    );
    const body = await res.json();
    expect(body.imagesFailed).toBe(1);
    expect(uploadImageToBucketMock).not.toHaveBeenCalled();
  });
});
