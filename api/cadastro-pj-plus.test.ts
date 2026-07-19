import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requireSessionMock } = vi.hoisted(() => ({ requireSessionMock: vi.fn() }));
vi.mock('./_lib/auth', () => ({ requireSession: requireSessionMock }));

import handler, { buildFonteDataUrl } from './cadastro-pj-plus';

describe('buildFonteDataUrl', () => {
  it('monta a URL exata esperada pela FonteData', () => {
    const url = buildFonteDataUrl('33260563000178');

    expect(url.origin).toBe('https://app.fontedata.com');
    expect(url.pathname).toBe('/api/v1/consulta/cadastro-pj-plus');
    expect(url.searchParams.get('cnpj')).toBe('33260563000178');
    expect(url.searchParams.has('CNPJ')).toBe(false);
    expect(url.toString()).toBe(
      'https://app.fontedata.com/api/v1/consulta/cadastro-pj-plus?cnpj=33260563000178',
    );
  });
});

function req(cnpj: string): Request {
  return new Request(`http://localhost/api/cadastro-pj-plus?CNPJ=${cnpj}`);
}

describe('handler (api/cadastro-pj-plus)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.FONTEDATA_API_KEY = 'test-api-key';
    requireSessionMock.mockReset();
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ empresa: { razaoSocial: 'ACME' }, socios: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    delete process.env.FONTEDATA_API_KEY;
  });

  it('1. sem sessão válida retorna a resposta de requireSession sem chamar a FonteData', async () => {
    requireSessionMock.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    const res = await handler(req('33260563000178'));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('2. CNPJ inválido retorna 400 sem chamar a API', async () => {
    const res = await handler(req('123'));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('3. chama a FonteData com X-API-Key e repassa o corpo', async () => {
    const res = await handler(req('33260563000178'));
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers['X-API-Key']).toBe('test-api-key');
    const body = await res.json();
    expect(body).toEqual({ empresa: { razaoSocial: 'ACME' }, socios: [] });
  });

  it('4. nunca loga o CNPJ nem o corpo da resposta da FonteData', async () => {
    await handler(req('33260563000178'));
    for (const call of logSpy.mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain('33260563000178');
      expect(serialized).not.toContain('ACME');
      expect(serialized).not.toContain('razaoSocial');
    }
  });

  it('5. retorna 500 sem chamar a API se FONTEDATA_API_KEY não estiver configurada', async () => {
    delete process.env.FONTEDATA_API_KEY;
    const res = await handler(req('33260563000178'));
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
