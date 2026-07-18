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
  const maxDepth = useGraphStore((s) => s.maxDepth);
  const theme = useGraphStore((s) => s.theme);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const expandingIds = useGraphStore((s) => s.expandingIds);
  const highlightedNodeId = useGraphStore((s) => s.highlightedNodeId);
  const focusRequest = useGraphStore((s) => s.focusRequest);
  const organizeRequest = useGraphStore((s) => s.organizeRequest);
  const selectNode = useGraphStore((s) => s.selectNode);
  const expandNode = useGraphStore((s) => s.expandNode);

  const { fitView } = useReactFlow();
  const positionsRef = useRef(new Map<string, XY>());
  const prevRootRef = useRef<string | null>(null);
  const [rfNodes, setRfNodes] = useState<EntityFlowNode[]>([]);

  const visible = useMemo(() => {
    const depthFiltered = nodes.filter((n) => n.depth <= maxDepth);
    return applyFilters(depthFiltered, links, filters, rootId);
  }, [nodes, links, filters, rootId, maxDepth]);

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
  }, [visible, rootId, buildRfNode, fitView]);

  // Reorganizar: re-executa o layout radial completo
  useEffect(() => {
    if (organizeRequest === 0) return;
    const layout = radialLayout(visible.nodes, visible.links, rootId);
    const pos = positionsRef.current;
    layout.forEach((p, id) => pos.set(id, p));
    setRfNodes((prev) => prev.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })));
    setTimeout(() => fitView({ padding: 0.16, duration: 500 }), 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizeRequest]);

  // Busca / breadcrumb: centraliza e aplica zoom no nó
  useEffect(() => {
    if (!focusRequest) return;
    fitView({ nodes: [{ id: focusRequest.nodeId }], maxZoom: 1.55, duration: 500 });
  }, [focusRequest, fitView]);

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

  const onNodeClick = useCallback(
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
        onPaneClick={() => selectNode(null)}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        minZoom={0.15}
        maxZoom={1.8}
        nodesConnectable={false}
        edgesReconnectable={false}
        proOptions={{ hideAttribution: true }}
        colorMode={theme}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color={theme === 'dark' ? '#2b3a55' : '#d5dde8'} />
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
