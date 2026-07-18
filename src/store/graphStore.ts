import { create } from 'zustand';
import type {
  CompanyLookupResult,
  GraphFilters,
  GraphLink,
  GraphNode,
  RelationshipMeta,
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
import { FonteDataProvider, mapRelation, mapStatus, parseBrDate } from '../services/fontedata';
import { extractSociedades, type ApiFullSociedade } from '../services/apifull';
import { usePersonProfileStore } from './personProfileStore';

export type ProviderMode = 'fontedata';

export const companyId = (cnpj: string) => `c:${onlyDigits(cnpj).padStart(14, '0')}`;
export const personId = (cpfOrName: string) => `p:${cpfOrName.trim()}`;

const linkId = (source: string, target: string, type: RelationType) => `${source}→${target}:${type}`;

/** Limite de segurança para o "Expandir Tudo" não explodir a renderização */
const EXPAND_ALL_NODE_CAP = 600;
/** Quantos CNPJs de sociedades[] são enriquecidos na FonteData por vez, por pessoa */
const SOCIEDADES_BATCH_SIZE = 4;
/** Teto de consultas NOVAS à APIFull (sem contar cache) numa execução de "Expandir Tudo" — proteção de custo */
const MAX_APIFULL_CALLS_PER_EXPAND_ALL = 25;

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

/** Ordem estável de exibição — independe da ordem de chegada das respostas das APIs. */
const RELATION_ORDER: RelationType[] = [
  'SOCIO',
  'ADMINISTRADOR',
  'REPRESENTANTE_LEGAL',
  'CONTROLADORA',
  'CONTROLADA',
  'FILIAL',
  'MATRIZ',
  'PARTICIPACAO',
];

function sortRelations(list: RelationType[]): RelationType[] {
  return [...new Set(list)].sort((a, b) => RELATION_ORDER.indexOf(a) - RELATION_ORDER.indexOf(b));
}

function sortStrings(list: string[]): string[] {
  return [...new Set(list)].sort((a, b) => a.localeCompare(b));
}

/**
 * Preenche campos "principais" vazios/ausentes de `a` com os de `b`, sem
 * sobrescrever um valor válido (compatibilidade com quem lê os campos
 * singulares), e acumula TODAS as qualificações conhecidas nos campos em
 * lista — sem perder nenhuma quando a APIFull e a FonteData relatam
 * qualificações diferentes para o mesmo par empresa/pessoa (ex.: sócio por
 * uma fonte, administrador por outra). Dedup + ordenação estável garantem
 * que o resultado final não dependa da ordem de chegada das respostas.
 */
function mergeMeta(a: RelationshipMeta, typeA: RelationType, b: RelationshipMeta, typeB: RelationType): RelationshipMeta {
  const pick = <K extends 'percentual' | 'dataEntrada' | 'situacao' | 'origem' | 'funcao'>(
    key: K,
  ): RelationshipMeta[K] => {
    const av = a[key];
    return av === undefined || av === null || av === '' ? b[key] : av;
  };
  return {
    percentual: pick('percentual'),
    dataEntrada: pick('dataEntrada'),
    situacao: pick('situacao'),
    origem: pick('origem'),
    funcao: pick('funcao'),
    relations: sortRelations([...(a.relations ?? [typeA]), typeB]),
    qualificacoes: sortStrings([...(a.qualificacoes ?? []), ...(b.funcao ? [b.funcao] : [])]),
    origens: sortStrings([...(a.origens ?? []), ...(b.origem ? [b.origem] : [])]),
    datasEntrada: sortStrings([...(a.datasEntrada ?? []), ...(b.dataEntrada ? [b.dataEntrada] : [])]),
  };
}

/**
 * Adiciona uma relação ou mescla com uma já existente entre o mesmo par
 * (source, target) — independente do `type`. Evita aresta duplicada quando
 * a mesma relação pessoa↔empresa é informada por duas fontes diferentes
 * (ex.: APIFull cria a relação primeiro, FonteData chega depois com a
 * mesma pessoa), acumulando todas as qualificações em vez de perder uma
 * delas (ver `mergeMeta`).
 */
export function addOrMergeLink(links: GraphLink[], source: string, target: string, type: RelationType, meta: RelationshipMeta) {
  const existingIdx = links.findIndex((l) => {
    const s = typeof l.source === 'string' ? l.source : l.source.id;
    const t = typeof l.target === 'string' ? l.target : l.target.id;
    return s === source && t === target;
  });
  if (existingIdx >= 0) {
    const existing = links[existingIdx];
    links[existingIdx] = { ...existing, meta: mergeMeta(existing.meta, existing.type, meta, type) };
    return;
  }
  const initialMeta: RelationshipMeta = {
    ...meta,
    relations: [type],
    qualificacoes: meta.funcao ? [meta.funcao] : [],
    origens: meta.origem ? [meta.origem] : [],
    datasEntrada: meta.dataEntrada ? [meta.dataEntrada] : [],
  };
  links.push({ id: linkId(source, target, type), source, target, type, meta: initialMeta });
}

/**
 * Mescla o resultado de uma consulta de CNPJ no grafo (mutação controlada +
 * novos arrays). `opts.partnerDepth` permite colocar a empresa e seus sócios
 * na MESMA camada — usado quando a empresa foi descoberta via
 * `sociedades[]` de uma pessoa (empresa e sócios entram juntos na camada
 * seguinte à da pessoa, não em camadas separadas). Sem `opts`, mantém o
 * comportamento padrão (sócios uma camada abaixo da empresa) usado na busca
 * inicial e na expansão normal de uma empresa.
 */
function mergeCompanyResult(
  state: GraphState,
  result: CompanyLookupResult,
  depth: number,
  opts?: { partnerDepth?: number },
) {
  const { nodeIndex } = state;
  const links = [...state.links];
  const timeline = [...state.timeline];
  const partnerDepth = opts?.partnerDepth ?? depth + 1;

  const cId = companyId(result.company.cnpj);
  let cNode = nodeIndex.get(cId);
  if (!cNode) {
    cNode = { id: cId, kind: 'company', label: result.company.razaoSocial, depth, expanded: false };
    nodeIndex.set(cId, cNode);
  } else {
    cNode.depth = Math.min(cNode.depth, depth);
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

  for (const p of result.partners) {
    if (p.person) {
      const pId = personId(p.person.cpf || p.person.nome);
      let pNode = nodeIndex.get(pId);
      if (!pNode) {
        pNode = {
          id: pId,
          kind: 'person',
          label: p.person.nome,
          depth: partnerDepth,
          expanded: false,
          person: p.person,
        };
        nodeIndex.set(pId, pNode);
      } else {
        pNode.depth = Math.min(pNode.depth, partnerDepth);
        if (p.person.administrador) pNode.person = { ...pNode.person!, administrador: true };
      }
      addOrMergeLink(links, pId, cId, p.relation, p.meta);
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
          depth: partnerDepth,
          expanded: false,
          company: { cnpj: onlyDigits(p.company.cnpj), razaoSocial: p.company.razaoSocial, situacao: 'DESCONHECIDA' },
        };
        nodeIndex.set(pjId, pjNode);
      } else {
        pjNode.depth = Math.min(pjNode.depth, partnerDepth);
      }
      addOrMergeLink(links, pjId, cId, p.relation, p.meta);
    }
  }

  for (const b of result.branches ?? []) {
    const bId = companyId(b.cnpj);
    if (!nodeIndex.has(bId)) {
      nodeIndex.set(bId, {
        id: bId,
        kind: 'company',
        label: `${b.razaoSocial} (Filial)`,
        depth: partnerDepth,
        expanded: false,
        company: { cnpj: onlyDigits(b.cnpj), razaoSocial: b.razaoSocial, situacao: 'DESCONHECIDA', matriz: false },
      });
    }
    addOrMergeLink(links, bId, cId, 'FILIAL', { origem: 'Cadastro', situacao: 'ATIVA' });
  }

  return { nodes: [...nodeIndex.values()], links, timeline };
}

