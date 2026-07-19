// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FiltersSidebar } from './FiltersSidebar';

describe('FiltersSidebar', () => {
  afterEach(() => cleanup());

  it('1. não mostra mais "Participação mínima" nem "Profundidade"', () => {
    render(<FiltersSidebar open />);
    expect(screen.queryByText('Participação mínima')).not.toBeInTheDocument();
    expect(screen.queryByText('Profundidade')).not.toBeInTheDocument();
  });

  it('2. mantém os demais filtros (Estado, CNAE, Abertas após, Legenda)', () => {
    render(<FiltersSidebar open />);
    expect(screen.getByText('Estado (UF)')).toBeInTheDocument();
    expect(screen.getByText('CNAE Principal')).toBeInTheDocument();
    expect(screen.getByText('Abertas após')).toBeInTheDocument();
    expect(screen.getByText('Legenda')).toBeInTheDocument();
  });
});
