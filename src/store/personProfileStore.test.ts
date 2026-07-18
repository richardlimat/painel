import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getApiFullProfile } from '../services/apifull';
import { usePersonProfileStore } from './personProfileStore';

vi.mock('../services/apifull', () => ({
  getApiFullProfile: vi.fn(),
}));

const mockedGetProfile = vi.mocked(getApiFullProfile);

const CPF = '11144477735';
const profileFixture = { SERVICE_RESPONSE: { cadastral: { nome: 'FULANO' } } };

function resetStore() {
  usePersonProfileStore.setState({
    profilesByCpf: new Map(),
    requestsByCpf: new Map(),
    errorsByCpf: new Map(),
    sociedadesStatusByCpf: new Map(),
  });
}

describe('personProfileStore.loadProfile', () => {
  beforeEach(() => {
    resetStore();
    mockedGetProfile.mockReset();
  });

  it('busca e cacheia o perfil', async () => {
    mockedGetProfile.mockResolvedValue(profileFixture);
    const profile = await usePersonProfileStore.getState().loadProfile(CPF);
    expect(profile).toEqual(profileFixture);
    expect(usePersonProfileStore.getState().profilesByCpf.get(CPF)).toEqual(profileFixture);
    expect(mockedGetProfile).toHaveBeenCalledTimes(1);
  });

  it('reaproveita a mesma Promise para chamadas concorrentes (evita cobrança dupla)', async () => {
    mockedGetProfile.mockResolvedValue(profileFixture);
    const [a, b] = await Promise.all([
      usePersonProfileStore.getState().loadProfile(CPF),
      usePersonProfileStore.getState().loadProfile(CPF),
    ]);
    expect(a).toEqual(b);
    expect(mockedGetProfile).toHaveBeenCalledTimes(1);
  });

  it('reaproveita o perfil já em cache sem chamar de novo', async () => {
    mockedGetProfile.mockResolvedValue(profileFixture);
    await usePersonProfileStore.getState().loadProfile(CPF);
    await usePersonProfileStore.getState().loadProfile(CPF);
    expect(mockedGetProfile).toHaveBeenCalledTimes(1);
  });

  it('não cacheia erro — nova chamada após falha tenta de novo (compartilhado entre painel e camadas)', async () => {
    mockedGetProfile.mockRejectedValueOnce(new Error('falhou')).mockResolvedValueOnce(profileFixture);
    await expect(usePersonProfileStore.getState().loadProfile(CPF)).rejects.toThrow('falhou');
    expect(usePersonProfileStore.getState().errorsByCpf.get(CPF)).toBe('falhou');

    const profile = await usePersonProfileStore.getState().loadProfile(CPF);
    expect(profile).toEqual(profileFixture);
    expect(usePersonProfileStore.getState().errorsByCpf.has(CPF)).toBe(false);
    expect(mockedGetProfile).toHaveBeenCalledTimes(2);
  });
});

describe('sociedadesStatusByCpf', () => {
  beforeEach(resetStore);

  it('markSociedadeOutcome move CNPJ de pending para succeeded/failed', () => {
    usePersonProfileStore
      .getState()
      .setSociedadesStatus(CPF, { pending: ['11222333000181', '22333444000199'], succeeded: [], failed: [] });
    usePersonProfileStore.getState().markSociedadeOutcome(CPF, '11222333000181', 'succeeded');
    usePersonProfileStore.getState().markSociedadeOutcome(CPF, '22333444000199', 'failed');
    expect(usePersonProfileStore.getState().sociedadesStatusByCpf.get(CPF)).toEqual({
      pending: [],
      succeeded: ['11222333000181'],
      failed: ['22333444000199'],
    });
  });

  it('resetFailedToPending move failed de volta para pending sem duplicar succeeded (retry só reprocessa falhas)', () => {
    usePersonProfileStore.getState().setSociedadesStatus(CPF, { pending: [], succeeded: ['a'], failed: ['b', 'c'] });
    usePersonProfileStore.getState().resetFailedToPending(CPF);
    expect(usePersonProfileStore.getState().sociedadesStatusByCpf.get(CPF)).toEqual({
      pending: ['b', 'c'],
      succeeded: ['a'],
      failed: [],
    });
  });

  it('cada atualização cria uma nova instância de Map (necessário para o Zustand re-renderizar)', () => {
    const before = usePersonProfileStore.getState().sociedadesStatusByCpf;
    usePersonProfileStore.getState().setSociedadesStatus(CPF, { pending: [], succeeded: [], failed: [] });
    const after = usePersonProfileStore.getState().sociedadesStatusByCpf;
    expect(after).not.toBe(before);
  });
});
