import { create } from 'zustand';
import type {
  CompanyLookupResult,
  GraphFilters,
  GraphLink,
  GraphNode,
  PersonLookupResult,
  RelationType,
  TimelineEvent,
} from '../types/graph';
import { defaultFilters } from '../types/graph';
import { onlyDigits } from '../lib/format';
import type { DataProvider } from '../services/provider';
import {
  FORCE_DEFAULTS,
  clearForceSettings,
  loadForceSettings,
  saveForceSettings,
  type ForceSettings,
} from '../lib/forceSim';
import { ReverseLookupUnsupportedError } from '../services/provider';
import { BrasilApiProvider } from '../services/brasilapi';
import { DemoProvider } from '../services/demoProvider';

export type ProviderMode = 'demo' | 'brasilapi';

export const companyId = (cnpj: string) => `c:${onlyDigits(cnpj).padStart(14, '0')}`;
export const personId = (cpfOrName: string) => `p:${cpfOrName.trim()}`;

const linkId = (source: string, target: string, type: RelationType) => `${source}→${target}:${type}`;

/** Limite de segurança para o "Expandir Tudo" não explodir a renderização */
const EXPAND_ALL_NODE_CAP = 600;

interface GraphState {
  providerMode: ProviderMode;
  providers: Record<ProviderMode, DataProvider>;
  nodes: GraphNode[];
  links: GraphLink[];
  nodeIndex: Map<string, GraphNode>;
  timeline: TimelineEvent[];
  rootId: string | null;
  maxDepth: number; // Infinity = ilimitado
  /** camada atual do controle [−] Camada N [+]: exibe nós com depth <= currentLayer */
  currentLayer: number;
  /** consulta de camada em andamento (bloqueia cliques repetidos no controle) */
  layerLoading: boolean;
  selectedNodeId: string | null;
  breadcrumb: string[];
  expandingIds: Set<string>;
  loading: boolean;
  error: string | null;
  notice: string | null;
  filters: GraphFilters;
  searchQuery: string;
  highlightedNodeId: string | null;
  focusRequest: { nodeId: string; ts: number } | null;
  organizeRequest: number;
  panelMode: 'entity' | 'stats';
  /** incrementado a cada reset/recolhimento — cancela expansões em andamento */
  graphEpoch: number;
  /** forças do layout (painel "Configurar mapa"), escala 0–100 */
  forceSettings: ForceSettings;
  /** true quando o usuário personalizou as forças (ativa o refinamento automático) */
  forceCustomized: boolean;
  /** incrementado pelo botão "Animar" */
  animateRequest: number;
  theme: 'light' | 'dark';

  setProviderMode: (m: ProviderMode) => void;
  setMaxDepth: (d: number) => void;
  setTheme: (t: 'light' | 'dark') => void;
  setFilters: (f: Partial<GraphFilters>) => void;
  resetFilters: () => void;
  setSearchQuery: (q: string) => void;
  focusNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  requestOrganize: () => void;
  setForceSettings: (s: Partial<ForceSettings>) => void;
  resetForceSettings: () => void;
  requestAnimate: () => void;
  setPanelMode: (m: 'entity' | 'stats') => void;
  notify: (msg: string) => void;
  clearNotice: () => void;
  startSearch: (cnpj: string) => Promise<void>;
  expandNode: (id: string, opts?: { force?: boolean }) => Promise<void>;
  expandAll: () => Promise<void>;
  collapseAll: () => void;
  nextLayer: () => Promise<void>;
  prevLayer: () => void;
  reset: () => void;
}

function pushEvent(timeline: TimelineEvent[], ev: TimelineEvent) {
  if (!ev.date) return;
  if (timeline.some((t) => t.date === ev.date && t.description === ev.description)) return;
  timeline.push(ev);
}

