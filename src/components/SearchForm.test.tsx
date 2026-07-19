// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listSavedQueriesMock, getSavedQueryMock } = vi.hoisted(() => ({
  listSavedQueriesMock: vi.fn(),
  getSavedQueryMock: vi.fn(),
}));
vi.mock('../services/savedQueries', () => ({
  listSavedQueries: listSavedQueriesMock,
  getSavedQuery: getSavedQueryMock,
}));

import { SearchForm } from './SearchForm';
import { useGraphStore } from '../store/graphStore';

describe('SearchForm — branding e busca de CNPJ', () => {
  beforeEach(() => {
    listSavedQueriesMock.mockReset().mockResolvedValue([]);
    getSavedQueryMock.mockReset();
    useGraphStore.setState({ error: null, searchPhase: 'idle', searchFailedCpfs: [], searchProfilesTotal: 0 });
  });
  afterEach(() => cleanup());

  it('1. mostra o logo, o título e as abas (só CNPJ habilitada)', () => {
    render(<SearchForm />);
    expect(screen.getByAltText('TRIAD3')).toBeInTheDocument();
    expect(screen.getByText('PAINEL DE CONSULTAS')).toBeInTheDocument();
    expect(screen.getByText('CNPJ')).toBeInTheDocument();
    expect(screen.getByText('Consulta Avançada')).toBeInTheDocument();
    expect(screen.getByText('SMS')).toBeInTheDocument();
  });

  it('2. rejeita CNPJ com dígitos verificadores inválidos sem chamar startSearch', () => {
    const startSearch = vi.fn();
    useGraphStore.setState({ startSearch });
    render(<SearchForm />);
    fireEvent.change(screen.getByPlaceholderText('00.000.000/0000-00'), { target: { value: '11.111.111/1111-11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(screen.getByText(/CNPJ inválido/)).toBeInTheDocument();
    expect(startSearch).not.toHaveBeenCalled();
  });

  it('3. CNPJ válido chama startSearch com os 14 dígitos', () => {
    const startSearch = vi.fn();
    useGraphStore.setState({ startSearch });
    render(<SearchForm />);
    fireEvent.change(screen.getByPlaceholderText('00.000.000/0000-00'), { target: { value: '33.260.563/0001-78' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(startSearch).toHaveBeenCalledWith('33260563000178');
  });
});

describe('SearchForm — Consultas recentes', () => {
  beforeEach(() => {
    listSavedQueriesMock.mockReset();
    getSavedQueryMock.mockReset();
    useGraphStore.setState({ error: null, searchPhase: 'idle', searchFailedCpfs: [], searchProfilesTotal: 0 });
  });
  afterEach(() => cleanup());

  it('1. lista as consultas recentes com o nome mascarado por padrão', async () => {
    listSavedQueriesMock.mockResolvedValue([
      { id: 'q1', titulo: 'Grupo Confidencial X', cnpj_raiz: '11222333000181', created_at: '2026-01-01', updated_at: '' },
    ]);
    render(<SearchForm />);
    await screen.findByText(/••/);
    expect(screen.queryByText('Grupo Confidencial X')).not.toBeInTheDocument();
  });

  it('2. botão "Ocultas" revela os nomes ao clicar', async () => {
    listSavedQueriesMock.mockResolvedValue([
      { id: 'q1', titulo: 'Grupo Confidencial X', cnpj_raiz: '11222333000181', created_at: '2026-01-01', updated_at: '' },
    ]);
    render(<SearchForm />);
    await screen.findByText(/••/);
    fireEvent.click(screen.getByRole('button', { name: /Ocultas/ }));
    expect(screen.getByText('Grupo Confidencial X')).toBeInTheDocument();
  });

  it('3. lista vazia mostra "Nenhuma consulta recente."', async () => {
    listSavedQueriesMock.mockResolvedValue([]);
    render(<SearchForm />);
    expect(await screen.findByText('Nenhuma consulta recente.')).toBeInTheDocument();
  });

  it('4. clicar numa consulta recente abre e hidrata o grafo (sem chamar as APIs)', async () => {
    listSavedQueriesMock.mockResolvedValue([
      { id: 'q1', titulo: 'Grupo X', cnpj_raiz: '11222333000181', created_at: '2026-01-01', updated_at: '' },
    ]);
    const snapshot = {
      rootId: 'c:1',
      nodes: [],
      links: [],
      currentLayer: 1,
      maxDepth: 5,
      filters: useGraphStore.getState().filters,
      profiles: {},
    };
    getSavedQueryMock.mockResolvedValue({ id: 'q1', titulo: 'Grupo X', cnpjRaiz: '11222333000181', snapshot, photoUrlsByPersonId: {} });

    render(<SearchForm />);
    await screen.findByText(/••/);
    fireEvent.click(screen.getByRole('button', { name: /••/ }));

    await vi.waitFor(() => expect(useGraphStore.getState().rootId).toBe('c:1'));
    expect(getSavedQueryMock).toHaveBeenCalledWith('q1');
  });

  it('5. "Ver todas as consultas salvas" chama onOpenSavedQueries', async () => {
    listSavedQueriesMock.mockResolvedValue([]);
    const onOpenSavedQueries = vi.fn();
    render(<SearchForm onOpenSavedQueries={onOpenSavedQueries} />);
    fireEvent.click(await screen.findByText('Ver todas as consultas salvas'));
    expect(onOpenSavedQueries).toHaveBeenCalledTimes(1);
  });
});
