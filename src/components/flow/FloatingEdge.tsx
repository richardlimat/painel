import { BaseEdge, EdgeLabelRenderer, getStraightPath, useInternalNode, type EdgeProps, type Edge } from '@xyflow/react';

export interface FlowEdgeData extends Record<string, unknown> {
  color: string;
  label: string;
  dashed?: boolean;
  width?: number;
}

export type FloatingFlowEdge = Edge<FlowEdgeData, 'floating'>;

const LABEL_WIDTH = 150; // largura do cartão rf-entity (círculo centralizado)

/**
 * Aresta "flutuante": liga a borda do círculo de origem à borda do círculo de
 * destino, independentemente de onde os nós estejam (bordas circulares).
 */
export function FloatingEdge({ id, source, target, data, markerEnd }: EdgeProps<FloatingFlowEdge>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode || !data) return null;

  const sr = (sourceNode.data.radius as number) ?? 32;
  const tr = (targetNode.data.radius as number) ?? 32;

  // centro dos círculos: o círculo fica no topo/centro do cartão de 150px
  const sx = sourceNode.internals.positionAbsolute.x + LABEL_WIDTH / 2;
  const sy = sourceNode.internals.positionAbsolute.y + sr + 3;
  const tx = targetNode.internals.positionAbsolute.x + LABEL_WIDTH / 2;
  const ty = targetNode.internals.positionAbsolute.y + tr + 3;

  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;

  const [path, labelX, labelY] = getStraightPath({
    sourceX: sx + ux * (sr + 5),
    sourceY: sy + uy * (sr + 5),
    targetX: tx - ux * (tr + 9),
    targetY: ty - uy * (tr + 9),
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: data.color,
          strokeWidth: data.width ?? 1.8,
          strokeDasharray: data.dashed ? '5 5' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="rf-edge-label nodrag nopan"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            color: data.color,
          }}
        >
          {data.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
