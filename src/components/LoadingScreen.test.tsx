// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingScreen } from './LoadingScreen';
import { useGraphStore } from '../store/graphStore';

describe('LoadingScreen', () => {
  afterEach(() => cleanup());

  it('1. sempre mostra "Carregando..."', () => {
    useGraphStore.setState({ searchPhase: 'company' });
    render(<LoadingScreen />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('2. mostra subtítulo específico por fase', () => {
    useGraphStore.setState({ searchPhase: 'company-found' });
    render(<LoadingScreen />);
    expect(screen.getByText('Empresa encontrada…')).toBeInTheDocument();
  });

  it('3. mostra progresso "X de N" durante a fase de perfis', () => {
    useGraphStore.setState({ searchPhase: 'profiles', searchProfilesTotal: 5, searchProfilesDone: 2 });
    render(<LoadingScreen />);
    expect(screen.getByText('Consultando perfis: 2 de 5')).toBeInTheDocument();
  });

  it('4. sem fase reconhecida, mostra uma mensagem genérica', () => {
    useGraphStore.setState({ searchPhase: 'idle', searchProfilesTotal: 0, searchProfilesDone: 0 });
    render(<LoadingScreen />);
    expect(screen.getByText('Só um instante…')).toBeInTheDocument();
  });
});
