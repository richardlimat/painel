// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FullScreenProfile } from './FullScreenProfile';
import { DetailsPanel } from './DetailsPanel';
import { usePersonProfileStore } from '../../store/personProfileStore';
import { useGraphStore, companyId, personId } from '../../store/graphStore';
import type { ApiFullProfile } from '../../services/apifull';
import type { GraphNode } from '../../types/graph';

const PERSON_CPF = '11144477735';
const RAW_SECRET = 'segredo-super-confidencial';
const RAW_BASE64_DOC = 'A'.repeat(2500); // > 2000 chars — sempre tratado como documento, nunca texto cru

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

const COMPANY_NODE: GraphNode = {
  id: companyId('11222333000181'),
  kind: 'company',
  label: 'EMPRESA TESTE LTDA',
  depth: 0,
  expanded: true,
  company: {
    cnpj: '11222333000181',
    razaoSocial: 'EMPRESA TESTE LTDA',
    situacao: 'ATIVA',
    endereco: 'RUA DAS FLORES, 123',
    telefone: '1140028922',
    capitalSocial: 500000,
  },
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

function seedGraph(node: GraphNode) {
  useGraphStore.setState(() => ({
    nodeIndex: new Map([[node.id, node]]),
    nodes: [node],
    links: [],
    timeline: [],
    selectedNodeId: node.id,
    panelMode: 'entity',
    expandingIds: new Set<string>(),
    breadcrumb: [node.id],
  }));
}

function openSection(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}

function goToTab(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
}

describe('FullScreenProfile — pessoa (categorias, busca, formatação segura)', () => {
  beforeEach(() => {
    seedProfileCache();
    seedGraph(PERSON_NODE);
  });

  afterEach(() => {
    cleanup();
  });

  it('abre em tela cheia com as 8 páginas de categoria e nome da entidade no topo', () => {
    render(<FullScreenProfile node={PERSON_NODE} onClose={() => {}} />);
    expect(screen.getByText('FULANO DE TAL')).toBeInTheDocument();
    for (const name of [
      'Cadastral & Civil',
      'Contatos & Endereços',
      'Financeiro & Consumo',
      'Carreira & Negócios',
      'Cyber Sec & Vazamentos',
      'Presença & Viagens',
      'Bens & Patrimônio',
      'Saúde & Outros',
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('busca filtra pra só as seções com resultado dentro da página ativa', () => {
    render(<FullScreenProfile node={PERSON_NODE} onClose={() => {}} />);
    goToTab('Cadastral & Civil');

    fireEvent.change(screen.getByPlaceholderText('Buscar nas informações desta entidade'), {
      target: { value: 'parentes' },
    });

    expect(screen.getByText('MAE DE FULANO')).toBeInTheDocument();
    expect(screen.getByText('PAI DE FULANO')).toBeInTheDocument();
  });

  it('chave desconhecida/nova cai em "Saúde & Outros" — nenhuma chave é descartada', () => {
    render(<FullScreenProfile node={PERSON_NODE} onClose={() => {}} />);
    goToTab('Saúde & Outros');
    openSection(/campoNovoDesconhecido/);
    expect(screen.getByText('valorunico12345')).toBeInTheDocument();
  });

  it('página sem nenhuma chave associada mostra "Nenhum registro encontrado"', () => {
    render(<FullScreenProfile node={PERSON_NODE} onClose={() => {}} />);
    goToTab('Bens & Patrimônio'); // fixture não tem nenhum campo de bens/patrimônio
    expect(screen.getByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });

  it('HTML nunca é executado — tags aparecem removidas, nenhum <script>/<b> real no DOM', () => {
    const { container } = render(<FullScreenProfile node={PERSON_NODE} onClose={() => {}} />);
    goToTab('Cadastral & Civil');
    openSection(/linhaDoTempo/);
    expect(container.querySelector('script')).toBeNull();
    // "b" real do payload malicioso só poderia vir de dentro do conteúdo da
    // página ativa — o cabeçalho tem <b> legítimos pros números dos stat-cards.
    expect(container.querySelector('.fsp-content b')).toBeNull();
    expect(
      screen.getByText(
        (_, el) => el?.className === 'profile-row-value' && el.textContent === 'Entrada na empresa alert(1)',
      ),
    ).toBeInTheDocument();
  });

  it('Base64/documento grande nunca aparece como texto cru — só "Documento disponível"', () => {
    const { container } = render(<FullScreenProfile node={PERSON_NODE} onClose={() => {}} />);
    goToTab('Cadastral & Civil');
    openSection(/docsBase64/);
    expect(screen.getByText(/Documento disponível/)).toBeInTheDocument();
    expect(container.textContent).not.toContain(RAW_BASE64_DOC.slice(0, 200));
  });

  it('campo "hard" (senha) nunca revela o valor — sem botão de revelar, sem o valor cru no DOM', () => {
    const { container } = render(<FullScreenProfile node={PERSON_NODE} onClose={() => {}} />);
    goToTab('Cyber Sec & Vazamentos');
    openSection(/credenciaisVazadas/);
    expect(container.textContent).not.toContain(RAW_SECRET);
    expect(screen.queryByText('Revelar')).not.toBeInTheDocument();
  });

  it('botão "Voltar ao mapa" aciona onClose', () => {
    let closed = false;
    render(<FullScreenProfile node={PERSON_NODE} onClose={() => (closed = true)} />);
    fireEvent.click(screen.getByRole('button', { name: /Voltar ao mapa/ }));
    expect(closed).toBe(true);
  });
});

describe('FullScreenProfile — empresa (dados estruturados, sem chamar a APIFull)', () => {
  beforeEach(() => {
    seedGraph(COMPANY_NODE);
  });

  afterEach(() => {
    cleanup();
  });

  it('renderiza dados cadastrais e de contato da empresa sem o perfil de pessoa', () => {
    render(<FullScreenProfile node={COMPANY_NODE} onClose={() => {}} />);
    expect(screen.getByText('EMPRESA TESTE LTDA')).toBeInTheDocument();

    goToTab('Contatos & Endereços');
    openSection(/contatos/);
    expect(screen.getByText('RUA DAS FLORES, 123')).toBeInTheDocument();
  });

  it('categorias sem fonte de dados pra empresa mostram "Nenhum registro encontrado"', () => {
    render(<FullScreenProfile node={COMPANY_NODE} onClose={() => {}} />);
    goToTab('Saúde & Outros');
    expect(screen.getByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });
});

describe('DetailsPanel — agora só a lateral de Estatísticas da Rede', () => {
  beforeEach(() => {
    useGraphStore.setState(() => ({
      nodeIndex: new Map(),
      nodes: [],
      links: [],
      timeline: [],
      selectedNodeId: null,
      panelMode: 'stats',
      expandingIds: new Set<string>(),
      breadcrumb: [],
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it('mostra os indicadores da rede, nunca conteúdo de perfil de entidade', () => {
    render(<DetailsPanel open onClose={() => {}} />);
    expect(screen.getByText('Estatísticas da Rede')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Buscar nas informações desta entidade')).not.toBeInTheDocument();
  });
});
