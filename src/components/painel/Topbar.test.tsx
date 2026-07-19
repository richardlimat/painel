// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createSavedQueryMock } = vi.hoisted(() => ({ createSavedQueryMock: vi.fn() }));
vi.mock('../../services/savedQueries', () => ({ createSavedQuery: createSavedQueryMock }));

import { Topbar } from './Topbar';
import { useGraphStore, companyId, personId } from '../../store/graphStore';
import type { GraphNode } from '../../types/graph';

const CNPJ = '11222333000181';
const CPF = '11144477735';

function seedGraph(unsavedChanges: boolean) {
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
    person: { cpf: CPF, nome: 'FULANO' },
  };
  const nodeIndex = new Map<string, GraphNode>([[companyNode.id, companyNode], [personNode.id, personNode]]);
  useGraphStore.setState({
    rootId: companyNode.id,
    nodes: [companyNode, personNode],
    links: [],
    nodeIndex,
    currentLayer: 1,
    unsavedChanges,
  });
}

function renderTopbar(onNavigateToSearch = vi.fn(), onNavigateToSaved = vi.fn()) {
  return render(
    <Topbar
      workspaceRef={{ current: null }}
      onToggleFilters={() => {}}
      onNavigateToSearch={onNavigateToSearch}
      onNavigateToSaved={onNavigateToSaved}
    />,
  );
}

describe('Topbar', () => {
  beforeEach(() => {
    createSavedQueryMock.mockReset();
  });
  afterEach(() => cleanup());

  it('1. não mostra mais "Expandir Tudo", "Estatísticas" nem o menu de usuário/"Sair"', () => {
    seedGraph(false);
    renderTopbar();
    expect(screen.queryByText('Expandir Tudo')).not.toBeInTheDocument();
    expect(screen.queryByText('Estatísticas')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
  });

  it('2. mostra o botão "Voltar" no canto (primeiro elemento da barra)', () => {
    seedGraph(false);
    renderTopbar();
    expect(screen.getByRole('button', { name: /Voltar/ })).toBeInTheDocument();
  });

  it('3. sem alterações não salvas, "Voltar" navega direto, sem abrir o modal', () => {
    seedGraph(false);
    const onNavigateToSearch = vi.fn();
    renderTopbar(onNavigateToSearch);
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
    expect(onNavigateToSearch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Sair sem salvar?')).not.toBeInTheDocument();
  });

  it('4. com alterações não salvas, "Voltar" abre o modal em vez de navegar direto', () => {
    seedGraph(true);
    const onNavigateToSearch = vi.fn();
    renderTopbar(onNavigateToSearch);
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
    expect(onNavigateToSearch).not.toHaveBeenCalled();
    expect(screen.getByText('Sair sem salvar?')).toBeInTheDocument();
  });

  it('5. "Cancelar" fecha o modal sem navegar', () => {
    seedGraph(true);
    const onNavigateToSearch = vi.fn();
    renderTopbar(onNavigateToSearch);
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText('Sair sem salvar?')).not.toBeInTheDocument();
    expect(onNavigateToSearch).not.toHaveBeenCalled();
  });

  it('6. "Sair sem salvar" navega sem chamar a API de salvar', () => {
    seedGraph(true);
    const onNavigateToSearch = vi.fn();
    renderTopbar(onNavigateToSearch);
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sair sem salvar' }));
    expect(onNavigateToSearch).toHaveBeenCalledTimes(1);
    expect(createSavedQueryMock).not.toHaveBeenCalled();
  });

  it('7. "Salvar e sair" salva a consulta e só então navega', async () => {
    seedGraph(true);
    createSavedQueryMock.mockResolvedValue({ id: 'q1', imagesFailed: 0 });
    const onNavigateToSearch = vi.fn();
    renderTopbar(onNavigateToSearch);
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e sair' }));
    await vi.waitFor(() => expect(onNavigateToSearch).toHaveBeenCalledTimes(1));
    expect(createSavedQueryMock).toHaveBeenCalledTimes(1);
  });

  it('8. "Consultas salvas" com alterações não salvas também passa pelo modal', () => {
    seedGraph(true);
    const onNavigateToSaved = vi.fn();
    renderTopbar(vi.fn(), onNavigateToSaved);
    fireEvent.click(screen.getByRole('button', { name: 'Consultas salvas' }));
    expect(onNavigateToSaved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sair sem salvar' }));
    expect(onNavigateToSaved).toHaveBeenCalledTimes(1);
  });
});
