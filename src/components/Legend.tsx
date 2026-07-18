import { useState } from 'react';
import { LINK_COLORS, NODE_LEGEND, RELATION_LABELS } from '../lib/colors';
import type { RelationType } from '../types/graph';

export function Legend() {
  const [open, setOpen] = useState(true);

  return (
    <div className="absolute bottom-4 left-4 z-10 max-w-[220px] rounded-xl border border-slate-200/80 bg-white/90 text-xs shadow-lg backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/90">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 font-semibold text-slate-700 dark:text-slate-200"
      >
        Legenda
        <span className="text-slate-400">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto px-3 pb-3">
          <p className="mb-1 mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Nós</p>
          {NODE_LEGEND.map((item) => (
            <div key={item.label} className="flex items-center gap-2 py-0.5 text-slate-600 dark:text-slate-300">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </div>
          ))}
          <p className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Conexões</p>
          {(Object.keys(LINK_COLORS) as RelationType[]).map((type) => (
            <div key={type} className="flex items-center gap-2 py-0.5 text-slate-600 dark:text-slate-300">
              <span className="h-0.5 w-4 shrink-0 rounded" style={{ backgroundColor: LINK_COLORS[type] }} />
              {RELATION_LABELS[type]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
