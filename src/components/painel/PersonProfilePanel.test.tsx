// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PersonProfilePanel } from './PersonProfilePanel';
import { DetailsPanel } from './DetailsPanel';
import { usePersonProfileStore } from '../../store/personProfileStore';
import { useGraphStore, companyId, personId } from '../../store/graphStore';
import type { ApiFullProfile } from '../../services/apifull';
import type { GraphNode } from '../../types/graph';

const PERSON_CPF = '11144477735';
const RAW_SECRET = 'segredo-super-confidencial';
const RAW_BASE64_DOC = 'A'.repeat(2500); // > 2000 chars — sempre tratado como documento, nunca texto cru

function makeBase64Doc(magicBytes: number[], totalLength = 300): string {
  const bytes = new Uint8Array(totalLength);
  magicBytes.forEach((b, i) => {
    bytes[i] = b;
  });
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const RAW_BASE64_IMAGE = makeBase64Doc([0x89, 0x50, 0x4e, 0x47]); // magic bytes PNG
const RAW_BASE64_PDF = makeBase64Doc([0x25, 0x50, 0x44, 0x46]); // magic bytes PDF
const IMAGE_URL = 'https://cdn.example.com/foto-pessoa.jpg';

const PROFILE: ApiFullProfile = {
  SERVICE_RESPONSE: {
    cadastral: { nome: 'FULANO DE TAL', dataNascimento: '1990-05-10' },
    parentes: [
      { nome: 'MAE DE FULANO', cpfParente: '52998224725' },
      { nome: 'PAI DE FULANO', cpfParente: '39053344705' },
    ],
    sociedades: [],
    credenciaisVazadas: [{ senha: RAW_SECRET, origem: 'vazamento X' }],
    docsBase64: RAW_BASE64_DOC,
    linhaDoTempo: [{ descricao: '<b>Entrada</b> na empresa <script>alert(1)</script>' }],
    campoNovoDesconhecido: { valor: 'valorunico12345' },
    fotoUrl: IMAGE_URL,
    fotoImagemBase64: RAW_BASE64_IMAGE,
    documentoPdfBase64: RAW_BASE64_PDF,
    linkInseguro: 'javascript:alert(1)',
  },
};

const PERSON_NODE: GraphNode = {
  id: personId(PERSON_CPF),
  kind: 'person',
  label: 'FULANO DE TAL',
  depth: 0,
  expanded: false,
  person: { cpf: PERSON_CPF, nome: 'FULANO DE TAL' },
};

function seedProfileCache() {
  usePersonProfileStore.setState({
    profilesByCpf: new Map([[PERSON_CPF, PROFILE]]),
    requestsByCpf: new Map(),
    errorsByCpf: new Map(),
    sociedadesStatusByCpf: new Map(),
    queue: [],
    processing: false,
    queueTotal: 0,
    queueDone: 0,
    queueFailed: 0,
  });
}

function openSection(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('PersonProfilePanel — Etapa 2 (categorias, busca, formatação segura)', () => {
  beforeEach(() => {
    seedProfileCache();
  });

  afterEach(() => {
    cleanup();
  });

  it('15. busca filtra pra só as seções com resultado e as abre automaticamente', () => {
    render(<PersonProfilePanel node={PERSON_NODE} />);

    // sem busca: nada de "Segurança digital e vazamentos" visível como conteúdo (seção fechada por padrão)
    expect(screen.queryByText('vazamento X')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Buscar nas informações da pessoa'), {
      target: { value: 'parentes' },
    });

    // categoria/chave com resultado aparecem abertas automaticamente, sem clique
    expect(screen.getByText('MAE DE FULANO')).toBeInTheDocument();
    expect(screen.getByText('PAI DE FULANO')).toBeInTheDocument();
    // categorias sem nenhum resultado pra "parentes" somem da lista
    expect(screen.queryByText('Segurança digital e vazamentos')).not.toBeInTheDocument();
    expect(screen.queryByText('Educação')).not.toBeInTheDocument();
  });

  it('16. chave desconhecida/nova cai em "Outros dados" — nenhuma chave é descartada', () => {
    render(<PersonProfilePanel node={PERSON_NODE} />);
    openSection(/Outros dados/);
    openSection(/campoNovoDesconhecido/);
    expect(screen.getByText('valorunico12345')).toBeInTheDocument();
  });

  it('17. contadores batem com a quantidade de registros', () => {
    render(<PersonProfilePanel node={PERSON_NODE} />);
    const categoryBtn = screen.getByRole('button', { name: /Familiares e relacionados/ });
    expect(categoryBtn).toHaveTextContent('2'); // 2 parentes
    fireEvent.click(categoryBtn);
    const keyBtn = screen.getByRole('button', { name: /parentes/ });
    expect(keyBtn).toHaveTextContent('2');
  });

  it('18. categoria sem nenhuma chave associada mostra "Nenhum registro encontrado"', () => {
    render(<PersonProfilePanel node={PERSON_NODE} />);
    openSection(/Educação/); // fixture não tem nenhum campo de educação
    expect(screen.getByText('Nenhum registro encontrado')).toBeInTheDocument();
  });

  it('19. HTML nunca é executado — tags aparecem removidas, nenhum <script>/<b> real no DOM', () => {
    const { container } = render(<PersonProfilePanel node={PERSON_NODE} />);
    openSection(/Histórico e linha do tempo/);
    openSection(/linhaDoTempo/);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(
      screen.getByText(
        (_, el) => el?.className === 'profile-row-value' && el.textContent === 'Entrada na empresa alert(1)',
      ),
    ).toBeInTheDocument();
  });

  it('20. Base64/documento grande nunca aparece como texto cru — só "Documento disponível"', () => {
    const { container } = render(<PersonProfilePanel node={PERSON_NODE} />);
    openSection(/Documentos/);
    openSection(/docsBase64/);
    expect(screen.getByText(/Documento disponível/)).toBeInTheDocument();
    expect(container.textContent).not.toContain(RAW_BASE64_DOC.slice(0, 200));
  });

  it('21. campo "hard" (senha) nunca revela o valor — sem botão de revelar, sem o valor cru no DOM', () => {
    const { container } = render(<PersonProfilePanel node={PERSON_NODE} />);
    openSection(/Segurança digital e vazamentos/);
    openSection(/credenciaisVazadas/);
    expect(container.textContent).not.toContain(RAW_SECRET);
    expect(screen.queryByText('Revelar')).not.toBeInTheDocument();
  });

  it('24. URL de imagem vira miniatura clicável e abre no lightbox ao clicar (nunca texto cru)', () => {
    const { container } = render(<PersonProfilePanel node={PERSON_NODE} />);
    openSection(/Fotos e documentos/);
    openSection(/fotoUrl/);

    expect(screen.queryByText(IMAGE_URL)).not.toBeInTheDocument();
    const thumb = screen.getByRole('button', { name: /Ampliar imagem/ });
    const img = thumb.querySelector('img') as HTMLImageElement;
    expect(img.src).toBe(IMAGE_URL);
    expect(container.querySelector('.image-lightbox-overlay')).toBeNull();

    fireEvent.click(thumb);
    const lightboxImg = container.querySelector('.image-lightbox-overlay img');
    expect(lightboxImg).toHaveAttribute('src', IMAGE_URL);
  });

  it('25. esquema inseguro (javascript:) nunca vira src de <img> nem miniatura — só texto', () => {
    render(<PersonProfilePanel node={PERSON_NODE} />);
    openSection(/Outros dados/);
    openSection(/linkInseguro/);
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ampliar imagem/ })).not.toBeInTheDocument();
  });

  it('26. Base64 de imagem abre no lightbox ao clicar em "Visualizar" (não em nova aba)', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = render(<PersonProfilePanel node={PERSON_NODE} />);
    openSection(/Fotos e documentos/);
    openSection(/fotoImagemBase64/);

    fireEvent.click(screen.getByRole('button', { name: 'Visualizar' }));

    expect(openSpy).not.toHaveBeenCalled();
    expect(container.querySelector('.image-lightbox-overlay img')).toBeInTheDocument();
    openSpy.mockRestore();
  });

  it('27. Base64 de PDF mantém abertura em nova aba (não vira lightbox)', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = render(<PersonProfilePanel node={PERSON_NODE} />);
    openSection(/Documentos/);
    openSection(/documentoPdfBase64/);

    fireEvent.click(screen.getByRole('button', { name: 'Visualizar' }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.image-lightbox-overlay')).toBeNull();
    openSpy.mockRestore();
  });

  it('28. nenhuma string Base64 aparece como texto cru em nenhum ponto do DOM (imagem ou PDF)', () => {
    const { container } = render(<PersonProfilePanel node={PERSON_NODE} />);
    openSection(/Fotos e documentos/);
    openSection(/fotoImagemBase64/);
    expect(container.textContent).not.toContain(RAW_BASE64_IMAGE.slice(0, 100));
  });
});

describe('DetailsPanel — painel de empresa não é afetado pela integração de pessoa', () => {
  beforeEach(() => {
    seedProfileCache();
    useGraphStore.setState(() => {
      const node: GraphNode = {
        id: companyId('11222333000181'),
        kind: 'company',
        label: 'EMPRESA TESTE LTDA',
        depth: 0,
        expanded: true,
        company: { cnpj: '11222333000181', razaoSocial: 'EMPRESA TESTE LTDA', situacao: 'ATIVA' },
      };
      const nodeIndex = new Map([[node.id, node]]);
      return {
        nodeIndex,
        nodes: [node],
        links: [],
        timeline: [],
        selectedNodeId: node.id,
        panelMode: 'entity',
        expandingIds: new Set<string>(),
        breadcrumb: [node.id],
      };
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('23. nó de empresa renderiza normalmente, sem nenhum conteúdo do painel de pessoa', () => {
    render(<DetailsPanel open onClose={() => {}} />);
    expect(screen.getByText('EMPRESA TESTE LTDA')).toBeInTheDocument();
    expect(screen.queryByText('Perfil completo')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Buscar nas informações da pessoa')).not.toBeInTheDocument();
  });
});
