import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useGraphStore } from '../../store/graphStore';
import { applyFilters, degreeMap } from '../../lib/filtering';
import { LINK_COLORS, NODE_COLORS, RELATION_LABELS, nodeColor, nodeKindClass } from '../../lib/colors';
import { formatCNPJ } from '../../lib/format';
import { placeAround, radialLayout, type XY } from '../../lib/flowLayout';
import { ForceRefiner, type SimNode } from '../../lib/forceSim';
import type { GraphNode } from '../../types/graph';
import { EntityNode, type EntityFlowNode } from './EntityNode';
import { FloatingEdge, type FloatingFlowEdge } from './FloatingEdge';

const nid = (v: string | GraphNode) => (typeof v === 'string' ? v : v.id);

const nodeTypes = { entity: EntityNode };
const edgeTypes = { floating: FloatingEdge };

function FlowCanvasInner() {
  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const filters = useGraphStore((s) => s.filters);
  const rootId = useGraphStore((s) => s.rootId);
  const currentLayer = useGraphStore((s) => s.currentLayer);
  const theme = useGraphStore((s) => s.theme);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const expandingIds = useGraphStore((s) => s.expandingIds);
  const highlightedNodeId = useGraphStore((s) => s.highlightedNodeId);
  const focusRequest = useGraphStore((s) => s.focusRequest);
  const organizeRequest = useGraphStore((s) => s.organizeRequest);
  const forceSettings = useGraphStore((s) => s.forceSettings);
  const forceCustomized = useGraphStore((s) => s.forceCustomized);
  const animateRequest = useGraphStore((s) => s.animateRequest);
  const selectNode = useGraphStore((s) => s.selectNode);
  const expandNode = useGraphStore((s) => s.expandNode);

  const { fitView, getViewport } = useReactFlow();
  const positionsRef = useRef(new Map<string, XY>());
  const prevRootRef = useRef<string | null>(null);
  const [rfNodes, setRfNodes] = useState<EntityFlowNode[]>([]);

  // refs para a simulação de forças (painel "Configurar mapa")
  const simRef = useRef<ForceRefiner | null>(null);
  const rfNodesRef = useRef<EntityFlowNode[]>([]);
  rfNodesRef.current = rfNodes;
  const settingsRef = useRef(forceSettings);
  settingsRef.current = forceSettings;
  const customizedRef = useRef(forceCustomized);
  customizedRef.current = forceCustomized;
  const runSimRef = useRef<() => void>(() => {});

  // camadas cumulativas: exibe apenas nós até a camada atual do controle
  const visible = useMemo(() => {
    const depthFiltered = nodes.filter((n) => n.depth <= currentLayer);
    return applyFilters(depthFiltered, links, filters, rootId);
  }, [nodes, links, filters, rootId, currentLayer]);

  const degrees = useMemo(() => degreeMap(visible.links), [visible.links]);

  const buildRfNode = useCallback(
    (n: GraphNode, pos: XY): EntityFlowNode => {
      const isRoot = n.id === rootId;
      const deg = degrees.get(n.id) ?? 1;
      const capital = n.company?.capitalSocial ?? 0;
      const capitalBoost = capital > 0 ? Math.min(6, Math.log10(capital) / 2) : 0;
      const base = n.kind === 'company' ? 34 : 30;
      const radius = isRoot ? 50 : Math.min(46, Math.round(base + Math.min(10, deg * 1.1) + capitalBoost));
      const matrizAtiva = n.company?.matriz === true && n.company?.situacao === 'ATIVA';
      return {
        id: n.id,
        type: 'entity',
        position: pos,
        selected: n.id === selectedNodeId,
        data: {
          kind: nodeKindClass(n),
          isPerson: n.kind === 'person',
          color: nodeColor(n),
          ring: isRoot ? '#0d63e8' : matrizAtiva && !isRoot ? NODE_COLORS.matriz : undefined,
          radius,
          label: n.label,
          subLabel: n.company?.nomeFantasia,
          idLabel: n.kind === 'company' ? formatCNPJ(n.company?.cnpj ?? '') : n.person?.cpf,
          role: n.kind === 'person' && n.person?.administrador ? 'Administrador' : undefined,
          main: isRoot,
          expanded: n.expanded,
          expanding: expandingIds.has(n.id),
          highlighted: n.id === highlightedNodeId,
        },
      };
    },
    [rootId, degrees, selectedNodeId, expandingIds, highlightedNodeId],
  );

  // Sincroniza o grafo do store com os nós do React Flow, preservando posições
  useEffect(() => {
    const pos = positionsRef.current;
    if (prevRootRef.current !== rootId) {
      pos.clear();
      prevRootRef.current = rootId;
    }

    const newcomers = visible.nodes.filter((n) => !pos.has(n.id));
    if (newcomers.length > 0) {
      if (pos.size === 0) {
        // primeira carga: layout radial completo
        const layout = radialLayout(visible.nodes, visible.links, rootId);
        layout.forEach((p, id) => pos.set(id, p));
        setTimeout(() => fitView({ padding: 0.18, duration: 450 }), 60);
      } else {
        // expansão incremental: agrupa os novos nós pelo nó âncora já posicionado
        const taken = [...pos.values()];
        const groups = new Map<string, GraphNode[]>();
        for (const n of newcomers) {
          const link = visible.links.find(
            (l) =>
              (nid(l.source) === n.id && pos.has(nid(l.target))) ||
              (nid(l.target) === n.id && pos.has(nid(l.source))),
          );
          const anchor = link ? (nid(link.source) === n.id ? nid(link.target) : nid(link.source)) : rootId ?? '';
          if (!groups.has(anchor)) groups.set(anchor, []);
          groups.get(anchor)!.push(n);
        }
        for (const [anchorId, group] of groups) {
          const anchorPos = pos.get(anchorId) ?? { x: 0, y: 0 };
          // centroide dos vizinhos já posicionados do âncora → expande na direção oposta
          const neighborPos: XY[] = [];
          for (const l of visible.links) {
            const s = nid(l.source);
            const t = nid(l.target);
            if (s === anchorId && pos.has(t) && !group.some((g) => g.id === t)) neighborPos.push(pos.get(t)!);
            if (t === anchorId && pos.has(s) && !group.some((g) => g.id === s)) neighborPos.push(pos.get(s)!);
          }
          const awayFrom =
            neighborPos.length > 0
              ? {
                  x: neighborPos.reduce((a, p) => a + p.x, 0) / neighborPos.length,
                  y: neighborPos.reduce((a, p) => a + p.y, 0) / neighborPos.length,
                }
              : null;
          const placed = placeAround(anchorPos, awayFrom, group.length, taken);
          group.forEach((n, i) => pos.set(n.id, placed[i]));
        }
      }
    }

    setRfNodes(visible.nodes.map((n) => buildRfNode(n, pos.get(n.id)!)));

    // com forças personalizadas, novos nós disparam o refinamento automático
    if (newcomers.length > 0 && customizedRef.current) {
      const t = setTimeout(() => runSimRef.current(), 150);
      return () => clearTimeout(t);
    }
  }, [visible, rootId, buildRfNode, fitView]);

  // Reorganizar: re-executa o layout radial completo; com forças personalizadas,
  // o refinamento por simulação roda em seguida usando os valores do painel
  useEffect(() => {
    if (organizeRequest === 0) return;
    simRef.current?.stop();
    const layout = radialLayout(visible.nodes, visible.links, rootId);
    const pos = positionsRef.current;
    layout.forEach((p, id) => pos.set(id, p));
    setRfNodes((prev) => prev.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })));
    setTimeout(() => fitView({ padding: 0.16, duration: 500 }), 40);
    if (customizedRef.current) {
      const t = setTimeout(() => runSimRef.current(), 550);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizeRequest]);

  // Busca / breadcrumb: centraliza e aplica zoom no nó
  useEffect(() => {
    if (!focusRequest) return;
    fitView({ nodes: [{ id: focusRequest.nodeId }], maxZoom: 1.55, duration: 500 });
  }, [focusRequest, fitView]);

  // ─── Simulação de forças (refinamento estilo Obsidian) ──────────────────────

  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  /** Enquadra suavemente apenas se algum nó saiu da área visível */
  const fitIfOutOfView = useCallback(() => {
    const pane = document.querySelector('#reactflow-root');
    if (!pane) return;
    const { width, height } = pane.getBoundingClientRect();
    const { x, y, zoom } = getViewport();
    const view = { x0: -x / zoom, y0: -y / zoom, x1: (-x + width) / zoom, y1: (-y + height) / zoom };
    const margin = 40;
    const out = rfNodesRef.current.some(
      (n) =>
        n.position.x < view.x0 - margin ||
        n.position.x > view.x1 + margin ||
        n.position.y < view.y0 - margin ||
        n.position.y > view.y1 + margin,
    );
    if (out) fitView({ padding: 0.16, duration: 500 });
  }, [getViewport, fitView]);

  /**
   * Roda a simulação a partir das posições atuais. Interrompe qualquer
   * simulação anterior; atualiza somente x/y (IDs e dados intactos).
   */
  const runSimulation = useCallback(() => {
    simRef.current?.stop();
    const pos = positionsRef.current;
    const current = rfNodesRef.current;
    if (current.length < 2) return;
    const simNodes: SimNode[] = current.map((n) => ({
      id: n.id,
      x: pos.get(n.id)?.x ?? n.position.x,
      y: pos.get(n.id)?.y ?? n.position.y,
      radius: n.data.radius,
    }));
    const simLinks = visibleRef.current.links.map((l) => ({ source: nid(l.source), target: nid(l.target) }));
    const refiner = new ForceRefiner(simNodes, simLinks, settingsRef.current);
    simRef.current = refiner;
    refiner.start(
      (ns) => {
        const byId = new Map(ns.map((n) => [n.id, n]));
        for (const n of ns) pos.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
        setRfNodes((prev) =>
          prev.map((n) => {
            const s = byId.get(n.id);
            return s ? { ...n, position: { x: s.x ?? 0, y: s.y ?? 0 } } : n;
          }),
        );
      },
      () => fitIfOutOfView(),
    );
  }, [fitIfOutOfView]);
  runSimRef.current = runSimulation;

  // slider movido → debounce curto, sem fitView a cada passo
  const settingsTouched = useRef(false);
  useEffect(() => {
    if (!settingsTouched.current) {
      settingsTouched.current = true;
      return; // primeira renderização (inclusive valores vindos do localStorage)
    }
    const t = setTimeout(() => runSimulation(), 300);
    return () => clearTimeout(t);
  }, [forceSettings, runSimulation]);

  // botão "Animar"
  useEffect(() => {
    if (animateRequest === 0) return;
    runSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateRequest]);

  // simulação nunca briga com o arrasto manual
  const onNodeDragStart = useCallback(() => {
    simRef.current?.stop();
  }, []);

  useEffect(() => () => simRef.current?.stop(), []);

  const rfEdges = useMemo<FloatingFlowEdge[]>(() => {
    const nodeById = new Map(visible.nodes.map((n) => [n.id, n]));
    return visible.links.map((l) => {
      const s = nid(l.source);
      const t = nid(l.target);
      const color = LINK_COLORS[l.type];
      const targetNode = nodeById.get(t);
      const sourceNode = nodeById.get(s);
      const involvesBaixada =
        targetNode?.company?.situacao === 'BAIXADA' || sourceNode?.company?.situacao === 'BAIXADA';
      const label = RELATION_LABELS[l.type];
      return {
        id: l.id,
        source: s,
        target: t,
        type: 'floating',
        data: {
          color,
          label,
          dashed: l.meta.situacao === 'RETIRADO' || involvesBaixada,
        },
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color },
      };
    });
  }, [visible]);

  const onNodesChange = useCallback((changes: NodeChange<EntityFlowNode>[]) => {
    setRfNodes((prev) => applyNodeChanges(changes, prev));
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position && !ch.dragging) {
        positionsRef.current.set(ch.id, ch.position);
      }
    }
  }, []);

  // um clique seleciona (painel de detalhes); dois cliques expandem as conexões
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: EntityFlowNode) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: EntityFlowNode) => {
      selectNode(node.id);
      if (!node.data.expanded) void expandNode(node.id);
    },
    [selectNode, expandNode],
  );

  return (
    <div id="reactflow-root" aria-label="Mapa societário interativo">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDragStart={onNodeDragStart}
        onPaneClick={() => selectNode(null)}
        zoomOnDoubleClick={false}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        minZoom={0.15}
        maxZoom={1.8}
        nodesConnectable={false}
        edgesReconnectable={false}
        proOptions={{ hideAttribution: true }}
        colorMode={theme}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#d5dde8" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </div>
  );
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
