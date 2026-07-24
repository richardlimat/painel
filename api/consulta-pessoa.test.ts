import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requireSessionMock } = vi.hoisted(() => ({ requireSessionMock: vi.fn() }));
vi.mock('./_lib/auth', () => ({ requireSession: requireSessionMock }));

import handler, { normalizeAndValidateCpf } from './consulta-pessoa';

// Fixture sintética conhecida (não é documento de pessoa real) — usada em
// tutoriais de validação de CPF, só serve para testar o algoritmo.
const VALID_CPF = '11144477735';

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/consulta-pessoa', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('normalizeAndValidateCpf', () => {
  it('normaliza e aceita CPF válido com pontuação', () => {
    expect(normalizeAndValidateCpf(JSON.stringify({ cpf: '111.444.777-35' }))).toEqual({
      ok: true,
      cpf: VALID_CPF,
    });
  });

  it('rejeita CPF com checksum inválido', () => {
    expect(normalizeAndValidateCpf(JSON.stringify({ cpf: '111.444.777-36' })).ok).toBe(false);
  });

  it('rejeita corpo sem campo cpf', () => {
    expect(normalizeAndValidateCpf(JSON.stringify({ link: 'cpf-ultra' })).ok).toBe(false);
  });

  it('rejeita JSON malformado', () => {
    expect(normalizeAndValidateCpf('{not json').ok).toBe(false);
  });

  it('rejeita cpf não-string', () => {
    expect(normalizeAndValidateCpf(JSON.stringify({ cpf: 11144477735 })).ok).toBe(false);
  });
});

describe('handler (api/consulta-pessoa)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.APIFULL_AUTHORIZATION = 'test-authorization-value';
    requireSessionMock.mockReset();
    requireSessionMock.mockResolvedValue({ ok: true, userId: 'user-1' });
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'sucesso', dados: { SERVICE_RESPONSE: {} } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.APIFULL_AUTHORIZATION;
  });

  it('rejeita método diferente de POST sem chamar a API', async () => {
    const res = await handler(new Request('http://localhost/api/consulta-pessoa', { method: 'GET' }));
    expect(res.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sem sessão válida retorna a resposta de requireSession sem chamar a API paga', async () => {
    requireSessionMock.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    const res = await handler(postRequest({ cpf: VALID_CPF }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bloqueia CPF inválido antes de chamar a API paga', async () => {
    const res = await handler(postRequest({ cpf: '00000000000' }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envia POST com Content-Type json e Authorization exatamente como configurado (sem Bearer)', async () => {
    await handler(postRequest({ cpf: VALID_CPF }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://api.apifull.com.br/api/cpf-ultra');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers.Authorization).toBe('test-authorization-value');
  });

  it('body enviado à APIFull tem exatamente cpf e link "cpf-ultra", ignorando link do cliente', async () => {
    await handler(postRequest({ cpf: VALID_CPF, link: 'outro-endpoint-que-o-cliente-tentou-forcar' }));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ cpf: VALID_CPF, link: 'cpf-ultra' });
  });

  it('retorna 500 sem chamar a API se APIFULL_AUTHORIZATION não estiver configurada', async () => {
    delete process.env.APIFULL_AUTHORIZATION;
    const res = await handler(postRequest({ cpf: VALID_CPF }));
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.code).toBe('configuration_incomplete');
    expect(body.message).not.toMatch(/api|chave|apifull|authorization/i);
  });

  it('nunca repassa o corpo cru de um erro do upstream (nome, domínio, saldo, chave) — devolve envelope neutro', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Saldo insuficiente na conta APIFull (https://apifull.com.br). Authorization inválida.',
        }),
        { status: 402, headers: { 'content-type': 'application/json' } },
      ),
    );
    const res = await handler(postRequest({ cpf: VALID_CPF }));
    expect(res.status).toBe(402);
    const text = await res.text();
    expect(text).not.toMatch(/apifull|saldo|authorization/i);
    const body = JSON.parse(text);
    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('id');
  });

  it('timeout do upstream vira 504 com envelope neutro (nunca a palavra "endpoint"/"API")', async () => {
    fetchMock.mockImplementation(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });
    const res = await handler(postRequest({ cpf: VALID_CPF }));
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.message).not.toMatch(/endpoint|api|apifull/i);
  });

  it('resposta sempre tem Cache-Control private, no-store', async () => {
    const res = await handler(postRequest({ cpf: VALID_CPF }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('rejeita corpo maior que o limite antes de processar', async () => {
    const res = await handler(postRequest({ cpf: VALID_CPF, junk: 'x'.repeat(3000) }));
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