/**
 * Cria/atualiza imediatamente a relação Pessoa→Empresa informada pela
 * própria APIFull (`sociedades[]`), com um nó de empresa "placeholder" se
 * ainda não existir. Roda ANTES da chamada à FonteData — se a FonteData não
 * devolver essa pessoa entre os sócios (bases desatualizadas entre si), a
 * relação informada pela APIFull continua no grafo.
 */
function mergeApiFullSociedadeRelation(state: GraphState, personNode: GraphNode, s: ApiFullSociedade, depth: number) {
  const { nodeIndex } = state;
  const links = [...state.links];

  const cId = companyId(s.cnpj);
  let cNode = nodeIndex.get(cId);
  if (!cNode) {
    cNode = {
      id: cId,
      kind: 'company',
      label: s.razaoSocial || s.cnpj,
      depth,
      expanded: false,
      company: {
        cnpj: s.cnpj,
        razaoSocial: s.razaoSocial || '(razão social pendente)',
        situacao: mapStatus(s.situacaoCadastral),
      },
    };
    nodeIndex.set(cId, cNode);
  } else {
    cNode.depth = Math.min(cNode.depth, depth);
  }

  const relation = mapRelation(s.qualificacaoSocioDescricao ?? '');
  addOrMergeLink(links, personNode.id, cId, relation, {
    dataEntrada: parseBrDate(s.dtEntrada),
    situacao: s.situacaoCadastral || 'ATIVO',
    origem: 'APIFull / sociedades',
    funcao: s.qualificacaoSocioDescricao,
  });

  return { nodes: [...nodeIndex.values()], links };
}

