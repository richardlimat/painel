import { FormEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { useGraphStore } from '../store/graphStore';
import { isValidCNPJ, maskCNPJ, onlyDigits } from '../lib/format';

const EXAMPLES = [
  { label: 'Exemplo A', cnpj: '12345678000190' },
  { label: 'Exemplo B', cnpj: '98765432000155' },
  { label: 'Exemplo C', cnpj: '11222333000144' },
];

/** Tela inicial: informa o CNPJ raiz, o provedor e o limite de camadas */
export function SearchForm() {
  const startSearch = useGraphStore((s) => s.startSearch);
  const loading = useGraphStore((s) => s.loading);
  const error = useGraphStore((s) => s.error);
  const providerMode = useGraphStore((s) => s.providerMode);
  const setProviderMode = useGraphStore((s) => s.setProviderMode);
  const maxDepth = useGraphStore((s) => s.maxDepth);
  const setMaxDepth = useGraphStore((s) => s.setMaxDepth);
  const [cnpj, setCnpj] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const digits = onlyDigits(cnpj);
    if (digits.length !== 14) {
      setValidationError('Informe um CNPJ com 14 dígitos.');
      return;
    }
    if (providerMode === 'brasilapi' && !isValidCNPJ(digits)) {
      setValidationError('CNPJ inválido (dígitos verificadores não conferem).');
      return;
    }
    setValidationError(null);
    void startSearch(digits);
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="mb-6 text-center">
          <div className="mb-2 text-4xl">🕸️</div>
          <h1 className="text-xl font-bold text-slate-900">Painel de Consultas</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Informe um CNPJ para descobrir toda a estrutura societária: sócios, empresas relacionadas e conexões
            indiretas, camada por camada.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="cnpj" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              CNPJ
            </label>
            <input
              id="cnpj"
              value={cnpj}
              onChange={(e) => setCnpj(maskCNPJ(e.target.value))}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg tracking-wide text-slate-900 placeholder-slate-300 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Fonte de dados
              </label>
              <select
                value={providerMode}
                onChange={(e) => setProviderMode(e.target.value as 'demo' | 'brasilapi')}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="demo">Demonstração (rede sintética)</option>
                <option value="brasilapi">BrasilAPI (Receita Federal)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Limite de níveis
              </label>
              <select
                value={maxDepth === Infinity ? 'inf' : maxDepth}
                onChange={(e) => setMaxDepth(e.target.value === 'inf' ? Infinity : Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value={3}>3 níveis</option>
                <option value={5}>5 níveis</option>
                <option value={10}>10 níveis</option>
                <option value="inf">Ilimitado</option>
              </select>
            </div>
          </div>

          {providerMode === 'brasilapi' && (
            <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              A BrasilAPI (dados abertos) retorna o quadro societário de cada CNPJ, mas não suporta a busca reversa
              CPF → empresas. Para expansão completa em múltiplas camadas, use o modo demonstração ou configure um
              provedor comercial.
            </p>
          )}

          {(validationError || error) && (
            <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">
              {validationError ?? error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white shadow-lg shadow-gray-900/20 transition hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? 'Consultando…' : 'Mapear estrutura societária'}
          </button>
        </form>

        {providerMode === 'demo' && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
            Testar com:
            {EXAMPLES.map((ex) => (
              <button
                key={ex.cnpj}
                onClick={() => setCnpj(maskCNPJ(ex.cnpj))}
                className="rounded-full border border-slate-200 px-2.5 py-1 hover:border-gray-500 hover:text-gray-900 dark:border-slate-700"
              >
                {ex.label}
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
