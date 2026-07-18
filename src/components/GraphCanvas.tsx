import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { useGraphStore } from '../store/graphStore';
import { applyFilters, degreeMap } from '../lib/filtering';
import { LINK_COLORS, NODE_COLORS, RELATION_LABELS, nodeColor } from '../lib/colors';
import type { GraphLink, GraphNode } from '../types/graph';
import { MiniMap } from './MiniMap';

const nid = (v: string | GraphNode) => (typeof v === 'string' ? v : v.id);

interface Props {
  containerRef: React.RefObject<HTMLDivElement>;
}

export function GraphCanvas({ containerRef }: Props) {
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  const nodes = useGraphStore((s) => s.nodes);
  const links = useGraphStore((s) => s.links);
  const filters = useGraphStore((s) => s.filters);
  const rootId = useGraphStore((s) => s.rootId);
  const theme = useGraphStore((s) => s.theme);
  const selectNode = useGraphStore((s) => s.selectNode);
  const expandNode = useGraphStore((s) => s.expandNode);
  const expandingIds = useGraphStore((s) => s.expandingIds);
  const highlightedNodeId = useGraphStore((s) => s.highlightedNodeId);
  const focusRequest = useGraphStore((s) => s.focusRequest);

  // Responsividade do canvas
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const filtered = applyFilters(nodes, links, filters, rootId);
    return { nodes: filtered.nodes, links: filtered.links };
  }, [nodes, links, filters, rootId]);

  const degrees = useMemo(() => degreeMap(graphData.links), [graphData.links]);

  // Física: evita sobreposição e mantém a rede legível
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength(-180);
    fg.d3Force('link')?.distance(70);
  }, [graphData.nodes.length]);

  // Centralização/zoom solicitados pela busca ou breadcrumb
  useEffect(() => {
    if (!focusRequest) return;
    const node = graphData.nodes.find((n) => n.id === focusRequest.nodeId);
    const fg = fgRef.current;
    if (node && fg && node.x != null && node.y != null) {
      fg.centerAt(node.x, node.y, 800);
      fg.zoom(3, 800);
    }
  }, [focusRequest, graphData.nodes]);

  const nodeRadius = useCallback(
    (node: GraphNode) => {
      const deg = degrees.get(node.id) ?? 1;
      const capital = node.company?.capitalSocial ?? 0;
      const capitalBoost = capital > 0 ? Math.log10(capital) / 4 : 0;
      const base = node.kind === 'company' ? 6 : 5;
      return Math.min(base + deg * 0.8 + capitalBoost, 16);
    },
    [degrees],
  );

  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const r = nodeRadius(node);
      const color = nodeColor(node);
      const isRoot = node.id === rootId;
      const isHighlighted = node.id === highlightedNodeId;
      const isExpanding = expandingIds.has(node.id);
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      // halo para raiz / destaque de busca
      if (isRoot || isHighlighted) {
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, 2 * Math.PI);
        ctx.fillStyle = isHighlighted ? 'rgba(250, 204, 21, 0.35)' : 'rgba(139, 92, 246, 0.3)';
        ctx.fill();
      }

      ctx.beginPath();
      if (node.kind === 'company') {
        // empresas: quadrado arredondado; pessoas: círculo
        const s = r * 1.7;
        ctx.roundRect(x - s / 2, y - s / 2, s, s, s * 0.25);
      } else {
        ctx.arc(x, y, r, 0, 2 * Math.PI);
      }
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.5 / globalScale;
      ctx.strokeStyle = theme === 'dark' ? '#0f172a' : '#ffffff';
      ctx.stroke();

      // matriz ganha um anel roxo
      if (node.company?.matriz && node.kind === 'company' && node.company.situacao === 'ATIVA') {
        ctx.beginPath();
        ctx.arc(x, y, r + 2, 0, 2 * Math.PI);
        ctx.strokeStyle = NODE_COLORS.matriz;
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
      }

      // indicador de nó ainda não expandido
      if (!node.expanded && !isExpanding) {
        ctx.beginPath();
        ctx.arc(x + r * 0.9, y - r * 0.9, 2.6, 0, 2 * Math.PI);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
      }
      if (isExpanding) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3, (Date.now() / 200) % (2 * Math.PI), ((Date.now() / 200) % (2 * Math.PI)) + Math.PI);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // rótulo (visível a partir de um certo zoom)
      if (globalScale > 1.1) {
        const label = node.label.length > 28 ? node.label.slice(0, 26) + '…' : node.label;
        const fontSize = Math.max(11 / globalScale, 2.6);
        ctx.font = `${node.kind === 'company' ? '600' : '400'} ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = theme === 'dark' ? '#e2e8f0' : '#1e293b';
        ctx.fillText(label, x, y + r + 2);
      }
    },
    [nodeRadius, rootId, highlightedNodeId, expandingIds, theme],
  );

  const paintLinkLabel = useCallback(
    (link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (globalScale < 2.2) return; // legenda da linha aparece ao aproximar
      const s = link.source as GraphNode;
      const t = link.target as GraphNode;
      if (s.x == null || t.x == null) return;
      const mx = (s.x + (t.x ?? 0)) / 2;
      const my = ((s.y ?? 0) + (t.y ?? 0)) / 2;
      let label = RELATION_LABELS[link.type];
      if (link.meta.percentual) label += ` · ${link.meta.percentual}%`;
      const fontSize = 3;
      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
      const w = ctx.measureText(label).width + 2;
      ctx.fillStyle = theme === 'dark' ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.85)';
      ctx.fillRect(mx - w / 2, my - fontSize / 2 - 0.5, w, fontSize + 1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = LINK_COLORS[link.type];
      ctx.fillText(label, mx, my);
    },
    [theme],
  );

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      selectNode(node.id);
      if (!node.expanded) void expandNode(node.id);
      fgRef.current?.centerAt(node.x, node.y, 600);
    },
    [selectNode, expandNode],
  );

  return (
    <div ref={wrapperRef} className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full">
        <ForceGraph2D
          ref={fgRef}
          width={size.width}
          height={size.height}
          graphData={graphData}
          backgroundColor={theme === 'dark' ? '#0f172a' : '#f8fafc'}
          nodeId="id"
          nodeLabel={(n) => `${n.kind === 'company' ? '🏢' : '👤'} ${n.label}`}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node, color, ctx) => {
            const r = nodeRadius(node) + 4;
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          linkColor={(l) => LINK_COLORS[(l as GraphLink).type]}
          linkWidth={(l) => (((l as GraphLink).meta.percentual ?? 20) > 50 ? 2.4 : 1.4)}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={0.92}
          linkCurvature={(l) => {
            // curva leve quando há múltiplos vínculos entre o mesmo par
            const link = l as GraphLink;
            const same = graphData.links.filter(
              (x) => nid(x.source) === nid(link.source) && nid(x.target) === nid(link.target),
            );
            return same.length > 1 ? 0.25 * same.indexOf(link) : 0;
          }}
          linkCanvasObjectMode={() => 'after'}
          linkCanvasObject={paintLinkLabel}
          onNodeClick={handleNodeClick}
          onBackgroundClick={() => selectNode(null)}
          onNodeDragEnd={(node) => {
            // fixa o nó onde o usuário soltou; duplo clique libera
            node.fx = node.x;
            node.fy = node.y;
          }}
          onNodeRightClick={(node) => {
            node.fx = undefined;
            node.fy = undefined;
          }}
          cooldownTicks={120}
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.35}
          enableNodeDrag
          minZoom={0.2}
          maxZoom={12}
        />
      </div>
      <MiniMap nodes={graphData.nodes} theme={theme} />
    </div>
  );
}
