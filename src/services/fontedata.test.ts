import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onlyDigits } from '../lib/format';
import { FonteDataProvider } from './fontedata';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const VALID_CNPJ = '33260563000178';

const baseCompanyPayload = {
  cnpj: VALID_CNPJ,
  razaoSocial: 'EMPRESA TESTE LTDA',
  situacaoCadastral: 'ATIVA',
  socios: [
    { nome: 'PESSOA FISICA', cargo: 'Sócio', documento: '651.300.901-44' }, // CPF, 11 dígitos
    { nome: 'EMPRESA SOCIA LTDA', cargo: 'Sócio', documento: '11222333000181' }, // CNPJ, 14 dígitos
  ],
};

describe('onlyDigits', () => {
  it('remove pontuação do CNPJ', () => {
    expect(onlyDigits('33.260.563/0001-78')).toBe('33260563000178');
  });
});

describe('FonteDataProvider.getCompany', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejeita CNPJ com menos de 14 dígitos sem chamar fetch', async () => {
    const provider = new FonteDataProvider();
    await expect(provider.getCompany('123')).rejects.toThrow('CNPJ inválido');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejeita CNPJ com mais de 14 dígitos sem chamar fetch', async () => {
    const provider = new FonteDataProvider();
    await expect(provider.getCompany('123456789012345')).rejects.toThrow('CNPJ inválido');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('separa sócio CPF (person) de sócio CNPJ (company) — CPF nunca vira nó de empresa', async () => {
    fetchMock.mockResolvedValue(jsonResponse(baseCompanyPayload));
    const provider = new FonteDataProvider();
    const result = await provider.getCompany(VALID_CNPJ);

    expect(result.partners).toHaveLength(2);
    const [socioPF, socioPJ] = result.partners;
    expect(socioPF.person).toBeDefined();
    expect(socioPF.company).toBeUndefined();
    expect(socioPJ.company).toBeDefined();
    expect(socioPJ.person).toBeUndefined();
    expect(socioPJ.company?.cnpj).toBe('11222333000181');
  });

  it('reaproveita a mesma Promise para chamadas concorrentes ao mesmo CNPJ (evita cobrança dupla)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(baseCompanyPayload));
    const provider = new FonteDataProvider();

    const [a, b] = await Promise.all([provider.getCompany(VALID_CNPJ), provider.getCompany(VALID_CNPJ)]);

    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('não guarda erro em cache — nova chamada após falha dispara novo fetch', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 'invalid_parameters', message: 'erro' }, 400))
      .mockResolvedValueOnce(jsonResponse(baseCompanyPayload));
    const provider = new FonteDataProvider();

    await expect(provider.getCompany(VALID_CNPJ)).rejects.toThrow();
    const result = await provider.getCompany(VALID_CNPJ);

    expect(result.company.cnpj).toBe(VALID_CNPJ);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('erro do proxy nunca expõe nome de fornecedor, saldo ou chave — só a mensagem já neutralizada pelo servidor', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { code: 'service_unavailable', message: 'Serviço temporariamente indisponível.', id: 'ab12cd34' },
        401,
      ),
    );
    const provider = new FonteDataProvider();
    await expect(provider.getCompany(VALID_CNPJ)).rejects.toThrow('Serviço temporariamente indisponível.');
  });
});
