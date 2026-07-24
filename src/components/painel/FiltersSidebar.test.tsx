// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FiltersSidebar } from './FiltersSidebar';
import { useGraphStore, companyId } from '../../store/graphStore';
import type { GraphNode } from '../../types/graph';

function seedNodesWithCnae() {
  const nodes: GraphNode[] = [
    {
      id: companyId('11222333000181'),
      kind: 'company',
      label: 'EMPRESA A',
      depth: 0,
      expanded: true,
      company: {
        cnpj: '11222333000181',
        razaoSocial: 'EMPRESA A',
        situacao: 'ATIVA',
        cnaePrincipal: { codigo: '6201-5/01', descricao: 'Desenvolvimento de programas de computador sob encomenda' },
      },
    },
    {
      id: companyId('44556677000199'),
      kind: 'company',
      label: 'EMPRESA B',
      depth: 0,
      expanded: true,
      company: {
        cnpj: '44556677000199',
        razaoSocial: 'EMPRESA B',
        situacao: 'ATIVA',
        cnaePrincipal: { codigo: '4711-3/02', descricao: 'Comércio varejista de mercadorias em geral' },
      },
    },
  ];
  useGraphStore.setState({ nodes, nodeIndex: new Map(nodes.map((n) => [n.id, n])) });
}

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

  it('6. o botão "Recolher filtros" (dentro do quadro) dispara onCollapse', () => {
    const onCollapse = vi.fn();
    render(<FiltersSidebar open onCollapse={onCollapse} />);
    fireEvent.click(screen.getByLabelText('Recolher filtros'));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  describe('busca de CNAE digitável', () => {
    beforeEach(() => {
      seedNodesWithCnae();
      useGraphStore.setState({ filters: { ...useGraphStore.getState().filters, cnae: '' } });
    });

    it('3. digitar filtra os CNAEs por código ou descrição', () => {
      render(<FiltersSidebar open />);
      const input = screen.getByLabelText('Buscar CNAE');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'varejista' } });
      expect(screen.getByText(/Comércio varejista/)).toBeInTheDocument();
      expect(screen.queryByText(/Desenvolvimento de programas/)).not.toBeInTheDocument();
    });

    it('4. selecionar um resultado aplica o filtro (filters.cnae)', () => {
      render(<FiltersSidebar open />);
      const input = screen.getByLabelText('Buscar CNAE');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '6201' } });
      fireEvent.mouseDown(screen.getByText(/Desenvolvimento de programas/));
      expect(useGraphStore.getState().filters.cnae).toBe('6201-5/01');
    });

    it('5. botão de limpar reseta o filtro', () => {
      useGraphStore.setState({ filters: { ...useGraphStore.getState().filters, cnae: '6201-5/01' } });
      render(<FiltersSidebar open />);
      fireEvent.click(screen.getByLabelText('Limpar filtro de CNAE'));
      expect(useGraphStore.getState().filters.cnae).toBe('');
    });
  });
});
