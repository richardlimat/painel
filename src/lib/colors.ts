import type { GraphNode, RelationType } from '../types/graph';

// ─── Identidade visual dos nós ────────────────────────────────────────────────
export const NODE_COLORS = {
  company: '#3b82f6', // azul — empresa ativa
  person: '#10b981', // verde — pessoa
  inactive: '#9ca3af', // cinza — empresa inativa (suspensa/inapta/nula)
  baixada: '#ef4444', // vermelho — empresa baixada
  admin: '#eab308', // amarelo — administrador
  matriz: '#8b5cf6', // roxo — empresa matriz
  filial: '#f97316', // laranja — empresa filial
} as const;

// ─── Cores por tipo de relacionamento ─────────────────────────────────────────
export const LINK_COLORS: Record<RelationType, string> = {
  SOCIO: '#3b82f6', // azul
  ADMINISTRADOR: '#22c55e', // verde
  REPRESENTANTE_LEGAL: '#14b8a6', // teal
  CONTROLADORA: '#ef4444', // vermelho
  CONTROLADA: '#dc2626',
  FILIAL: '#f97316', // laranja
  MATRIZ: '#8b5cf6',
  PARTICIPACAO: '#a855f7', // roxo
};

export const RELATION_LABELS: Record<RelationType, string> = {
  SOCIO: 'Sócio de',
  ADMINISTRADOR: 'Administrador de',
  REPRESENTANTE_LEGAL: 'Representante Legal',
  CONTROLADORA: 'Controladora',
  CONTROLADA: 'Controlada',
  FILIAL: 'Filial de',
  MATRIZ: 'Matriz de',
  PARTICIPACAO: 'Participação Societária',
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

export const NODE_LEGEND = [
  { color: NODE_COLORS.company, label: 'Empresa ativa' },
  { color: NODE_COLORS.person, label: 'Pessoa (CPF)' },
  { color: NODE_COLORS.admin, label: 'Administrador' },
  { color: NODE_COLORS.inactive, label: 'Empresa inativa' },
  { color: NODE_COLORS.baixada, label: 'Empresa baixada' },
  { color: NODE_COLORS.filial, label: 'Filial' },
  { color: NODE_COLORS.matriz, label: 'Matriz (destaque)' },
];
