// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listSavedQueriesMock, getSavedQueryMock, deleteSavedQueryMock } = vi.hoisted(() => ({
  listSavedQueriesMock: vi.fn(),
  getSavedQueryMock: vi.fn(),
  deleteSavedQueryMock: vi.fn(),
}));
vi.mock('../services/savedQueries', () => ({
  listSavedQueries: listSavedQueriesMock,
  getSavedQuery: getSavedQueryMock,
  deleteSavedQuery: deleteSavedQueryMock,
}));

import { SavedQueriesList } from './SavedQueriesList';
import { useGraphStore } from '../store/graphStore';

describe('SavedQueriesList', () => {
  beforeEach(() => {
    listSavedQueriesMock.mockReset();
    getSavedQueryMock.mockReset();
    deleteSavedQueryMock.mockReset();
  });
  afterEach(() => cleanup());

  it('1. lista as consultas salvas do usuário', async () => {
    listSavedQueriesMock.mockResolvedValue([
      { id: 'q1', titulo: 'Grupo X', cnpj_raiz: '11222333000181', created_at: '', updated_at: '' },
    ]);
    render(<SavedQueriesList onBack={() => {}} />);
    expect(await screen.findByText('Grupo X')).toBeInTheDocument();
  });

  it('2. abrir uma consulta chama getSavedQuery e hidrata o graphStore (hydrateFromSnapshot)', async () => {
    listSavedQueriesMock.mockResolvedValue([
      { id: 'q1', titulo: 'Grupo X', cnpj_raiz: '11222333000181', created_at: '', updated_at: '' },
    ]);
    const snapshot = { rootId: 'c:1', nodes: [], links: [], currentLayer: 1, maxDepth: 5, filters: useGraphStore.getState().filters, profiles: {} };
    getSavedQueryMock.mockResolvedValue({ id: 'q1', titulo: 'Grupo X', cnpjRaiz: '11222333000181', snapshot, photoUrlsByPersonId: {} });

    render(<SavedQueriesList onBack={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir' }));

    await vi.waitFor(() => {
      expect(useGraphStore.getState().rootId).toBe('c:1');
    });
  });

  it('3. excluir pede confirmação e, ao confirmar, chama deleteSavedQuery e remove da lista', async () => {
    listSavedQueriesMock.mockResolvedValue([
      { id: 'q1', titulo: 'Grupo X', cnpj_raiz: '11222333000181', created_at: '', updated_at: '' },
    ]);
    deleteSavedQueryMock.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<SavedQueriesList onBack={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));

    await vi.waitFor(() => expect(deleteSavedQueryMock).toHaveBeenCalledWith('q1'));
    await vi.waitFor(() => expect(screen.queryByText('Grupo X')).not.toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it('4. excluir sem confirmar não chama deleteSavedQuery', async () => {
    listSavedQueriesMock.mockResolvedValue([
      { id: 'q1', titulo: 'Grupo X', cnpj_raiz: '11222333000181', created_at: '', updated_at: '' },
    ]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<SavedQueriesList onBack={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));

    expect(deleteSavedQueryMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