/** Mescla o resultado de uma consulta de CNPJ no grafo (mutação controlada + novos arrays) */
function mergeCompanyResult(state: GraphState, result: CompanyLookupResult, depth: number) {
  const { nodeIndex } = state;
  const links = [...state.links];
  const linkIds = new Set(links.map((l) => l.id));
  const timeline = [...state.timeline];

  const cId = companyId(result.company.cnpj);
  let cNode = nodeIndex.get(cId);
  if (!cNode) {
    cNode = { id: cId, kind: 'company', label: result.company.razaoSocial, depth, expanded: false };
    nodeIndex.set(cId, cNode);
  }
  cNode.company = result.company;
  cNode.label = result.company.razaoSocial;
  cNode.expanded = true;
  pushEvent(timeline, {
    date: result.company.dataAbertura ?? '',
    kind: 'abertura',
    description: `Abertura de ${result.company.razaoSocial}`,
    nodeId: cId,
  });

  const addLink = (source: string, target: string, type: RelationType, meta: GraphLink['meta']) => {
    const id = linkId(source, target, type);
    if (linkIds.has(id)) return;
    linkIds.add(id);
    links.push({ id, source, target, type, meta });
  };

  for (const p of result.partners) {
    if (p.person) {
      const pId = personId(p.person.cpf || p.person.nome);
      let pNode = nodeIndex.get(pId);
      if (!pNode) {
        pNode = { id: pId, kind: 'person', label: p.person.nome, depth: depth + 1, expanded: false, person: p.person };
        nodeIndex.set(pId, pNode);
      } else {
        pNode.depth = Math.min(pNode.depth, depth + 1);
        if (p.person.administrador) pNode.person = { ...pNode.person!, administrador: true };
      }
      addLink(pId, cId, p.relation, p.meta);
      pushEvent(timeline, {
        date: p.meta.dataEntrada ?? '',
        kind: p.meta.situacao === 'RETIRADO' ? 'saida_socio' : 'entrada_socio',
        description:
          p.meta.situacao === 'RETIRADO'
            ? `Saída de ${p.person.nome} de ${result.company.razaoSocial}`
            : `Entrada de ${p.person.nome} em ${result.company.razaoSocial}`,
        nodeId: pId,
      });
    } else if (p.company) {
      const pjId = companyId(p.company.cnpj);
      let pjNode = nodeIndex.get(pjId);
      if (!pjNode) {
        pjNode = {
          id: pjId,
          kind: 'company',
          label: p.company.razaoSocial,
          depth: depth + 1,
          expanded: false,
          company: { cnpj: onlyDigits(p.company.cnpj), razaoSocial: p.company.razaoSocial, situacao: 'DESCONHECIDA' },
        };
        nodeIndex.set(pjId, pjNode);
      }
      addLink(pjId, cId, p.relation, p.meta);
    }
  }

  for (const b of result.branches ?? []) {
    const bId = companyId(b.cnpj);
    if (!nodeIndex.has(bId)) {
      nodeIndex.set(bId, {
        id: bId,
        kind: 'company',
        label: `${b.razaoSocial} (Filial)`,
        depth: depth + 1,
        expanded: false,
        company: { cnpj: onlyDigits(b.cnpj), razaoSocial: b.razaoSocial, situacao: 'DESCONHECIDA', matriz: false },
      });
    }
    addLink(bId, cId, 'FILIAL', { origem: 'Cadastro', situacao: 'ATIVA' });
  }

  return { nodes: [...nodeIndex.values()], links, timeline };
}

function mergePersonResult(state: GraphState, result: PersonLookupResult, depth: number) {
  const { nodeIndex } = state;
  const links = [...state.links];
  const linkIds = new Set(links.map((l) => l.id));
  const timeline = [...state.timeline];

  const pId = personId(result.person.cpf || result.person.nome);
  const pNode = nodeIndex.get(pId);
  if (pNode) pNode.expanded = true;

  for (const c of result.companies) {
    const cId = companyId(c.company.cnpj);
    let cNode = nodeIndex.get(cId);
    if (!cNode) {
      cNode = {
        id: cId,
        kind: 'company',
        label: c.company.razaoSocial,
        depth: depth + 1,
        expanded: false,
        company: {
          cnpj: onlyDigits(c.company.cnpj),
          razaoSocial: c.company.razaoSocial,
          situacao: c.company.situacao ?? 'DESCONHECIDA',
          uf: c.company.uf,
          municipio: c.company.municipio,
        },
      };
      nodeIndex.set(cId, cNode);
    } else {
      cNode.depth = Math.min(cNode.depth, depth + 1);
    }
    const id = linkId(pId, cId, c.relation);
    if (!linkIds.has(id)) {
      linkIds.add(id);
      links.push({ id, source: pId, target: cId, type: c.relation, meta: c.meta });
    }
    pushEvent(timeline, {
      date: c.meta.dataEntrada ?? '',
      kind: c.meta.situacao === 'RETIRADO' ? 'saida_socio' : 'entrada_socio',
      description:
        c.meta.situacao === 'RETIRADO'
          ? `Saída de ${result.person.nome} de ${c.company.razaoSocial}`
          : `Entrada de ${result.person.nome} em ${c.company.razaoSocial}`,
      nodeId: pId,
    });
  }

  return { nodes: [...nodeIndex.values()], links, timeline };
}

