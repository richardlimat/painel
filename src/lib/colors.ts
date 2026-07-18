import type { GraphNode, RelationType } from '../types/graph';

// ─── Identidade visual neutra (branco/grafite/cinza — sem azul) ───────────────

export interface NodeVisual {
  bg: string;
  fg: string;
  border: string;
}

export const NEUTRAL = {
  ink: '#111827', // preto-grafite
  graphite: '#374151',
  gray: '#6b7280',
  grayLight: '#9ca3af',
  grayLighter: '#d1d5db',
  surface: '#f3f4f6',
  white: '#ffffff',
} as const;

/**
 * Aparência do nó: empresas e pessoas se diferenciam por preenchimento,
 * borda e ícone — nunca por cor azul.
 */
export function nodeVisual(node: GraphNode): NodeVisual {
  if (node.kind === 'person') {
    // pessoa: círculo branco com ícone grafite (administrador tem borda mais escura)
    return node.person?.administrador
      ? { bg: NEUTRAL.white, fg: NEUTRAL.ink, border: '#4b5563' }
      : { bg: NEUTRAL.white, fg: NEUTRAL.graphite, border: NEUTRAL.grayLight };
  }
  const c = node.company;
  if (c?.situacao === 'BAIXADA') {
    // baixada: contorno tracejado (classe .closed) e tons apagados
    return { bg: NEUTRAL.white, fg: NEUTRAL.grayLight, border: NEUTRAL.grayLight };
  }
  if (c?.situacao === 'SUSPENSA' || c?.situacao === 'INAPTA' || c?.situacao === 'NULA') {
    return { bg: '#e5e7eb', fg: NEUTRAL.gray, border: NEUTRAL.grayLight };
  }
  if (c?.matriz === false) {
    // filial: cinza médio
    return { bg: NEUTRAL.gray, fg: NEUTRAL.white, border: '#4b5563' };
  }
  // empresa ativa: grafite escuro preenchido com ícone branco
  return { bg: NEUTRAL.graphite, fg: NEUTRAL.white, border: '#1f2937' };
}

/** Visual da empresa pesquisada (raiz) */
export const ROOT_VISUAL: NodeVisual = { bg: NEUTRAL.ink, fg: NEUTRAL.white, border: '#000000' };

// ─── Cores por tipo de relacionamento (tons neutros) ──────────────────────────
export const LINK_COLORS: Record<RelationType, string> = {
  SOCIO: '#4b5563',
  ADMINISTRADOR: '#1f2937',
  REPRESENTANTE_LEGAL: '#6b7280',
  CONTROLADORA: '#111827',
  CONTROLADA: '#374151',
  FILIAL: '#9ca3af',
  MATRIZ: '#374151',
  PARTICIPACAO: '#6b7280',
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

/** Classes CSS do nó do mapa (rf-entity) */
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

export const NODE_LEGEND: { visual: NodeVisual; label: string; dashed?: boolean }[] = [
  { visual: { bg: NEUTRAL.graphite, fg: NEUTRAL.white, border: '#1f2937' }, label: 'Empresa ativa' },
  { visual: { bg: NEUTRAL.white, fg: NEUTRAL.graphite, border: NEUTRAL.grayLight }, label: 'Pessoa (CPF)' },
  { visual: { bg: NEUTRAL.white, fg: NEUTRAL.ink, border: '#4b5563' }, label: 'Administrador' },
  { visual: { bg: '#e5e7eb', fg: NEUTRAL.gray, border: NEUTRAL.grayLight }, label: 'Empresa inativa' },
  { visual: { bg: NEUTRAL.white, fg: NEUTRAL.grayLight, border: NEUTRAL.grayLight }, label: 'Empresa baixada', dashed: true },
  { visual: { bg: NEUTRAL.gray, fg: NEUTRAL.white, border: '#4b5563' }, label: 'Filial' },
  { visual: { bg: NEUTRAL.ink, fg: NEUTRAL.white, border: '#000' }, label: 'Empresa pesquisada' },
];
