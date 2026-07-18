// @vitest-environment jsdom
// graphStore.ts lê `document`/`localStorage` no topo do módulo (tema) — precisa de DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphLink, GraphNode } from '../types/graph';
import { addOrMergeLink, companyId, personId, useGraphStore } from './graphStore';
import { usePersonProfileStore } from './personProfileStore';
import { FonteDataProvider } from '../services/fontedata';

// Fixtures sintéticas conhecidas (não são documentos/empresas reais).
const PERSON_CPF = '11144477735';
const OUTRO_SOCIO_CPF = '52998224725';
const NEW_CNPJ = '11222333000181';
const FAILING_CNPJ = '44556677000186';
const CNPJ_2 = '10000002118569';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function apiFullSuccess(sociedades: Record<string, unknown>[]) {
  return jsonResponse({ status: 'sucesso', dados: { SERVICE_RESPONSE: { sociedades } } });
}

function fonteDataCompany(cnpj: string, socios: Record<string, unknown>[]) {
  return jsonResponse({
    cnpj,
    razaoSocial: `EMPRESA ${cnpj} LTDA`,
    situacaoCadastral: 'ATIVA',
    socios,
  });
}

function resetStores() {
  useGraphStore.setState({
    // instância nova a cada teste — o cache interno do FonteDataProvider não
    // pode vazar entre testes que reusam os mesmos CNPJs de fixture.
    providers: { fontedata: new FonteDataProvider() },
    nodes: [],
    links: [],
    nodeIndex: new Map(),
    timeline: [],
    rootId: null,
    selectedNodeId: null,
    breadcrumb: [],
    expandingIds: new Set(),
    loading: false,
    error: null,
    notice: null,
    currentLayer: 1,
    layerLoading: false,
    graphEpoch: 0,
    maxDepth: 5,
  });
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

function putPersonNode(depth: number): GraphNode {
  const node: GraphNode = {
    id: personId(PERSON_CPF),
    kind: 'person',
    label: 'FULANO DE TAL',
    depth,
    expanded: false,
    person: { cpf: PERSON_CPF, nome: 'FULANO DE TAL' },
  };
  useGraphStore.setState((s) => {
    const idx = new Map(s.nodeIndex);
    idx.set(node.id, node);
    return { nodeIndex: idx, nodes: [...idx.values()] };
  });
  return node;
}

describe('expandNode em nó pessoa (pipeline APIFull → FonteData)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetStores();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('empresa descoberta via sociedades[] e todos os seus sócios entram na MESMA camada (não uma camada acima)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/cpf-ultra')) {
        return apiFullSuccess([
          {
            cnpj: NEW_CNPJ,
            razao_social: 'EMPRESA NOVA LTDA',
            situacao_cadastral: 'ATIVA',
            qualificacao_socio_descricao: 'Sócio',
            dt_entrada: '10/05/2024',
            nome_socio: 'FULANO DE TAL',
            documento_socio: PERSON_CPF,
          },
        ]);
      }
      if (url.includes(`CNPJ=${NEW_CNPJ}`)) {
        return fonteDataCompany(NEW_CNPJ, [
          { nome: 'FULANO DE TAL', cargo: 'Sócio', documento: PERSON_CPF },
          { nome: 'OUTRO SOCIO', cargo: 'Sócio', documento: OUTRO_SOCIO_CPF },
        ]);
      }
      return jsonResponse({ message: 'unexpected' }, 404);
    });

    const person = putPersonNode(1); // pessoa na camada 2 (depth 1)
    await useGraphStore.getState().expandNode(person.id, { force: true });

    const state = useGraphStore.getState();
    const newCompany = state.nodeIndex.get(companyId(NEW_CNPJ));
    const otherSocio = state.nodeIndex.get(personId(OUTRO_SOCIO_CPF));
    expect(newCompany?.depth).toBe(2); // pessoa.depth (1) + 1
    expect(otherSocio?.depth).toBe(2); // mesma camada da empresa — não 3
    expect(person.expanded).toBe(true);
  });

  it('relação Empresa→Pessoa da APIFull sobrevive mesmo se a FonteData falhar (não some, sem duplicar depois)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/cpf-ultra')) {
        return apiFullSuccess([
          {
            cnpj: NEW_CNPJ,
            razao_social: 'EMPRESA NOVA LTDA',
            qualificacao_socio_descricao: 'Sócio Administrador',
            documento_socio: PERSON_CPF,
            nome_socio: 'FULANO DE TAL',
          },
        ]);
      }
      if (url.includes(`CNPJ=${NEW_CNPJ}`)) {
        return jsonResponse({ code: 'invalid_parameters', message: 'erro simulado' }, 400);
      }
      return jsonResponse({ message: 'unexpected' }, 404);
    });

    const person = putPersonNode(0);
    await useGraphStore.getState().expandNode(person.id, { force: true });

    const state = useGraphStore.getState();
    const link = state.links.find((l) => {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      return s === person.id;
    });
    expect(link).toBeDefined();
    expect(link?.meta.origem).toBe('APIFull / sociedades');
    expect(link?.type).toBe('ADMINISTRADOR');
    // falha parcial: pessoa continua não-expandida (permite tentar de novo)
    expect(person.expanded).toBe(false);
    expect(state.notice).toMatch(/parcial/i);
  });

  it('não duplica a aresta quando a FonteData confirma a mesma pessoa depois (dedup por par, não por tipo)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/cpf-ultra')) {
        return apiFullSuccess([
          {
            cnpj: NEW_CNPJ,
            qualificacao_socio_descricao: 'Sócio', // mapeia pra SOCIO
            documento_socio: PERSON_CPF,
            nome_socio: 'FULANO DE TAL',
          },
        ]);
      }
      if (url.includes(`CNPJ=${NEW_CNPJ}`)) {
        // FonteData descreve a mesma pessoa com qualificação diferente (mapeia pra ADMINISTRADOR)
        return fonteDataCompany(NEW_CNPJ, [{ nome: 'FULANO DE TAL', cargo: 'Sócio Administrador', documento: PERSON_CPF }]);
      }
      return jsonResponse({ message: 'unexpected' }, 404);
    });

    const person = putPersonNode(0);
    await useGraphStore.getState().expandNode(person.id, { force: true });

    const pair = useGraphStore.getState().links.filter((l) => {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      return s === person.id && t === companyId(NEW_CNPJ);
    });
    expect(pair).toHaveLength(1);
  });

  it('falha parcial: uma empresa com sucesso não é perdida quando outra falha; retry só reprocessa a que falhou', async () => {
    let fonteDataCallsForFailingCnpj = 0;
    let fonteDataCallsForNewCnpj = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/cpf-ultra')) {
        return apiFullSuccess([
          { cnpj: NEW_CNPJ, qualificacao_socio_descricao: 'Sócio', documento_socio: PERSON_CPF, nome_socio: 'FULANO' },
          { cnpj: FAILING_CNPJ, qualificacao_socio_descricao: 'Sócio', documento_socio: PERSON_CPF, nome_socio: 'FULANO' },
        ]);
      }
      if (url.includes(`CNPJ=${NEW_CNPJ}`)) {
        fonteDataCallsForNewCnpj += 1;
        return fonteDataCompany(NEW_CNPJ, [{ nome: 'FULANO', cargo: 'Sócio', documento: PERSON_CPF }]);
      }
      if (url.includes(`CNPJ=${FAILING_CNPJ}`)) {
        fonteDataCallsForFailingCnpj += 1;
        if (fonteDataCallsForFailingCnpj === 1) return jsonResponse({ message: 'erro simulado' }, 500);
        return fonteDataCompany(FAILING_CNPJ, [{ nome: 'FULANO', cargo: 'Sócio', documento: PERSON_CPF }]);
      }
      return jsonResponse({ message: 'unexpected' }, 404);
    });

    const person = putPersonNode(0);
    await useGraphStore.getState().expandNode(person.id, { force: true });

    let state = useGraphStore.getState();
    expect(state.nodeIndex.get(companyId(NEW_CNPJ))?.expanded).toBe(true);
    expect(state.nodeIndex.get(companyId(FAILING_CNPJ))?.expanded).toBe(false);
    expect(person.expanded).toBe(false); // falha parcial — permite retry

    // retry: novo expandNode no mesmo nó (perfil já em cache, não rechama a APIFull)
    await useGraphStore.getState().expandNode(person.id, { force: true });

    state = useGraphStore.getState();
    expect(state.nodeIndex.get(companyId(FAILING_CNPJ))?.expanded).toBe(true);
    expect(person.expanded).toBe(true);
    // sucesso anterior não foi reconsultado; APIFull não foi chamada de novo (cache)
    expect(fonteDataCallsForNewCnpj).toBe(1);
    expect(fonteDataCallsForFailingCnpj).toBe(2);
    const apiFullCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/cpf-ultra')).length;
    expect(apiFullCalls).toBe(1);
  });
});

