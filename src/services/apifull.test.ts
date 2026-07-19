import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractSociedades, getApiFullProfile, PersonNotFoundError, type ApiFullProfile } from './apifull';

// Fixtures sintéticas conhecidas — não são documentos de pessoas/empresas reais.
const VALID_CPF = '11144477735';
const VALID_CNPJ = '11222333000181';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const successBody = (serviceResponse: Record<string, unknown>) => ({
  status: 'sucesso',
  dados: { SERVICE_RESPONSE: serviceResponse },
});

describe('getApiFullProfile', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejeita CPF inválido sem chamar fetch', async () => {
    await expect(getApiFullProfile('123')).rejects.toThrow('CPF inválido');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lança PersonNotFoundError em 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'não encontrado' }, 404));
    await expect(getApiFullProfile(VALID_CPF)).rejects.toBeInstanceOf(PersonNotFoundError);
  });

  it('lança erro com mensagem específica em status de falha (ex.: 429)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'muitas requisições' }, 429));
    await expect(getApiFullProfile(VALID_CPF)).rejects.toThrow('Limite de requisições');
  });

  it('rejeita HTTP 200 sem status "sucesso" (erro de negócio, não fica em cache de perfil válido)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'erro', dados: { SERVICE_RESPONSE: {} } }));
    await expect(getApiFullProfile(VALID_CPF)).rejects.toThrow('sem sucesso');
  });

  it('rejeita HTTP 200 sem "dados"', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'sucesso' }));
    await expect(getApiFullProfile(VALID_CPF)).rejects.toThrow();
  });

  it('rejeita HTTP 200 com SERVICE_RESPONSE que não é objeto', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'sucesso', dados: { SERVICE_RESPONSE: [] } }));
    await expect(getApiFullProfile(VALID_CPF)).rejects.toThrow();
  });

  it('preserva SERVICE_RESPONSE integralmente, incluindo chaves desconhecidas', async () => {
    const serviceResponse = {
      cadastral: { nome: 'FULANO DE TAL' },
      umaCategoriaFuturaAindaNaoMapeada: { qualquerCoisa: 42 },
    };
    fetchMock.mockResolvedValue(jsonResponse(successBody(serviceResponse)));
    const profile = await getApiFullProfile(VALID_CPF);
    expect(profile.SERVICE_RESPONSE).toEqual(serviceResponse);
  });
});

describe('extractSociedades', () => {
  it('mapeia campos snake_case da APIFull corretamente', () => {
    const profile: ApiFullProfile = {
      SERVICE_RESPONSE: {
        sociedades: [
          {
            cnpj: VALID_CNPJ,
            razao_social: 'EMPRESA TESTE LTDA',
            situacao_cadastral: 'ATIVA',
            qualificacao_socio_descricao: 'Sócio Administrador',
            dt_entrada: '10/05/2024',
            nome_socio: 'FULANO DE TAL',
            documento_socio: VALID_CPF,
          },
        ],
      },
    };
    const result = extractSociedades(profile);
    expect(result).toEqual([
      {
        cnpj: VALID_CNPJ,
        razaoSocial: 'EMPRESA TESTE LTDA',
        situacaoCadastral: 'ATIVA',
        qualificacaoSocioDescricao: 'Sócio Administrador',
        dtEntrada: '10/05/2024',
        nomeSocio: 'FULANO DE TAL',
        documentoSocio: VALID_CPF,
      },
    ]);
  });

  it('descarta itens com CNPJ inválido (formato ou checksum)', () => {
    const profile: ApiFullProfile = {
      SERVICE_RESPONSE: { sociedades: [{ cnpj: '123', documento_socio: VALID_CPF }] },
    };
    expect(extractSociedades(profile)).toEqual([]);
  });

  it('descarta itens com documento_socio que não é CPF válido', () => {
    const profile: ApiFullProfile = {
      SERVICE_RESPONSE: { sociedades: [{ cnpj: VALID_CNPJ, documento_socio: '000' }] },
    };
    expect(extractSociedades(profile)).toEqual([]);
  });

  it('retorna array vazio quando sociedades não existe ou não é array', () => {
    expect(extractSociedades({ SERVICE_RESPONSE: {} })).toEqual([]);
    expect(extractSociedades({ SERVICE_RESPONSE: { sociedades: 'não é array' } })).toEqual([]);
  });
});
