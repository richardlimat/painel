// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createSavedQueryMock } = vi.hoisted(() => ({ createSavedQueryMock: vi.fn() }));
vi.mock('../../services/savedQueries', () => ({ createSavedQuery: createSavedQueryMock }));

import { SaveQueryButton } from './SaveQueryButton';
import { useGraphStore, companyId, personId } from '../../store/graphStore';
import type { GraphNode } from '../../types/graph';

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
  });
}

describe('SaveQueryButton', () => {
  beforeEach(() => {
    createSavedQueryMock.mockReset();
    seedGraph();
  });
  afterEach(() => cleanup());

  it('1. não renderiza nada sem pesquisa aberta (sem rootId)', () => {
    useGraphStore.setState({ rootId: null });
    const { container } = render(<SaveQueryButton />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('2. clicar em Salvar consulta abre o formulário de título e confirmar chama createSavedQuery', async () => {
    createSavedQueryMock.mockResolvedValue({ id: 'q1', imagesFailed: 0 });
    render(<SaveQueryButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar consulta' }));
    fireEvent.change(screen.getByPlaceholderText('Ex.: Grupo XYZ'), { target: { value: 'Meu título' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await vi.waitFor(() => expect(createSavedQueryMock).toHaveBeenCalledTimes(1));
    const payload = createSavedQueryMock.mock.calls[0][0];
    expect(payload.titulo).toBe('Meu título');
    expect(payload.cnpjRaiz).toBe(CNPJ);
    expect(payload.snapshot.rootId).toBe(companyId(CNPJ));
    expect(payload.images).toEqual(
      expect.arrayContaining([expect.objectContaining({ personId: personId(CPF), sourceUrl: 'https://cdn.example.com/foto.jpg' })]),
    );
  });

  it('3. upload só acontece ao confirmar salvar — nenhuma chamada antes do clique', () => {
    render(<SaveQueryButton />);
    expect(createSavedQueryMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar consulta' }));
    expect(createSavedQueryMock).not.toHaveBeenCalled();
  });

  it('4. avisa quando alguma imagem falha ao salvar (aviso parcial)', async () => {
    createSavedQueryMock.mockResolvedValue({ id: 'q1', imagesFailed: 2 });
    render(<SaveQueryButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar consulta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await vi.waitFor(() => {
      expect(useGraphStore.getState().notice).toMatch(/2 imagem/);
    });
  });
});
