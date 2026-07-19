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
    queue: [],
    processing: false,
    queueTotal: 0,
    queueDone: 0,
    queueFailed: 0,
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

describe('fila sequencial (concorrência 1)', () => {
  beforeEach(() => {
    resetStore();
    mockedGetProfile.mockReset();
  });

  const CPF_A = '11144477735';
  const CPF_B = '52998224725';

  /** Espera a fila esvaziar por completo — evita que um teste "vaze" estado pro próximo (workerRunning é module-scope). */
  async function drainQueue() {
    await vi.waitFor(() => {
      const s = usePersonProfileStore.getState();
      if (s.processing || s.queue.length > 0) throw new Error('fila ainda processando');
    });
  }

  it('5. nunca chama a APIFull duas vezes em paralelo — concorrência máxima 1', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const deferreds: Array<() => void> = [];
    mockedGetProfile.mockImplementation(
      () =>
        new Promise((resolve) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          deferreds.push(() => {
            inFlight -= 1;
            resolve(profileFixture);
          });
        }),
    );

    const p1 = usePersonProfileStore.getState().loadProfile(CPF_A);
    usePersonProfileStore.getState().prefetchProfiles([CPF_B]);
    await Promise.resolve();
    await Promise.resolve();
    expect(inFlight).toBe(1); // só 1 chamada real em voo mesmo com 2 CPFs enfileirados

    deferreds[0]();
    await p1;
    await Promise.resolve();
    await Promise.resolve();
    expect(inFlight).toBe(1);
    deferreds[1]?.();

    expect(maxInFlight).toBe(1);
    await drainQueue();
  });

  it('6. CPF duplicado não entra duas vezes na fila', async () => {
    mockedGetProfile.mockResolvedValue(profileFixture);
    usePersonProfileStore.getState().prefetchProfiles([CPF_A, CPF_B, CPF_B]);
    // CPF_A começa a ser processado de imediato (sai da fila); CPF_B só pode entrar 1x, mesmo pedido 2x.
    expect(usePersonProfileStore.getState().queue).toEqual([CPF_B]);
    await drainQueue();
  });

  it('7. perfil já carregado (ou em voo) é reaproveitado entre clique no painel e prefetch por camada', async () => {
    mockedGetProfile.mockResolvedValue(profileFixture);
    usePersonProfileStore.getState().prefetchProfiles([CPF_A]);
    const fromClick = await usePersonProfileStore.getState().loadProfile(CPF_A);
    expect(fromClick).toEqual(profileFixture);
    expect(mockedGetProfile).toHaveBeenCalledTimes(1);

    // nova "camada" tentando o mesmo CPF depois de já carregado — reaproveita o cache
    await usePersonProfileStore.getState().loadProfile(CPF_A);
    expect(mockedGetProfile).toHaveBeenCalledTimes(1);
  });

  it('8. falha de um CPF não para a fila — o próximo é processado normalmente', async () => {
    mockedGetProfile.mockRejectedValueOnce(new Error('falhou')).mockResolvedValueOnce(profileFixture);
    usePersonProfileStore.getState().prefetchProfiles([CPF_A, CPF_B]);
    await drainQueue();
    expect(usePersonProfileStore.getState().errorsByCpf.get(CPF_A)).toBe('falhou');
    expect(usePersonProfileStore.getState().profilesByCpf.get(CPF_B)).toEqual(profileFixture);
  });

  it('9. nova pesquisa cancela os itens pendentes (ainda não iniciados) da fila anterior', async () => {
    let releaseCurrent: (() => void) | undefined;
    mockedGetProfile.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseCurrent = () => resolve(profileFixture);
        }),
    );
    const CPF_D = '39053344705'; // CPF válido sintético adicional
    usePersonProfileStore.getState().prefetchProfiles([CPF_A, CPF_B]);
    await Promise.resolve();
    // CPF_A já começou a ser processado (saiu da fila); CPF_B ainda está pendente.
    expect(usePersonProfileStore.getState().queue).toEqual([CPF_B]);

    usePersonProfileStore.getState().cancelPendingQueue();
    expect(usePersonProfileStore.getState().queue).toEqual([]);
    expect(usePersonProfileStore.getState().requestsByCpf.has(CPF_B)).toBe(false);

    usePersonProfileStore.getState().prefetchProfiles([CPF_D]);
    expect(usePersonProfileStore.getState().queue).toEqual([CPF_D]);

    // a requisição em andamento (CPF_A) não foi destrutivamente cancelada — ainda completa normalmente.
    releaseCurrent?.();
    await vi.waitFor(() => {
      if (!usePersonProfileStore.getState().profilesByCpf.has(CPF_A)) throw new Error('CPF_A ainda pendente');
    });
    expect(usePersonProfileStore.getState().profilesByCpf.get(CPF_A)).toEqual(profileFixture);

    releaseCurrent?.(); // agora já reatribuído pro resolver do CPF_D (fila seguiu automaticamente)
    await drainQueue();
    expect(usePersonProfileStore.getState().profilesByCpf.get(CPF_D)).toEqual(profileFixture);
  });
});

