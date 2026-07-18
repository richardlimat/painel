// @vitest-environment jsdom
// graphStore.ts lê `document`/`localStorage` no topo do módulo (tema) — precisa de DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphNode } from '../types/graph';
import { companyId, personId, useGraphStore } from './graphStore';
import { usePersonProfileStore } from './personProfileStore';
import { FonteDataProvider } from '../services/fontedata';

// Fixtures sintéticas conhecidas (não são documentos/empresas reais).
const PERSON_CPF = '11144477735';
const OUTRO_SOCIO_CPF = '52998224725';
const NEW_CNPJ = '11222333000181';
const FAILING_CNPJ = '44556677000186';

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
