import { useMemo, useState } from 'react';
import { useGraphStore } from '../store/graphStore';
import { normalizeText, onlyDigits } from '../lib/format';

/** Busca inteligente dentro do grafo: nome, CPF, CNPJ, razão social, fantasia */
export function SearchBar() {
  const nodes = useGraphStore((s) => s.nodes);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);
  const focusNode = useGraphStore((s) => s.focusNode);
  const selectNode = useGraphStore((s) => s.selectNode);
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = normalizeText(searchQuery.trim());
    const qDigits = onlyDigits(searchQuery);
    if (q.length < 2) return [];
    return nodes
      .filter((n) => {
        if (normalizeText(n.label).includes(q)) return true;
        if (n.company) {
          if (qDigits && onlyDigits(n.company.cnpj).includes(qDigits)) return true;
          if (n.company.nomeFantasia && normalizeText(n.company.nomeFantasia).includes(q)) return true;
        }
        if (n.person && qDigits.length >= 3 && onlyDigits(n.person.cpf).includes(qDigits)) return true;
        return false;
      })
      .slice(0, 8);
  }, [nodes, searchQuery]);

  return (
    <div className="relative w-full max-w-xs">
      <input
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar nome, CPF, CNPJ…"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        aria-label="Buscar no grafo"
      />
      {open && matches.length > 0 && (
        <ul className="absolute top-full z-40 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
          {matches.map((n) => (
            <li key={n.id}>
              <button
                className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 dark:hover:bg-slate-700"
                onMouseDown={() => {
                  focusNode(n.id);
                  selectNode(n.id);
                  setOpen(false);
                }}
              >
                <span className="block truncate font-medium text-slate-800 dark:text-slate-200">
                  {n.kind === 'company' ? '🏢' : '👤'} {n.label}
                </span>
                <span className="text-xs text-slate-400">
                  {n.kind === 'company' ? n.company?.cnpj : n.person?.cpf}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
