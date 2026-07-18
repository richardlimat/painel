// ─── Modelo de grafo societário ────────────────────────────────────────────────

export type NodeKind = 'company' | 'person';

export type CompanyStatus = 'ATIVA' | 'BAIXADA' | 'SUSPENSA' | 'INAPTA' | 'NULA' | 'DESCONHECIDA';

export type RelationType =
  | 'SOCIO'
  | 'ADMINISTRADOR'
  | 'REPRESENTANTE_LEGAL'
  | 'CONTROLADORA'
  | 'CONTROLADA'
  | 'FILIAL'
  | 'MATRIZ'
  | 'PARTICIPACAO';

export interface CompanyData {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  situacao: CompanyStatus;
  cnaePrincipal?: { codigo: string; descricao: string };
  cnaesSecundarios?: { codigo: string; descricao: string }[];
  naturezaJuridica?: string;
  capitalSocial?: number;
  dataAbertura?: string; // ISO
  endereco?: string;
  municipio?: string;
  uf?: string;
  telefone?: string;
  email?: string;
  matriz?: boolean;
}

export interface PersonData {
  /** CPF (possivelmente mascarado, ex.: ***123456**) ou identificador estável */
  cpf: string;
  nome: string;
  /** Se a pessoa exerce função de administrador em alguma empresa */
  administrador?: boolean;
}

export interface GraphNode {
  /** id estável: cnpj normalizado ou cpf/nome normalizado */
  id: string;
  kind: NodeKind;
  label: string;
  /** distância (em camadas) da raiz da pesquisa */
  depth: number;
  /** já teve as conexões carregadas? */
  expanded: boolean;
  company?: CompanyData;
  person?: PersonData;
  // campos gerenciados pelo force-graph
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

export interface RelationshipMeta {
  /** percentual de participação (0–100), quando conhecido */
  percentual?: number;
  /** data de entrada "principal" (primeira preenchida) — mantida por compatibilidade */
  dataEntrada?: string;
  situacao?: string;
  /** origem "principal" (primeira preenchida) — mantida por compatibilidade */
  origem?: string;
  /** função/qualificação "principal" (primeira preenchida) — mantida por compatibilidade */
  funcao?: string;
  /**
   * Todas as qualificações mapeadas (ex.: sócio confirmado por uma fonte e
   * administrador por outra) — uma única aresta visual acumula todas, sem
   * duplicar. Ordenado de forma estável, independente da ordem de chegada
   * das respostas das APIs.
   */
  relations?: RelationType[];
  /** Texto bruto de qualificação de cada fonte que contribuiu para a relação, sem duplicar. */
  qualificacoes?: string[];
  /** Todas as origens que confirmaram esta relação (ex.: "APIFull / sociedades", "FonteData"), sem duplicar. */
  origens?: string[];
  /** Todas as datas de entrada distintas conhecidas, sem duplicar. */
  datasEntrada?: string[];
}

export interface GraphLink {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  type: RelationType;
  meta: RelationshipMeta;
}

// ─── Resultado de consultas aos provedores ────────────────────────────────────

export interface PartnerInfo {
  person?: PersonData;
  /** sócio pessoa jurídica */
  company?: Pick<CompanyData, 'cnpj' | 'razaoSocial'>;
  relation: RelationType;
  meta: RelationshipMeta;
}

export interface CompanyLookupResult {
  company: CompanyData;
  partners: PartnerInfo[];
  /** filiais/matriz conhecidas */
  branches?: { cnpj: string; razaoSocial: string; matriz: boolean }[];
}

export interface PersonLookupResult {
  person: PersonData;
  companies: {
    company: Pick<CompanyData, 'cnpj' | 'razaoSocial' | 'situacao' | 'uf' | 'municipio'>;
    relation: RelationType;
    meta: RelationshipMeta;
  }[];
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

export interface GraphFilters {
  showPeople: boolean;
  showCompanies: boolean;
  onlyActive: boolean;
  onlyBaixadas: boolean;
  onlyAdmins: boolean;
  onlyPartners: boolean;
  showBranches: boolean;
  showHeadquarters: boolean;
  minParticipation: number; // 0 = sem filtro
  uf: string; // '' = todos
  cnae: string; // '' = todos
  openedAfter: string; // ISO date ou ''
}

export const defaultFilters: GraphFilters = {
  showPeople: true,
  showCompanies: true,
  onlyActive: false,
  onlyBaixadas: false,
  onlyAdmins: false,
  onlyPartners: false,
  showBranches: true,
  showHeadquarters: true,
  minParticipation: 0,
  uf: '',
  cnae: '',
  openedAfter: '',
};

// ─── Eventos para a linha do tempo ────────────────────────────────────────────

export interface TimelineEvent {
  date: string; // ISO
  kind: 'abertura' | 'entrada_socio' | 'saida_socio' | 'alteracao';
  description: string;
  nodeId: string;
}
