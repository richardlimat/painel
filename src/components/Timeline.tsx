import { useMemo } from 'react';
import { useGraphStore } from '../store/graphStore';
import { formatDate } from '../lib/format';
import type { TimelineEvent } from '../types/graph';

const KIND_STYLE: Record<TimelineEvent['kind'], { color: string; label: string }> = {
  abertura: { color: 'bg-blue-500', label: 'Abertura' },
  entrada_socio: { color: 'bg-emerald-500', label: 'Entrada de sócio' },
  saida_socio: { color: 'bg-red-500', label: 'Saída de sócio' },
  alteracao: { color: 'bg-amber-500', label: 'Alteração' },
};

export function Timeline({ onClose }: { onClose: () => void }) {
  const timeline = useGraphStore((s) => s.timeline);
  const focusNode = useGraphStore((s) => s.focusNode);
  const selectNode = useGraphStore((s) => s.selectNode);

  const sorted = useMemo(() => [...timeline].sort((a, b) => b.date.localeCompare(a.date)), [timeline]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Linha do Tempo</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Fechar linha do tempo">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {sorted.length === 0 && <p className="text-sm text-slate-400">Nenhum evento registrado ainda.</p>}
        <ol className="relative ml-2 border-l border-slate-200 dark:border-slate-700">
          {sorted.map((ev, i) => (
            <li key={i} className="mb-4 ml-4">
              <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${KIND_STYLE[ev.kind].color}`} />
              <time className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {formatDate(ev.date)} · {KIND_STYLE[ev.kind].label}
              </time>
              <button
                onClick={() => {
                  selectNode(ev.nodeId);
                  focusNode(ev.nodeId);
                }}
                className="text-left text-sm text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
              >
                {ev.description}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
