// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createSavedQueryMock } = vi.hoisted(() => ({ createSavedQueryMock: vi.fn() }));
vi.mock('../services/savedQueries', () => ({ createSavedQuery: createSavedQueryMock }));

import { saveCurrentQuery } from './saveQueryAction';
import { useGraphStore, companyId, personId } from '../store/graphStore';
import type { GraphNode } from '../types/graph';

const CNPJ = '11222333000181';
const CPF = '11144477735';

function seedGraph() {
  const companyNode: GraphNode = {
    id: companyId(CNPJ),
    kind: 'company',
    label: 'EMPRESA X',
    depth: 0,
    expanded: true,
    company: { cnpj: CNPJ, razaoSocial: 'EMPRESA X', situacao: 'ATIVA' },
  };
  const personNode: GraphNode = {
    id: personId(CPF),
    kind: 'person',
    label: 'FULANO',
    depth: 1,
    expanded: false,
    person: { cpf: CPF, nome: 'FULANO', photoUrl: 'https://cdn.example.com/foto.jpg' },
  };
  const nodeIndex = new Map<string, GraphNode>([[companyNode.id, companyNode], [personNode.id, personNode]]);
  useGraphStore.setState({
    rootId: companyNode.id,
    nodes: [companyNode, personNode],
    links: [],
    nodeIndex,
    currentLayer: 1,
    unsavedChanges: true,
  });
}

describe('saveCurrentQuery', () => {
  beforeEach(() => {
    createSavedQueryMock.mockReset();
    seedGraph();
  });
  afterEach(() => {
    useGraphStore.setState({ rootId: null, unsavedChanges: false });
  });

  it('1. lança erro sem pesquisa aberta (sem rootId)', async () => {
    useGraphStore.setState({ rootId: null });
    await expect(saveCurrentQuery()).rejects.toThrow('Não há consulta aberta para salvar.');
    expect(createSavedQueryMock).not.toHaveBeenCalled();
  });

  it('2. monta o payload (snapshot + imagens + cnpjRaiz) e chama createSavedQuery', async () => {
    createSavedQueryMock.mockResolvedValue({ id: 'q1', imagesFailed: 0 });
    const result = await saveCurrentQuery('Meu título');
    expect(result).toEqual({ id: 'q1', imagesFailed: 0 });
    const payload = createSavedQueryMock.mock.calls[0][0];
    expect(payload.titulo).toBe('Meu título');
    expect(payload.cnpjRaiz).toBe(CNPJ);
    expect(payload.snapshot.rootId).toBe(companyId(CNPJ));
    expect(payload.images).toEqual(
      expect.arrayContaining([expect.objectContaining({ personId: personId(CPF), sourceUrl: 'https://cdn.example.com/foto.jpg' })]),
    );
  });

  it('3. marca a consulta como salva (unsavedChanges=false) após sucesso', async () => {
    createSavedQueryMock.mockResolvedValue({ id: 'q1', imagesFailed: 0 });
    expect(useGraphStore.getState().unsavedChanges).toBe(true);
    await saveCurrentQuery();
    expect(useGraphStore.getState().unsavedChanges).toBe(false);
  });

  it('4. não marca como salvo se a chamada falhar', async () => {
    createSavedQueryMock.mockRejectedValue(new Error('falhou'));
    await expect(saveCurrentQuery()).rejects.toThrow('falhou');
    expect(useGraphStore.getState().unsavedChanges).toBe(true);
  });

  it('5. quando a raiz é uma pessoa (Consulta Avançada por CPF), cnpjRaiz cai para o CPF da raiz', async () => {
    createSavedQueryMock.mockResolvedValue({ id: 'q2', imagesFailed: 0 });
    useGraphStore.setState({ rootId: personId(CPF) });
    await saveCurrentQuery();
    const payload = createSavedQueryMock.mock.calls[0][0];
    expect(payload.cnpjRaiz).toBe(CPF);
    expect(payload.snapshot.rootId).toBe(personId(CPF));
  });
});
