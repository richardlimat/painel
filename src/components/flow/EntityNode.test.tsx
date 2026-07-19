// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EntityNode, type EntityNodeData } from './EntityNode';

function baseData(overrides: Partial<EntityNodeData> = {}): EntityNodeData {
  return {
    kind: 'person',
    isPerson: true,
    color: '#123456',
    radius: 30,
    label: 'FULANO DE TAL',
    expanded: false,
    expanding: false,
    highlighted: false,
    ...overrides,
  };
}

function renderNode(data: EntityNodeData) {
  return render(
    <ReactFlowProvider>
      <EntityNode
        id="n1"
        data={data}
        type="entity"
        dragging={false}
        draggable
        zIndex={0}
        selectable
        deletable
        selected={false}
        isConnectable={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    </ReactFlowProvider>,
  );
}

describe('EntityNode — foto na bolinha da pessoa', () => {
  afterEach(() => cleanup());

  it('1. sem photoUrl, mostra o ícone de pessoa (não tenta renderizar <img>)', () => {
    const { container } = renderNode(baseData());
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.rf-circle svg')).toBeInTheDocument();
  });

  it('2. com photoUrl, mostra <img> com object-fit cover em vez do ícone', () => {
    const { container } = renderNode(baseData({ photoUrl: 'https://cdn.example.com/foto.jpg' }));
    const img = container.querySelector('img.rf-avatar') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toBe('https://cdn.example.com/foto.jpg');
  });

  it('3. erro ao carregar a imagem cai explicitamente para o PersonIcon (não só esconde a <img>)', () => {
    const { container } = renderNode(baseData({ photoUrl: 'https://cdn.example.com/quebrada.jpg' }));
    const img = container.querySelector('img.rf-avatar') as HTMLImageElement;
    expect(img).toBeInTheDocument();

    fireEvent.error(img);

    expect(container.querySelector('img.rf-avatar')).toBeNull();
    expect(container.querySelector('.rf-circle svg')).toBeInTheDocument();
  });

  it('4. nó de empresa nunca renderiza foto, mesmo se photoUrl estiver presente por engano', () => {
    const { container } = renderNode(baseData({ isPerson: false, kind: 'company', photoUrl: 'https://cdn.example.com/foto.jpg' }));
    expect(container.querySelector('img')).toBeNull();
  });

  it('5. preserva borda, halo (ring), badge de expansão e handles existentes', () => {
    renderNode(baseData({ photoUrl: 'https://cdn.example.com/foto.jpg', ring: '#0d63e8', expanded: false }));
    expect(screen.getByText('+')).toBeInTheDocument();
  });
});