/**
 * Processa em lotes pequenos (Promise.allSettled) os CNPJs de `sociedades[]`
 * ainda não expandidos no grafo, enriquecendo cada um via FonteData
 * (empresa completa + todos os seus sócios, na mesma camada `targetDepth`).
 * Uma falha individual não cancela as demais. Retorna quantas tiveram
 * sucesso/falharam nesta chamada — chamar de novo (mesmo nó) reprocessa só
 * as que ainda não estão expandidas (as bem-sucedidas já ficam marcadas
 * `expanded` no grafo e não são reconsultadas).
 */
async function processPendingSociedades(
  get: () => GraphState,
  set: (partial: Partial<GraphState> | ((s: GraphState) => Partial<GraphState>)) => void,
  cpf: string,
  cnpjs: string[],
  targetDepth: number,
  epoch: number,
): Promise<{ succeededCount: number; failedCount: number }> {
  let succeededCount = 0;
  let failedCount = 0;
  for (let i = 0; i < cnpjs.length; i += SOCIEDADES_BATCH_SIZE) {
    if (get().graphEpoch !== epoch) break;
    const batch = cnpjs.slice(i, i + SOCIEDADES_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((cnpj) => get().providers.fontedata.getCompany(cnpj)));
    if (get().graphEpoch !== epoch) break;
    results.forEach((res, idx) => {
      const cnpj = batch[idx];
      if (res.status === 'fulfilled') {
        succeededCount += 1;
        set(mergeCompanyResult(get(), res.value, targetDepth, { partnerDepth: targetDepth }));
        usePersonProfileStore.getState().markSociedadeOutcome(cpf, cnpj, 'succeeded');
      } else {
        failedCount += 1;
        usePersonProfileStore.getState().markSociedadeOutcome(cpf, cnpj, 'failed');
      }
    });
  }
  return { succeededCount, failedCount };
}

/**
 * Expande um nó pessoa: perfil completo via APIFull (cache/dedup real em
 * `personProfileStore`, compartilhado com o clique no painel) → relação
 * imediata por `sociedades[]` → enriquecimento em lote via FonteData. Só
 * marca `node.expanded = true` quando não sobra CNPJ pendente nem falho —
 * numa falha parcial o nó permanece clicável para tentar de novo (reaproveita
 * o perfil em cache e só reprocessa os CNPJs que ainda faltam).
 */