const initialForce = loadForceSettings();

export const useGraphStore = create<GraphState>((set, get) => ({
  providerMode: 'demo',
  providers: { demo: new DemoProvider(), brasilapi: new BrasilApiProvider() },
  nodes: [],
  links: [],
  nodeIndex: new Map(),
  timeline: [],
  rootId: null,
  maxDepth: 5,
  currentLayer: 1,
  layerLoading: false,
  selectedNodeId: null,
  breadcrumb: [],
  expandingIds: new Set(),
  loading: false,
  error: null,
  notice: null,
  filters: { ...defaultFilters },
  searchQuery: '',
  highlightedNodeId: null,
  focusRequest: null,
  organizeRequest: 0,
  panelMode: 'entity',
  graphEpoch: 0,
  forceSettings: initialForce.settings,
  forceCustomized: initialForce.customized,
  animateRequest: 0,
  theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',

  setProviderMode: (m) => set({ providerMode: m }),
  setMaxDepth: (d) => set({ maxDepth: d }),
  setTheme: (t) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
    localStorage.setItem('painel-theme', t);
    set({ theme: t });
  },
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  resetFilters: () => set({ filters: { ...defaultFilters } }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  focusNode: (id) => set({ highlightedNodeId: id, focusRequest: { nodeId: id, ts: Date.now() } }),
  selectNode: (id) => {
    if (!id) {
      set({ selectedNodeId: null });
      return;
    }
    set((s) => {
      const crumb = s.breadcrumb.filter((b) => b !== id);
      crumb.push(id);
      return { selectedNodeId: id, breadcrumb: crumb.slice(-8), panelMode: 'entity' };
    });
  },
  requestOrganize: () => set((s) => ({ organizeRequest: s.organizeRequest + 1 })),
  setForceSettings: (partial) =>
    set((s) => {
      const next = { ...s.forceSettings, ...partial };
      saveForceSettings(next);
      return { forceSettings: next, forceCustomized: true };
    }),
  resetForceSettings: () => {
    clearForceSettings();
    set({ forceSettings: { ...FORCE_DEFAULTS }, forceCustomized: false });
    // volta ao layout radial puro, sem zoom brusco (organize já faz fitView suave)
    get().requestOrganize();
  },
  requestAnimate: () => set((s) => ({ animateRequest: s.animateRequest + 1 })),
  setPanelMode: (m) => set({ panelMode: m }),
  notify: (msg) => set({ notice: msg }),
  clearNotice: () => set({ notice: null }),

  startSearch: async (cnpj: string) => {
    const state = get();
    const provider = state.providers[state.providerMode];
    set((s) => ({
      loading: true,
      error: null,
      nodes: [],
      links: [],
      nodeIndex: new Map(),
      timeline: [],
      breadcrumb: [],
      selectedNodeId: null,
      rootId: null,
      graphEpoch: s.graphEpoch + 1,
    }));
    try {
      const result = await provider.getCompany(cnpj);
      const merged = mergeCompanyResult(get(), result, 0);
      const rootId = companyId(result.company.cnpj);
      set({ ...merged, rootId, loading: false, breadcrumb: [rootId], currentLayer: 1, layerLoading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Erro na consulta' });
    }
  },

  expandNode: async (id: string, opts?: { force?: boolean }) => {
    const state = get();
    const node = state.nodeIndex.get(id);
    if (!node || node.expanded || state.expandingIds.has(id)) return;
    if (!opts?.force && node.depth >= state.maxDepth) {
      set({ notice: `Limite de ${state.maxDepth} níveis atingido. Aumente o limite para continuar expandindo.` });
      return;
    }
    const provider = state.providers[state.providerMode];
    const epoch = state.graphEpoch;
    set((s) => ({ expandingIds: new Set(s.expandingIds).add(id) }));
    try {
      if (node.kind === 'company') {
        const result = await provider.getCompany(node.company!.cnpj);
        if (get().graphEpoch !== epoch) return; // grafo foi recolhido/resetado no meio-tempo
        const merged = mergeCompanyResult(get(), result, node.depth);
        set(merged);
      } else {
        const result = await provider.getPersonCompanies(node.person!.cpf, node.person!.nome);
        if (get().graphEpoch !== epoch) return;
        const merged = mergePersonResult(get(), result, node.depth);
        set(merged);
      }
      // expansão manual (duplo clique / painel): garante que os filhos fiquem visíveis
      if (!opts?.force && node.depth + 1 > get().currentLayer) {
        set({ currentLayer: node.depth + 1 });
      }
    } catch (e) {
      if (e instanceof ReverseLookupUnsupportedError) {
        node.expanded = true;
        set({ notice: e.message, nodes: [...get().nodeIndex.values()] });
      } else {
        set({ error: e instanceof Error ? e.message : 'Erro ao expandir nó' });
      }
    } finally {
      set((s) => {
        const next = new Set(s.expandingIds);
        next.delete(id);
        return { expandingIds: next };
      });
    }
  },

  expandAll: async () => {
    const { maxDepth, graphEpoch } = get();
    set({ loading: true, notice: null });
    // BFS: expande em ondas até o limite de profundidade ou o teto de nós
    for (let round = 0; round < 50; round++) {
      if (get().graphEpoch !== graphEpoch) break; // cancelado por recolher/reset
      const { nodeIndex, expandingIds } = get();
      if (nodeIndex.size >= EXPAND_ALL_NODE_CAP) {
        set({ notice: `Expansão interrompida ao atingir ${EXPAND_ALL_NODE_CAP} nós (limite de segurança).` });
        break;
      }
      const pending = [...nodeIndex.values()]
        .filter((n) => !n.expanded && n.depth < maxDepth && !expandingIds.has(n.id))
        .sort((a, b) => a.depth - b.depth)
        .slice(0, 8);
      if (pending.length === 0) break;
      await Promise.all(pending.map((n) => get().expandNode(n.id)));
    }
    set({ loading: false });
  },

  nextLayer: async () => {
    const s0 = get();
    if (s0.layerLoading || !s0.rootId) return;
    const target = s0.currentLayer + 1;
    const all = [...s0.nodeIndex.values()];
    const alreadyLoadedNext = all.some((n) => n.depth === target);
    // fronteira: nós ainda não expandidos dentro das camadas visíveis
    const frontier = all.filter((n) => !n.expanded && n.depth <= s0.currentLayer);
    if (!alreadyLoadedNext && frontier.length === 0) {
      set({ notice: 'Última camada alcançada — não há novas conexões nos dados.' });
      return;
    }
    set({ layerLoading: true, notice: null });
    const epoch = s0.graphEpoch;
    try {
      for (let i = 0; i < frontier.length; i += 6) {
        if (get().graphEpoch !== epoch) return;
        if (get().nodeIndex.size >= EXPAND_ALL_NODE_CAP) {
          set({ notice: `Expansão limitada a ${EXPAND_ALL_NODE_CAP} nós (limite de segurança).` });
          break;
        }
        await Promise.all(frontier.slice(i, i + 6).map((n) => get().expandNode(n.id, { force: true })));
      }
      if (get().graphEpoch !== epoch) return;
      const hasNext = [...get().nodeIndex.values()].some((n) => n.depth === target);
      if (hasNext) {
        set({ currentLayer: target });
        get().requestOrganize();
      } else {
        set({ notice: 'Última camada alcançada — não há novas conexões nos dados.' });
      }
    } finally {
      set({ layerLoading: false });
    }
  },

  prevLayer: () => {
    const s = get();
    if (s.currentLayer <= 1 || s.layerLoading) return;
    set({ currentLayer: s.currentLayer - 1 });
    get().requestOrganize();
  },

  collapseAll: () => {
    const { rootId, nodeIndex, links } = get();
    if (!rootId) return;
    const keep = new Set<string>([rootId]);
    for (const l of links) {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      if (s === rootId) keep.add(t);
      if (t === rootId) keep.add(s);
    }
    const newIndex = new Map<string, GraphNode>();
    for (const id of keep) {
      const n = nodeIndex.get(id);
      if (n) {
        if (id !== rootId) n.expanded = false;
        newIndex.set(id, n);
      }
    }
    const newLinks = links.filter((l) => {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      return (s === rootId || t === rootId) && keep.has(s) && keep.has(t);
    });
    set((s) => ({
      nodeIndex: newIndex,
      nodes: [...newIndex.values()],
      links: newLinks,
      breadcrumb: [rootId],
      selectedNodeId: null,
      graphEpoch: s.graphEpoch + 1,
      loading: false,
      currentLayer: 1,
      layerLoading: false,
    }));
  },

  reset: () =>
    set((s) => ({
      nodes: [],
      links: [],
      nodeIndex: new Map(),
      timeline: [],
      rootId: null,
      selectedNodeId: null,
      breadcrumb: [],
      error: null,
      notice: null,
      searchQuery: '',
      highlightedNodeId: null,
      graphEpoch: s.graphEpoch + 1,
      loading: false,
    })),
}));
