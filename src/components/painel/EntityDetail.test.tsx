// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EntityDetail } from './EntityDetail';
import { usePersonProfileStore } from '../../store/personProfileStore';
import { addOrMergeLink, companyId, personId, useGraphStore } from '../../store/graphStore';
import type { ApiFullProfile } from '../../services/apifull';
import type { GraphLink, GraphNode } from '../../types/graph';

const PERSON_CPF = '11144477735';
const RAW_SECRET = 'segredo-super-confidencial';
const RAW_BASE64_DOC = 'A'.repeat(2500); // > 2000 chars — sempre tratado como documento

const PROFILE: ApiFullProfile = {
  SERVICE_RESPONSE: {
    cadastral: { nome: 'FULANO DE TAL', dataNascimento: '1990-05-10', sexo: 'MASCULINO' },
    parentes: [
      { nome: 'MAE DE FULANO', cpfParente: '52998224725' },
      { nome: 'PAI DE FULANO', cpfParente: '39053344705' },
    ],
    telefones: ['11999990000'],
    credenciaisVazadas: [{ senha: RAW_SECRET, origem: 'vazamento X' }],
    docsBase64: RAW_BASE64_DOC,
    veiculos: [{ placa: 'ABC1D23', modelo: 'CARRO' }],
    sociedades: [],
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
  });
}

describe('EntityDetail — pessoa em tela cheia com 8 abas temáticas', () => {
  beforeEach(() => {
    seedProfileCache();
    selectNode(PERSON_NODE);
  });
  afterEach(() => cleanup());

  it('renderiza as 8 abas nomeadas na ordem pedida', () => {
    render(<EntityDetail />);
    const labels = [
      'Cadastral & Civil',
      'Contatos & Endereços',
      'Financeiro & Consumo',
      'Carreira & Negócios',
      'Cyber Sec & Vazamentos',
      'Presença & Viagens',
      'Bens & Patrimônio',
      'Saúde & Outros',
    ];
    for (const l of labels) {
      expect(screen.getByRole('button', { name: new RegExp(l) })).toBeInTheDocument();
    }
  });

  it('a aba inicial mostra os dados cadastrais e trocar de aba muda o conteúdo', () => {
    render(<EntityDetail />);
    // Cadastral & Civil (aba 0): data de nascimento formatada aparece
    expect(screen.getByText('10/05/1990')).toBeInTheDocument();

    // trocar para Bens & Patrimônio mostra o veículo
    fireEvent.click(screen.getByRole('button', { name: /Bens & Patrimônio/ }));
    expect(screen.getByText('ABC1D23')).toBeInTheDocument();
    expect(screen.queryByText('10/05/1990')).not.toBeInTheDocument();
  });

  it('senha (campo hard) nunca aparece crua na aba de vazamentos — sem botão Revelar', () => {
    const { container } = render(<EntityDetail />);
    fireEvent.click(screen.getByRole('button', { name: /Cyber Sec & Vazamentos/ }));
    expect(screen.getByText('vazamento X')).toBeInTheDocument(); // origem visível
    expect(container.textContent).not.toContain(RAW_SECRET);
    expect(screen.queryByText('Revelar')).not.toBeInTheDocument();
  });

  it('Base64 grande nunca vira texto cru — só "Documento disponível"', () => {
    const { container } = render(<EntityDetail />);
    expect(screen.getByText(/Documento disponível/)).toBeInTheDocument();
    expect(container.textContent).not.toContain(RAW_BASE64_DOC.slice(0, 200));
  });

  it('a busca reúne resultados de todas as páginas numa visão única', () => {
    render(<EntityDetail />);
    fireEvent.change(screen.getByPlaceholderText('Buscar nas informações'), { target: { value: 'parentes' } });
    expect(screen.getByText(/Resultados da busca/)).toBeInTheDocument();
    expect(screen.getByText('MAE DE FULANO')).toBeInTheDocument();
    expect(screen.getByText('PAI DE FULANO')).toBeInTheDocument();

    // clicar numa aba limpa a busca e volta à navegação normal
    fireEvent.click(screen.getByRole('button', { name: /Cadastral & Civil/ }));
    expect(screen.queryByText(/Resultados da busca/)).not.toBeInTheDocument();
    expect(screen.getByText('10/05/1990')).toBeInTheDocument();
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
    // não há abas temáticas de pessoa
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
