// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { useGraphStore } from './store/graphStore';
import { useAuthStore } from './store/authStore';

describe('App — tela cheia de "Carregando..." durante a busca de CNPJ', () => {
  beforeEach(() => {
    // Sessão já resolvida e estável — o foco do teste é a troca entre
    // SearchForm e LoadingScreen, não o fluxo de autenticação em si.
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'u1', nome: 'Fulano', email: 'a@b.com' },
      checkSession: async () => {},
    });
    useGraphStore.setState({
      rootId: null,
      loading: false,
      searchPhase: 'idle',
      searchProfilesTotal: 0,
      searchProfilesDone: 0,
    });
  });

  afterEach(() => cleanup());

  it('1. loading=true mostra a tela cheia "Carregando..." em vez do formulário de busca', () => {
    useGraphStore.setState({ loading: true, searchPhase: 'company' });
    render(<App />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
    expect(screen.queryByText('Mapear estrutura societária')).not.toBeInTheDocument();
  });

  it('2. loading=false mostra o formulário de busca, sem a tela de carregando', () => {
    render(<App />);
    expect(screen.getByText('Mapear estrutura societária')).toBeInTheDocument();
    expect(screen.queryByText('Carregando...')).not.toBeInTheDocument();
  });

  it('3. durante o carregamento, mostra o progresso da fase atual (ex.: perfis)', () => {
    useGraphStore.setState({ loading: true, searchPhase: 'profiles', searchProfilesTotal: 3, searchProfilesDone: 1 });
    render(<App />);
    expect(screen.getByText('Consultando perfis: 1 de 3')).toBeInTheDocument();
  });

  it('4. falha parcial (awaiting-decision, loading já false) some com a tela cheia e mostra a decisão no formulário', () => {
    useGraphStore.setState({
      loading: false,
      searchPhase: 'awaiting-decision',
      searchProfilesTotal: 2,
      searchFailedCpfs: ['11144477735'],
    });
    render(<App />);
    expect(screen.queryByText('Carregando...')).not.toBeInTheDocument();
    expect(screen.getByText(/perfil\(is\) não puderam ser carregados/)).toBeInTheDocument();
  });
});