describe('addOrMergeLink — acumula qualificações de fontes diferentes sem perder nenhuma', () => {
  const EMPRESA = companyId(NEW_CNPJ);
  const PESSOA = personId(PERSON_CPF);

  const apiFullMeta = { funcao: 'Sócio', origem: 'APIFull / sociedades', dataEntrada: '2024-01-01', situacao: 'ATIVO' };
  const fonteDataMeta = {
    funcao: 'Sócio-Administrador',
    origem: 'FonteData',
    dataEntrada: '2024-06-01',
    situacao: 'ATIVA',
  };

  it('1. mesma empresa, pessoa e qualificação: não duplica', () => {
    const links: GraphLink[] = [];
    addOrMergeLink(links, PESSOA, EMPRESA, 'SOCIO', apiFullMeta);
    addOrMergeLink(links, PESSOA, EMPRESA, 'SOCIO', apiFullMeta);

    expect(links).toHaveLength(1); // uma única conexão visual
    expect(links[0].meta.relations).toEqual(['SOCIO']);
    expect(links[0].meta.qualificacoes).toEqual(['Sócio']);
    expect(links[0].meta.origens).toEqual(['APIFull / sociedades']);
  });

  it('2. mesma empresa e pessoa, qualificações diferentes: mescla sem perder nenhuma', () => {
    const links: GraphLink[] = [];
    addOrMergeLink(links, PESSOA, EMPRESA, 'SOCIO', apiFullMeta);
    addOrMergeLink(links, PESSOA, EMPRESA, 'ADMINISTRADOR', fonteDataMeta);

    expect(links).toHaveLength(1); // não cria duas linhas sobrepostas no mapa
    expect(links[0].meta.relations).toEqual(['SOCIO', 'ADMINISTRADOR']);
    expect(links[0].meta.qualificacoes).toEqual(['Sócio', 'Sócio-Administrador']);
  });

  it('3. APIFull respondendo antes da FonteData', () => {
    const links: GraphLink[] = [];
    addOrMergeLink(links, PESSOA, EMPRESA, 'SOCIO', apiFullMeta);
    addOrMergeLink(links, PESSOA, EMPRESA, 'ADMINISTRADOR', fonteDataMeta);

    expect(links).toHaveLength(1);
    expect(links[0].meta.relations).toEqual(['SOCIO', 'ADMINISTRADOR']);
    expect(links[0].meta.qualificacoes).toEqual(['Sócio', 'Sócio-Administrador']);
    expect(links[0].meta.origens).toEqual(['APIFull / sociedades', 'FonteData']);
  });

  it('4. FonteData respondendo antes da APIFull — mesmo resultado final (ordem não importa)', () => {
    const links: GraphLink[] = [];
    addOrMergeLink(links, PESSOA, EMPRESA, 'ADMINISTRADOR', fonteDataMeta);
    addOrMergeLink(links, PESSOA, EMPRESA, 'SOCIO', apiFullMeta);

    expect(links).toHaveLength(1);
    expect(links[0].meta.relations).toEqual(['SOCIO', 'ADMINISTRADOR']);
    expect(links[0].meta.qualificacoes).toEqual(['Sócio', 'Sócio-Administrador']);
    expect(links[0].meta.origens).toEqual(['APIFull / sociedades', 'FonteData']);
  });

  it('5. preserva metadados das duas fontes (origens e datas distintas); campos principais vêm da evidência primária (prioridade fixa, não a que chegou primeiro)', () => {
    const links: GraphLink[] = [];
    addOrMergeLink(links, PESSOA, EMPRESA, 'SOCIO', apiFullMeta);
    addOrMergeLink(links, PESSOA, EMPRESA, 'ADMINISTRADOR', fonteDataMeta);

    const meta = links[0].meta;
    expect(meta.origens).toEqual(['APIFull / sociedades', 'FonteData']);
    expect(meta.datasEntrada).toEqual(['2024-01-01', '2024-06-01']);
    // campos "principais" (compatibilidade) vêm da evidência de maior prioridade (ADMINISTRADOR),
    // não da que chegou primeiro (que foi SOCIO/APIFull) — prioridade fixa, não ordem de chegada.
    expect(meta.origem).toBe('FonteData');
    expect(meta.dataEntrada).toBe('2024-06-01');
    expect(meta.funcao).toBe('Sócio-Administrador');
  });

  it('1. evidências preservam a associação completa entre relação, qualificação, origem e data de cada fonte', () => {
    const links: GraphLink[] = [];
    addOrMergeLink(links, PESSOA, EMPRESA, 'SOCIO', apiFullMeta);
    addOrMergeLink(links, PESSOA, EMPRESA, 'ADMINISTRADOR', fonteDataMeta);

    expect(links[0].meta.evidencias).toEqual([
      expect.objectContaining({
        relation: 'ADMINISTRADOR',
        qualificacao: 'Sócio-Administrador',
        origem: 'FonteData',
        dataEntrada: '2024-06-01',
      }),
      expect.objectContaining({
        relation: 'SOCIO',
        qualificacao: 'Sócio',
        origem: 'APIFull / sociedades',
        dataEntrada: '2024-01-01',
      }),
    ]);
  });

  it('1b. mesma empresa/pessoa/qualificação: não duplica evidência (dedup pela combinação completa)', () => {
    const links: GraphLink[] = [];
    addOrMergeLink(links, PESSOA, EMPRESA, 'SOCIO', apiFullMeta);
    addOrMergeLink(links, PESSOA, EMPRESA, 'SOCIO', apiFullMeta);
    expect(links[0].meta.evidencias).toHaveLength(1);
  });

  it('2. resultado completo (evidencias + todos os campos derivados) não depende da ordem de chegada das APIs', () => {
    const linksA: GraphLink[] = [];
    addOrMergeLink(linksA, PESSOA, EMPRESA, 'SOCIO', apiFullMeta);
    addOrMergeLink(linksA, PESSOA, EMPRESA, 'ADMINISTRADOR', fonteDataMeta);

    const linksB: GraphLink[] = [];
    addOrMergeLink(linksB, PESSOA, EMPRESA, 'ADMINISTRADOR', fonteDataMeta);
    addOrMergeLink(linksB, PESSOA, EMPRESA, 'SOCIO', apiFullMeta);

    expect(linksA[0].meta).toEqual(linksB[0].meta);
  });
});