async function expandPersonViaProfile(
  get: () => GraphState,
  set: (partial: Partial<GraphState> | ((s: GraphState) => Partial<GraphState>)) => void,
  node: GraphNode,
): Promise<void> {
  const cpf = onlyDigits(node.person?.cpf ?? '');
  const targetDepth = node.depth + 1;
  const epoch = get().graphEpoch;

  let profile;
  try {
    profile = await usePersonProfileStore.getState().loadProfile(cpf);
  } catch (e) {
    if (get().graphEpoch !== epoch) return;
    set({
      notice: `Falha ao carregar perfil de ${node.person?.nome ?? cpf}: ${e instanceof Error ? e.message : 'erro desconhecido'}`,
    });
    return; // node.expanded fica false — permite tentar de novo
  }
  if (get().graphEpoch !== epoch) return;

  const sociedades = extractSociedades(profile);
  if (sociedades.length === 0) {
    node.expanded = true;
    set({ nodes: [...get().nodeIndex.values()] });
    return;
  }

  // 1. Relação Empresa→Pessoa imediata por sociedade, com base só na APIFull
  // (não depende da FonteData responder — ver mergeApiFullSociedadeRelation).
  for (const s of sociedades) {
    set(mergeApiFullSociedadeRelation(get(), node, s, targetDepth));
  }
  if (get().graphEpoch !== epoch) return;

  // 2. Enriquecimento via FonteData só dos CNPJs ainda não expandidos no grafo.
  const pendingCnpjs = [...new Set(sociedades.map((s) => s.cnpj))].filter(
    (cnpj) => !get().nodeIndex.get(companyId(cnpj))?.expanded,
  );
  usePersonProfileStore.getState().setSociedadesStatus(cpf, { pending: pendingCnpjs, succeeded: [], failed: [] });

  const { failedCount } = await processPendingSociedades(get, set, cpf, pendingCnpjs, targetDepth, epoch);
  if (get().graphEpoch !== epoch) return;

  if (failedCount === 0) {
    node.expanded = true;
    set({ nodes: [...get().nodeIndex.values()] });
  } else {
    set({
      notice: `Expansão parcial: ${failedCount} de ${pendingCnpjs.length} empresa(s) falharam ao consultar ${node.person?.nome ?? cpf}. Clique de novo para tentar essas empresas.`,
    });
  }
}

const initialForce = loadForceSettings();

export const useGraphStore = create<GraphState>((set, get) => ({
  providerMode: 'fontedata',
  providers: { fontedata: new FonteDataProvider() },
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
        await expandPersonViaProfile(get, set, node);
        if (get().graphEpoch !== epoch) return;
      }
      // expansão manual (duplo clique / painel): garante que os filhos fiquem visíveis
      if (!opts?.force && node.depth + 1 > get().currentLayer) {
        set({ currentLayer: node.depth + 1 });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Erro ao expandir nó' });
    } finally {
      set((s) => {
        const next = new Set(s.expandingIds);
        next.delete(id);
        return { expandingIds: next };
      });
    }
  },

  expandAll: async () => {
    const { maxDepth, graphEpoch, nodeIndex } = get();
    const pendingPeopleCount = [...nodeIndex.values()].filter(
      (n) => n.kind === 'person' && !n.expanded && n.depth < maxDepth,
    ).length;
    if (pendingPeopleCount > 0) {
      // "Expandir Tudo" pode disparar uma cascata de consultas pagas (APIFull + FonteData)
      // — confirmação explícita antes de gastar créditos sem o usuário pedir uma pessoa por vez.
      const confirmed = window.confirm(
        `"Expandir Tudo" vai consultar a APIFull para ${pendingPeopleCount} pessoa(s) (e possivelmente novas empresas na FonteData) — isso consome créditos pagos das duas APIs e pode continuar em cascata por várias camadas. Deseja continuar?`,
      );
      if (!confirmed) return;
    }

    let apiFullCallsThisRun = 0;
    set({ loading: true, notice: null });
    // BFS: expande em ondas até o limite de profundidade ou o teto de nós
    for (let round = 0; round < 50; round++) {
      if (get().graphEpoch !== graphEpoch) break; // cancelado por recolher/reset
      const { nodeIndex: idx, expandingIds } = get();
      if (idx.size >= EXPAND_ALL_NODE_CAP) {
        set({ notice: `Expansão interrompida ao atingir ${EXPAND_ALL_NODE_CAP} nós (limite de segurança).` });
        break;
      }
      if (apiFullCallsThisRun >= MAX_APIFULL_CALLS_PER_EXPAND_ALL) {
        set({
          notice: `Expansão interrompida após ${MAX_APIFULL_CALLS_PER_EXPAND_ALL} consultas novas à APIFull nesta execução (limite de custo). Use "+" para continuar manualmente.`,
        });
        break;
      }
      const pending = [...idx.values()]
        .filter((n) => !n.expanded && n.depth < maxDepth && !expandingIds.has(n.id))
        .sort((a, b) => a.depth - b.depth)
        .slice(0, 8);
      if (pending.length === 0) break;
      const profilesByCpf = usePersonProfileStore.getState().profilesByCpf;
      apiFullCallsThisRun += pending.filter(
        (n) => n.kind === 'person' && !profilesByCpf.has(onlyDigits(n.person?.cpf ?? '')),
      ).length;
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
