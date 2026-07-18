import { useGraphStore } from '../store/graphStore';

/** Trilha de navegação: Empresa → Sócio → Empresa → … */
export function Breadcrumb() {
  const breadcrumb = useGraphStore((s) => s.breadcrumb);
  const nodeIndex = useGraphStore((s) => s.nodeIndex);
  const selectNode = useGraphStore((s) => s.selectNode);
  const focusNode = useGraphStore((s) => s.focusNode);

  if (breadcrumb.length === 0) return null;

  return (
    <nav
      className="pointer-events-auto absolute left-4 top-4 z-10 flex max-w-[70%] items-center gap-1 overflow-x-auto rounded-lg border border-slate-200/80 bg-white/90 px-2 py-1.5 text-xs shadow backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/90"
      aria-label="Trilha de navegação"
    >
      {breadcrumb.map((id, i) => {
        const node = nodeIndex.get(id);
        if (!node) return null;
        return (
          <span key={id} className="flex shrink-0 items-center gap-1">
            {i > 0 && <span className="text-slate-300 dark:text-slate-600">›</span>}
            <button
              onClick={() => {
                selectNode(id);
                focusNode(id);
              }}
              className={`max-w-[140px] truncate rounded px-1.5 py-0.5 hover:bg-indigo-50 dark:hover:bg-slate-800 ${
                i === breadcrumb.length - 1
                  ? 'font-semibold text-indigo-700 dark:text-indigo-300'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
              title={node.label}
            >
              {node.kind === 'company' ? '🏢' : '👤'} {node.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
