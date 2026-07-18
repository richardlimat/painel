import type { GraphNode, RelationType } from '../types/graph';

// ─── Identidade visual dos nós (paleta NEXUS) ─────────────────────────────────
export const NODE_COLORS = {
  company: '#1671f9', // azul — empresa ativa
  companyRing: '#0d63e8',
  person: '#18a568', // verde — pessoa
  inactive: '#a7adb7', // cinza — empresa inativa (suspensa/inapta/nula)
  baixada: '#f04e57', // vermelho — empresa baixada
  admin: '#f5a12c', // amarelo — administrador
  matriz: '#8257e6', // roxo — empresa matriz (destaque)
  filial: '#ff762a', // laranja — empresa filial
} as const;

// ─── Cores por tipo de relacionamento ─────────────────────────────────────────
export const LINK_COLORS: Record<RelationType, string> = {
  SOCIO: '#1671f9', // azul
  ADMINISTRADOR: '#18a568', // verde
  REPRESENTANTE_LEGAL: '#14b8a6', // teal
  CONTROLADORA: '#f04e57', // vermelho
  CONTROLADA: '#d63a44',
  FILIAL: '#ff762a', // laranja
  MATRIZ: '#8257e6',
  PARTICIPACAO: '#8257e6', // roxo
};

export const RELATION_LABELS: Record<RelationType, string> = {
  SOCIO: 'Sócio',
  ADMINISTRADOR: 'Administrador',
  REPRESENTANTE_LEGAL: 'Representante Legal',
  CONTROLADORA: 'Controladora',
  CONTROLADA: 'Controlada',
  FILIAL: 'Filial',
  MATRIZ: 'Matriz de',
  PARTICIPACAO: 'Participação',
};

export function nodeColor(node: GraphNode): string {
  if (node.kind === 'person') {
    return node.person?.administrador ? NODE_COLORS.admin : NODE_COLORS.person;
  }
  const c = node.company;
  if (!c) return NODE_COLORS.company;
  if (c.situacao === 'BAIXADA') return NODE_COLORS.baixada;
  if (c.situacao === 'SUSPENSA' || c.situacao === 'INAPTA' || c.situacao === 'NULA') return NODE_COLORS.inactive;
  if (c.matriz === false) return NODE_COLORS.filial;
  return NODE_COLORS.company;
}

/** Classes CSS do nó no estilo NEXUS (rf-entity) */
export function nodeKindClass(node: GraphNode): string {
  if (node.kind === 'person') {
    return node.person?.administrador ? 'person admin' : 'person';
  }
  const c = node.company;
  const parts = ['company'];
  if (c?.situacao === 'BAIXADA') parts.push('closed');
  if (c?.situacao === 'SUSPENSA' || c?.situacao === 'INAPTA' || c?.situacao === 'NULA') parts.push('inactive');
  if (c?.matriz === false) parts.push('branch');
  if (c?.matriz === true) parts.push('matrix');
  return parts.join(' ');
}

export const NODE_LEGEND = [
  { color: NODE_COLORS.company, label: 'Empresa ativa' },
  { color: NODE_COLORS.person, label: 'Pessoa (CPF)' },
  { color: NODE_COLORS.admin, label: 'Administrador' },
  { color: NODE_COLORS.inactive, label: 'Empresa inativa' },
  { color: NODE_COLORS.baixada, label: 'Empresa baixada' },
  { color: NODE_COLORS.filial, label: 'Filial' },
  { color: NODE_COLORS.matriz, label: 'Matriz (destaque)' },
];