describe('lote (batch) sobre a fila sequencial — sem Promise.all/allSettled', () => {
  beforeEach(() => {
    resetStore();
    mockedGetProfile.mockReset();
  });

  const CPF_A = '11144477735';
  const CPF_B = '52998224725';
  const CPF_C = '39053344705';

  it('1. runBatch resolve com succeeded/failed corretos, incluindo CPF inválido (checksum não confere)', async () => {
    mockedGetProfile.mockImplementation((cpf: string) =>
      cpf === CPF_B ? Promise.reject(new Error('falhou')) : Promise.resolve(profileFixture),
    );
    const result = await usePersonProfileStore.getState().runBatch([CPF_A, CPF_B, '00000000000']);
    expect(result.succeeded).toEqual([CPF_A]);
    expect(result.failed.sort()).toEqual([CPF_B, '00000000000'].sort());
  });

  it('2. runBatch nunca usa Promise.all — concorrência real continua 1 mesmo com 3 CPFs no lote', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mockedGetProfile.mockImplementation(
      () =>
        new Promise((resolve) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          setTimeout(() => {
            inFlight -= 1;
            resolve(profileFixture);
          }, 0);
        }),
    );
    await usePersonProfileStore.getState().runBatch([CPF_A, CPF_B, CPF_C]);
    expect(maxInFlight).toBe(1);
    expect(mockedGetProfile).toHaveBeenCalledTimes(3);
  });

  it('3. onEach dispara para cada CPF assim que ele termina (sucesso ou falha)', async () => {
    mockedGetProfile.mockImplementation((cpf: string) =>
      cpf === CPF_B ? Promise.reject(new Error('falhou')) : Promise.resolve(profileFixture),
    );
    const seen: Array<[string, boolean]> = [];
    await usePersonProfileStore.getState().runBatch([CPF_A, CPF_B], { onEach: (cpf, ok) => seen.push([cpf, ok]) });
    expect(seen.sort()).toEqual(
      [
        [CPF_A, true],
        [CPF_B, false],
      ].sort(),
    );
  });

  it('4. CPF já em cache resolve o lote instantaneamente, sem chamar a APIFull de novo', async () => {
    usePersonProfileStore.setState({ profilesByCpf: new Map([[CPF_A, profileFixture]]) });
    const result = await usePersonProfileStore.getState().runBatch([CPF_A]);
    expect(result.succeeded).toEqual([CPF_A]);
    expect(mockedGetProfile).not.toHaveBeenCalled();
  });

  it('5. startBatch + addToBatch: o lote só resolve depois de sealBatch, mesmo com os CPFs iniciais já concluídos', async () => {
    mockedGetProfile.mockResolvedValue(profileFixture);
    const { batchId, promise } = usePersonProfileStore.getState().startBatch([CPF_A]);
    await usePersonProfileStore.getState().loadProfile(CPF_A); // garante que CPF_A já terminou antes de selar

    let resolved = false;
    void promise.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false); // ainda não selado — não deve resolver sozinho

    usePersonProfileStore.getState().addToBatch(batchId, [CPF_B]);
    usePersonProfileStore.getState().sealBatch(batchId);
    const result = await promise;
    expect(result.succeeded.sort()).toEqual([CPF_A, CPF_B].sort());
  });

  it('6. nova pesquisa (cancelPendingQueue) não deixa um lote pendente pendurado para sempre', async () => {
    let release: (() => void) | undefined;
    mockedGetProfile.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(profileFixture);
        }),
    );
    const promise = usePersonProfileStore.getState().runBatch([CPF_A, CPF_B]);
    await Promise.resolve(); // CPF_A começou a ser processado; CPF_B ainda está na fila

    usePersonProfileStore.getState().cancelPendingQueue(); // CPF_B cancelado (ainda não iniciado)
    release?.(); // libera CPF_A (em andamento — termina normalmente, não é cancelado)
    const result = await promise; // não deve travar indefinidamente
    expect(result.failed).toContain(CPF_B);
  });
});

describe('hydrateProfiles — abrir consulta salva sem chamar a APIFull', () => {
  beforeEach(() => {
    resetStore();
    mockedGetProfile.mockReset();
  });

  it('1. pré-popula o cache sem nenhuma chamada à APIFull', () => {
    usePersonProfileStore.getState().hydrateProfiles({ [CPF]: profileFixture });
    expect(usePersonProfileStore.getState().profilesByCpf.get(CPF)).toEqual(profileFixture);
    expect(mockedGetProfile).not.toHaveBeenCalled();
  });

  it('2. perfil hidratado é reaproveitado por loadProfile (nunca rechama a API)', async () => {
    usePersonProfileStore.getState().hydrateProfiles({ [CPF]: profileFixture });
    const profile = await usePersonProfileStore.getState().loadProfile(CPF);
    expect(profile).toEqual(profileFixture);
    expect(mockedGetProfile).not.toHaveBeenCalled();
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
