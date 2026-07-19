// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EntityDetail } from './EntityDetail';
import { usePersonProfileStore } from '../../store/personProfileStore';
import { addOrMergeLink, companyId, personId, useGraphStore } from '../../store/graphStore';
import type { ApiFullProfile } from '../../services/apifull';
import type { GraphLink, GraphNode } from '../../types/graph';

const PERSON_CPF = '11144477735';
const PARENTE_CPF = '52998224725'; // CPF sintético válido (checksum ok)
const RAW_PASSWORD = 'iade0509';

const PROFILE: ApiFullProfile = {
  SERVICE_RESPONSE: {
    cadastral: {
      nome: 'FULANO DE TAL',
      cpfMask: '111.444.777-35',
      dataNasc: '16/03/1973',
      idade: 53,
      sexo: 'M',
      signo: 'Peixes',
      signoChines: 'Boi',
      classeSocial: 'A',
      escolaridade: 'SUPERIOR COMPLETO',
      mae: { nome: 'MARIA JOSE' },
      pai: { nome: 'CICERO' },
      cns: 700004153088603,
      pis: 12625028019,
      tituloEleitor: { numero: 16854861716, zona: '1', secao: '248' },
    },
    cnh: { nome: 'FULANO DE TAL', registro: '00560237696', uf_cnh: 'AL' },
    parentes: [
      { grau: 'Filho', nome: 'MARIA LUZIMAR', cpfParente: PARENTE_CPF, idade: 26, renda: 'R$ 1.621,00', cidade: 'Maceió', uf: 'AL', profissao: 'Continuo' },
    ],
    telefones: [{ telefone: '(82) 996302401', flagWhatsApp: false, classificacao: 'A', data: '19/01/2025' }],
    sociedades: [
      { razao_social: 'WRV LTDA', cnpj: '21819440000145', qualificacao_socio_descricao: 'Sócio-Administrador', situacao_cadastral: 'ATIVA', dt_entrada: '09/03/2021' },
    ],
    credenciaisVazadas: [
      { tipo: 'EMAIL', valor: 'x@y.com', resultados: [{ host: 'accounts.google.com', login: 'x@y.com', password: RAW_PASSWORD, file_date: '2024-01-01' }] },
    ],
    placas: [],
    linhaDoTempo: [{ data: '1973-03-16', categoria: 'PESSOAL', descricao: 'Nascimento de <b>Fulano</b>' }],
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
    capitalSocial: 100000,
    cnaePrincipal: { codigo: '6920601', descricao: 'Atividades de contabilidade' },
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

function selectNode(node: GraphNode, extraNodes: GraphNode[] = [], links: GraphLink[] = []) {
  const nodeIndex = new Map<string, GraphNode>();
  [node, ...extraNodes].forEach((n) => nodeIndex.set(n.id, n));
  useGraphStore.setState({
    nodeIndex,
    nodes: [...nodeIndex.values()],
    links,
    selectedNodeId: node.id,
    unsavedChanges: false,
  });
}

const PAGE_LABELS = [
  'Cadastral & Civil',
  'Contatos & Endereços',
  'Financeiro & Consumo',
  'Carreira & Negócios',
  'Cyber Sec & Vazamentos',
  'Presença & Viagens',
  'Bens & Patrimônio',
  'Saúde & Outros',
];

describe('EntityDetail — pessoa em tela cheia com o dicionário de campos', () => {
  beforeEach(() => {
    seedProfileCache();
    selectNode(PERSON_NODE);
  });
  afterEach(() => cleanup());

  it('renderiza as 8 abas nomeadas na ordem pedida', () => {
    render(<EntityDetail />);
    for (const l of PAGE_LABELS) {
      expect(screen.getByRole('button', { name: new RegExp(l) })).toBeInTheDocument();
    }
  });

  it('a aba Cadastral & Civil mostra as seções curadas (Registro Civil, Título de Eleitor, CNH)', () => {
    render(<EntityDetail />);
    expect(screen.getByText('Dados de Registro Civil & RFB')).toBeInTheDocument();
    expect(screen.getByText('Título de Eleitor')).toBeInTheDocument();
    expect(screen.getByText('Dados de Habilitação (CNH)')).toBeInTheDocument();
    // valor derivado/curado com rótulo em pt-BR
    expect(screen.getByText('Signo ocidental')).toBeInTheDocument();
    expect(screen.getByText('Peixes')).toBeInTheDocument();
    // card de parentesco com botão Consultar
    expect(screen.getByText('MARIA LUZIMAR')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Consultar' })).toBeInTheDocument();
  });

  it('trocar de aba muda o conteúdo (Bens & Patrimônio mostra estado vazio)', () => {
    render(<EntityDetail />);
    fireEvent.click(screen.getByRole('button', { name: /Bens & Patrimônio/ }));
    expect(screen.getByText('Nenhum veículo/placa encontrado.')).toBeInTheDocument();
    expect(screen.queryByText('Dados de Registro Civil & RFB')).not.toBeInTheDocument();
  });

  it('senha vazada nunca aparece crua na aba de vazamentos', () => {
    const { container } = render(<EntityDetail />);
    fireEvent.click(screen.getByRole('button', { name: /Cyber Sec & Vazamentos/ }));
    expect(screen.getByText('accounts.google.com')).toBeInTheDocument();
    expect(container.textContent).not.toContain(RAW_PASSWORD);
  });

  it('a busca reúne seções de todas as páginas que casam', () => {
    render(<EntityDetail />);
    fireEvent.change(screen.getByPlaceholderText('Buscar nas informações'), { target: { value: 'WRV' } });
    expect(screen.getByText('Sociedades (empresas)')).toBeInTheDocument();
    // "WRV" fica destacado (quebrado por <mark>); confere um campo não destacado do mesmo registro
    expect(screen.getByText('Sócio-Administrador')).toBeInTheDocument();
  });

  it('clicar em "Consultar" num parente dispara uma nova consulta', () => {
    const startPersonSearch = vi.fn();
    useGraphStore.setState({ startPersonSearch });
    render(<EntityDetail />);
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(startPersonSearch).toHaveBeenCalledWith(PARENTE_CPF);
  });
});

describe('EntityDetail — empresa em página única', () => {
  beforeEach(() => {
    seedProfileCache();
    const links: GraphLink[] = [];
    addOrMergeLink(links, PERSON_NODE.id, COMPANY_NODE.id, 'SOCIO', { funcao: 'Sócio', origem: 'Teste' });
    selectNode(COMPANY_NODE, [PERSON_NODE], links);
  });
  afterEach(() => cleanup());

  it('mostra CNPJ, situação e informações gerais sem abas de pessoa', () => {
    render(<EntityDetail />);
    expect(screen.getByText('11.222.333/0001-81')).toBeInTheDocument();
    expect(screen.getByText('Informações gerais')).toBeInTheDocument();
    expect(screen.getByText(/Atividades de contabilidade/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cyber Sec & Vazamentos/ })).not.toBeInTheDocument();
  });

  it('clicar numa conexão navega para a entidade relacionada', () => {
    render(<EntityDetail />);
    fireEvent.click(screen.getByRole('button', { name: /FULANO DE TAL/ }));
    expect(useGraphStore.getState().selectedNodeId).toBe(PERSON_NODE.id);
  });
});

describe('EntityDetail — sem nó selecionado', () => {
  afterEach(() => cleanup());
  it('não renderiza nada quando nenhum nó está selecionado', () => {
    useGraphStore.setState({ selectedNodeId: null, nodeIndex: new Map(), nodes: [], links: [] });
    const { container } = render(<EntityDetail />);
    expect(container.firstChild).toBeNull();
  });

  it('o botão de fechar volta ao mapa (limpa a seleção)', () => {
    seedProfileCache();
    selectNode(PERSON_NODE);
    render(<EntityDetail />);
    fireEvent.click(screen.getByRole('button', { name: /voltar ao mapa/i }));
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
  });
});
