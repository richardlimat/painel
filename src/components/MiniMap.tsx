import { useEffect, useRef } from 'react';
import type { GraphNode } from '../types/graph';
import { nodeColor } from '../lib/colors';

interface Props {
  nodes: GraphNode[];
  theme: 'light' | 'dark';
}

/** Mini mapa da rede: desenha a posição de todos os nós em escala reduzida */
export function MiniMap({ nodes, theme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = theme === 'dark' ? 'rgba(30,41,59,0.9)' : 'rgba(241,245,249,0.9)';
      ctx.fillRect(0, 0, W, H);

      const positioned = nodes.filter((n) => n.x != null && n.y != null);
      if (positioned.length > 1) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of positioned) {
          minX = Math.min(minX, n.x!);
          maxX = Math.max(maxX, n.x!);
          minY = Math.min(minY, n.y!);
          maxY = Math.max(maxY, n.y!);
        }
        const pad = 10;
        const sx = (W - pad * 2) / Math.max(maxX - minX, 1);
        const sy = (H - pad * 2) / Math.max(maxY - minY, 1);
        const s = Math.min(sx, sy);
        for (const n of positioned) {
          ctx.beginPath();
          ctx.arc(pad + (n.x! - minX) * s, pad + (n.y! - minY) * s, n.kind === 'company' ? 2.2 : 1.6, 0, 2 * Math.PI);
          ctx.fillStyle = nodeColor(n);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [nodes, theme]);

  if (nodes.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={110}
      className="absolute bottom-4 right-4 z-10 hidden rounded-lg border border-slate-300/60 shadow-md dark:border-slate-600/60 sm:block"
      aria-label="Mini mapa da rede"
    />
  );
}