describe('prefetch automático de perfis via APIFull (fila de segundo plano)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let apiFullCallCount = 0;

  beforeEach(() => {
    resetStores();
    apiFullCallCount = 0;
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function drainProfileQueue() {
    await vi.waitFor(() => {
      const s = usePersonProfileStore.getState();
      if (s.processing || s.queue.length > 0) throw new Error('fila de perfis ainda processando');
    });
  }

  it('4. startSearch dispara prefetch automático dos sócios pessoa física em segundo plano', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/cpf-ultra')) {
        apiFullCallCount += 1;
        return apiFullSuccess([]);
      }
      if (url.includes(`CNPJ=${NEW_CNPJ}`)) {
        return fonteDataCompany(NEW_CNPJ, [
          { nome: 'FULANO DE TAL', cargo: 'Sócio', documento: PERSON_CPF },
          { nome: 'OUTRO SOCIO', cargo: 'Sócio', documento: OUTRO_SOCIO_CPF },
        ]);
      }
      return jsonResponse({ message: 'unexpected' }, 404);
    });

    await useGraphStore.getState().startSearch(NEW_CNPJ);
    await drainProfileQueue();

    expect(usePersonProfileStore.getState().profilesByCpf.has(PERSON_CPF)).toBe(true);
    expect(usePersonProfileStore.getState().profilesByCpf.has(OUTRO_SOCIO_CPF)).toBe(true);
    expect(apiFullCallCount).toBe(2);
  });

  it('10. prefetch nunca altera o grafo — só popula o cache de perfis, nunca adiciona nós/camadas', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/cpf-ultra')) {
        // o perfil pré-carregado já revela uma NOVA empresa em sociedades[] — isso
        // não pode aparecer no grafo antes do usuário clicar '+'.
        return apiFullSuccess([
          {
            cnpj: CNPJ_2,
            razao_social: 'EMPRESA DESCOBERTA SO NO PERFIL',
            qualificacao_socio_descricao: 'Sócio',
            documento_socio: PERSON_CPF,
            nome_socio: 'FULANO DE TAL',
          },
        ]);
      }
      if (url.includes(`CNPJ=${NEW_CNPJ}`)) {
        return fonteDataCompany(NEW_CNPJ, [{ nome: 'FULANO DE TAL', cargo: 'Sócio', documento: PERSON_CPF }]);
      }
      return jsonResponse({ message: 'unexpected' }, 404);
    });

    await useGraphStore.getState().startSearch(NEW_CNPJ);
    const nodesRightAfterSearch = useGraphStore.getState().nodeIndex.size;
    await drainProfileQueue();

    expect(usePersonProfileStore.getState().profilesByCpf.has(PERSON_CPF)).toBe(true);
    // nó da empresa só apareceu no perfil pré-carregado — não pode ter entrado no grafo
    expect(useGraphStore.getState().nodeIndex.has(companyId(CNPJ_2))).toBe(false);
    expect(useGraphStore.getState().nodeIndex.size).toBe(nodesRightAfterSearch);
  });

  it('11. próxima camada reaproveita o perfil já pré-carregado — não rechama a APIFull pro mesmo CPF', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/cpf-ultra')) {
        apiFullCallCount += 1;
        return apiFullSuccess([]); // sem sociedades novas — só testa reaproveitamento do perfil
      }
      if (url.includes(`CNPJ=${NEW_CNPJ}`)) {
        return fonteDataCompany(NEW_CNPJ, [{ nome: 'FULANO DE TAL', cargo: 'Sócio', documento: PERSON_CPF }]);
      }
      return jsonResponse({ message: 'unexpected' }, 404);
    });

    await useGraphStore.getState().startSearch(NEW_CNPJ);
    await drainProfileQueue();
    expect(apiFullCallCount).toBe(1); // prefetch já consultou o único sócio pessoa física

    await useGraphStore.getState().nextLayer(); // avança e expande a pessoa (fronteira)
    expect(apiFullCallCount).toBe(1); // reaproveitou o cache — nenhuma chamada nova
  });

  it('12. sócios de uma empresa recém-mesclada na camada seguinte já são enfileirados automaticamente', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/cpf-ultra')) {
        apiFullCallCount += 1;
        if (apiFullCallCount === 1) {
          // 1ª chamada: perfil do sócio original, que revela uma nova empresa (CNPJ_2)
          return apiFullSuccess([
            {
              cnpj: CNPJ_2,
              razao_social: 'EMPRESA CAMADA 3',
              qualificacao_socio_descricao: 'Sócio',
              documento_socio: PERSON_CPF,
              nome_socio: 'FULANO DE TAL',
            },
          ]);
        }
        return apiFullSuccess([]); // sócio novo da CNPJ_2, sem mais sociedades
      }
      if (url.includes(`CNPJ=${NEW_CNPJ}`)) {
        return fonteDataCompany(NEW_CNPJ, [{ nome: 'FULANO DE TAL', cargo: 'Sócio', documento: PERSON_CPF }]);
      }
      if (url.includes(`CNPJ=${CNPJ_2}`)) {
        return fonteDataCompany(CNPJ_2, [
          { nome: 'FULANO DE TAL', cargo: 'Sócio', documento: PERSON_CPF },
          { nome: 'SOCIO NOVO DA CAMADA 3', cargo: 'Sócio', documento: OUTRO_SOCIO_CPF },
        ]);
      }
      return jsonResponse({ message: 'unexpected' }, 404);
    });

    await useGraphStore.getState().startSearch(NEW_CNPJ);
    await drainProfileQueue(); // prefetch inicial (só PERSON_CPF) esvazia a fila

    await useGraphStore.getState().nextLayer(); // expande a pessoa: descobre CNPJ_2 e mescla seus sócios
    await drainProfileQueue(); // aguarda o prefetch (fire-and-forget) disparado após o merge da nova empresa

    // o novo sócio (OUTRO_SOCIO_CPF) descoberto na empresa CNPJ_2 já deve estar
    // pré-carregado, sem qualquer ação extra do usuário.
    expect(usePersonProfileStore.getState().profilesByCpf.has(OUTRO_SOCIO_CPF)).toBe(true);
  });
});
