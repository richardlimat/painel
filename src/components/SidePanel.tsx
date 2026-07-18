import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { useGraphStore } from '../store/graphStore';
import { formatCNPJ, formatCurrency, formatDate } from '../lib/format';
import { RELATION_LABELS } from '../lib/colors';
import type { GraphLink, GraphNode } from '../types/graph';

const nid = (v: string | GraphNode) => (typeof v === 'string' ? v : v.id);

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2 last:border-0 dark:border-slate-700/50">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      <span className="text-sm text-slate-800 dark:text-slate-200">{value}</span>
    </div>
  );
}

export function SidePanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodeIndex = useGraphStore((s) => s.nodeIndex);
  const links = useGraphStore((s) => s.links);
  const timeline = useGraphStore((s) => s.timeline);
  const selectNode = useGraphStore((s) => s.selectNode);
  const focusNode = useGraphStore((s) => s.focusNode);
  const expandNode = useGraphStore((s) => s.expandNode);

  const node = selectedNodeId ? nodeIndex.get(selectedNodeId) : null;

  const related = useMemo(() => {
    if (!node) return [];
    return links
      .filter((l) => nid(l.source) === node.id || nid(l.target) === node.id)
      .map((l) => {
        const otherId = nid(l.source) === node.id ? nid(l.target) : nid(l.source);
        return { link: l, other: nodeIndex.get(otherId) };
      })
      .filter((r): r is { link: GraphLink; other: GraphNode } => !!r.other);
  }, [node, links, nodeIndex]);

  const history = useMemo(
    () => (node ? timeline.filter((t) => t.nodeId === node.id).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [node, timeline],
  );

  const relatedCompanies = related.filter((r) => r.other.kind === 'company');
  const relatedPeople = related.filter((r) => r.other.kind === 'person');

  return (
    <AnimatePresence>
      {node && (
        <motion.aside
          key={node.id}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:w-96"
          role="dialog"
          aria-label="Detalhes do nó"
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 p-4 dark:border-slate-700">
            <div>
              <span
                className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  node.kind === 'company'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                }`}
              >
                {node.kind === 'company' ? 'Empresa' : 'Pessoa'} · Camada {node.depth}
              </span>
              <h2 className="text-base font-semibold leading-tight text-slate-900 dark:text-white">{node.label}</h2>
            </div>
            <button
              onClick={() => selectNode(null)}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              aria-label="Fechar painel"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {node.kind === 'company' && node.company && (
              <>
                <Row label="CNPJ" value={formatCNPJ(node.company.cnpj)} />
                <Row label="Razão Social" value={node.company.razaoSocial} />
                <Row label="Nome Fantasia" value={node.company.nomeFantasia} />
                <Row label="Situação Cadastral" value={node.company.situacao} />
                <Row
                  label="CNAE Principal"
                  value={node.company.cnaePrincipal ? `${node.company.cnaePrincipal.codigo} — ${node.company.cnaePrincipal.descricao}` : undefined}
                />
                {node.company.cnaesSecundarios && node.company.cnaesSecundarios.length > 0 && (
                  <Row
                    label="CNAEs Secundários"
                    value={node.company.cnaesSecundarios.map((c) => `${c.codigo} — ${c.descricao}`).join(' · ')}
                  />
                )}
                <Row label="Natureza Jurídica" value={node.company.naturezaJuridica} />
                <Row label="Capital Social" value={formatCurrency(node.company.capitalSocial)} />
                <Row label="Data de Abertura" value={formatDate(node.company.dataAbertura)} />
                <Row label="Endereço" value={node.company.endereco} />
                <Row
                  label="Município / UF"
                  value={[node.company.municipio, node.company.uf].filter(Boolean).join(' / ')}
                />
                <Row label="Telefone" value={node.company.telefone} />
                <Row label="E-mail" value={node.company.email} />
                <Row label="Matriz / Filial" value={node.company.matriz == null ? undefined : node.company.matriz ? 'Matriz' : 'Filial'} />
                <Row label="Quantidade de sócios" value={relatedPeople.length} />
                <Row label="Empresas relacionadas" value={relatedCompanies.length} />
              </>
            )}

            {node.kind === 'person' && node.person && (
              <>
                <Row label="Nome" value={node.person.nome} />
                <Row label="CPF" value={node.person.cpf} />
                <Row label="Administrador" value={node.person.administrador ? 'Sim' : 'Não'} />
                <Row label="Quantidade de participações" value={relatedCompanies.length} />
                <Row
                  label="Funções exercidas"
                  value={[...new Set(related.map((r) => r.link.meta.funcao ?? RELATION_LABELS[r.link.type]))].join(' · ')}
                />
              </>
            )}

            {!node.expanded && (
              <button
                onClick={() => void expandNode(node.id)}
                className="mt-3 w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Expandir conexões deste nó
              </button>
            )}

            {related.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {node.kind === 'company' ? 'Quadro societário e participações' : 'Empresas em que participa'}
                </h3>
                <ul className="space-y-1.5">
                  {related.map(({ link, other }) => (
                    <li key={link.id}>
                      <button
                        onClick={() => {
                          selectNode(other.id);
                          focusNode(other.id);
                        }}
                        className="w-full rounded-lg border border-slate-200 p-2 text-left text-sm hover:border-indigo-400 hover:bg-indigo-50/50 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        <span className="block font-medium text-slate-800 dark:text-slate-200">
                          {other.kind === 'company' ? '🏢' : '👤'} {other.label}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {link.meta.funcao ?? RELATION_LABELS[link.type]}
                          {link.meta.percentual ? ` · ${link.meta.percentual}%` : ''}
                          {link.meta.dataEntrada ? ` · desde ${formatDate(link.meta.dataEntrada)}` : ''}
                          {link.meta.situacao === 'RETIRADO' ? ' · retirado' : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {history.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Histórico societário</h3>
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  {history.map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 font-mono">{formatDate(h.date)}</span>
                      <span>{h.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
