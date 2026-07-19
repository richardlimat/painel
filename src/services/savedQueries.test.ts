import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSavedQuery, deleteSavedQuery, getSavedQuery, listSavedQueries } from './savedQueries';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('savedQueries service', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('1. listSavedQueries chama GET same-origin e retorna os itens', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [{ id: 'q1', titulo: 'X', cnpj_raiz: '123', created_at: '', updated_at: '' }] }));
    const items = await listSavedQueries();
    expect(items).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/saved-queries');
    expect(init.credentials).toBe('same-origin');
  });

  it('2. createSavedQuery envia POST com o payload e retorna id/imagesFailed', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'q1', imagesFailed: 1 }, 201));
    const result = await createSavedQuery({
      cnpjRaiz: '123',
      snapshot: { rootId: 'c:1', nodes: [], links: [], currentLayer: 1, maxDepth: 5, filters: {} as never, profiles: {} },
      images: [],
    });
    expect(result).toEqual({ id: 'q1', imagesFailed: 1 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).cnpjRaiz).toBe('123');
  });

  it('3. getSavedQuery busca por id e retorna o detalhe', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'q1', titulo: null, cnpjRaiz: '123', snapshot: {}, photoUrlsByPersonId: {} }));
    const detail = await getSavedQuery('q1');
    expect(detail.id).toBe('q1');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/saved-queries/q1');
  });

  it('4. deleteSavedQuery envia DELETE', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await deleteSavedQuery('q1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/saved-queries/q1');
    expect(init.method).toBe('DELETE');
  });

  it('5. erro HTTP lança com a mensagem do servidor', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'not_found', message: 'Consulta não encontrada.' }, 404));
    await expect(getSavedQuery('q404')).rejects.toThrow('Consulta não encontrada.');
  });
});
