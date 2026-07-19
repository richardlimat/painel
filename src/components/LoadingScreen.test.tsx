// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingScreen } from './LoadingScreen';

describe('LoadingScreen', () => {
  afterEach(() => cleanup());

  it('1. mostra "Carregando..." e o indicador de status, sem texto de fase/progresso', () => {
    render(<LoadingScreen />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
    expect(screen.queryByText(/Consultando/)).not.toBeInTheDocument();
  });
});
