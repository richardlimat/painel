import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useGraphStore } from '../store/graphStore';
import { caretPositionForDigitCount, isValidCNPJ, isValidCPF, maskCNPJ, maskCPF, onlyDigits, formatDate } from '../lib/format';
import { applyMask } from '../lib/mask';
import { listSavedQueries, getSavedQuery, type SavedQuerySummary } from '../services/savedQueries';

const LOGO_URL = 'https://aisfizoyfpcisykarrnt.supabase.co/storage/v1/object/public/imagens/LOGO%20TRIAD3%20.png';

const LOCKED_TABS = ['SMS', 'Placa', 'Email', 'Nome'];

const RECENT_LIMIT = 5;

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M3 3l18 18" />}
    </svg>
  );
}

/** "Consultas recentes": nomes mascarados por padrão, alterna com o botão "Ocultas"/"Reveladas". */
function RecentQueries({ onOpenAll }: { onOpenAll?: () => void }) {
  const hydrateFromSnapshot = useGraphStore((s) => s.hydrateFromSnapshot);
  const [items, setItems] = useState<SavedQuerySummary[] | null>(null);
  const [hidden, setHidden] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSavedQueries()
      .then((list) => {
        if (!cancelled) setItems(list.slice(0, RECENT_LIMIT));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpen = async (id: string) => {
    setOpeningId(id);
    setError(null);
    try {
      const detail = await getSavedQuery(id);
      hydrateFromSnapshot(detail.snapshot, detail.photoUrlsByPersonId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao abrir a consulta.');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="mt-8 w-full border-t border-slate-300 pt-4 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Consultas recentes</span>
        <button
          type="button"
          onClick={() => setHidden((h) => !h)}
          className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
        >
          <EyeIcon crossed={hidden} />
          {hidden ? 'Ocultas' : 'Reveladas'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <ul className="mt-3 space-y-1.5">
        {items === null && <li className="text-xs text-slate-400">Carregando…</li>}
        {items?.length === 0 && <li className="text-xs text-slate-400">Nenhuma consulta recente.</li>}
        {items?.map((item) => {
          const label = item.titulo?.trim() || item.cnpj_raiz;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void handleOpen(item.id)}
                disabled={openingId === item.id}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white disabled:opacity-50 dark:hover:bg-slate-800"
              >
                <span className="text-slate-700 dark:text-slate-200">{applyMask(label, 'soft', !hidden)}</span>
                <span className="text-xs text-slate-400">
                  {openingId === item.id ? 'Abrindo…' : formatDate(item.created_at)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {onOpenAll && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onOpenAll}
            className="group flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-cyan-500/40 dark:hover:bg-slate-700 dark:hover:text-cyan-300"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16v16H4z" />
              <path d="M8 4v16M4 9h4" />
            </svg>
            Ver todas as consultas salvas
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="transition group-hover:translate-x-0.5"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Tela inicial: informa o CNPJ raiz. Enquanto a busca está em andamento
 * (`loading`), o App renderiza `LoadingScreen` em vez deste componente —
 * por isso não há feedback de progresso aqui, só o resultado (erro) ou a
 * tela de decisão de falha parcial.
 */
export function SearchForm({ onOpenSavedQueries }: { onOpenSavedQueries?: () => void }) {
  const startSearch = useGraphStore((s) => s.startSearch);
  const startPersonSearch = useGraphStore((s) => s.startPersonSearch);
  const retryFailedSearchProfiles = useGraphStore((s) => s.retryFailedSearchProfiles);
  const continueWithAvailableData = useGraphStore((s) => s.continueWithAvailableData);
  const error = useGraphStore((s) => s.error);
  const searchPhase = useGraphStore((s) => s.searchPhase);
  const searchProfilesTotal = useGraphStore((s) => s.searchProfilesTotal);
  const searchFailedCpfs = useGraphStore((s) => s.searchFailedCpfs);
  const maxDepth = useGraphStore((s) => s.maxDepth);
  const setMaxDepth = useGraphStore((s) => s.setMaxDepth);
  const [mode, setMode] = useState<'cnpj' | 'cpf'>('cnpj');
  const [cnpj, setCnpj] = useState('');
  const [cpf, setCpf] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const switchMode = (m: 'cnpj' | 'cpf') => {
    setMode(m);
    setValidationError(null);
  };

  // Reformata a cada tecla (maskCNPJ/maskCPF) mas devolve o cursor pro lugar
  // certo — sem isso, apagar/editar um dígito no meio do texto reposiciona
  // o cursor pro fim a cada tecla (o React troca o `value` todo e o
  // navegador não sabe onde ele "deveria" continuar).
  const handleMaskedChange = (mask: (v: string) => string, setValue: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const selStart = input.selectionStart ?? input.value.length;
    const digitsBeforeCursor = onlyDigits(input.value.slice(0, selStart)).length;
    const masked = mask(input.value);
    setValue(masked);
    requestAnimationFrame(() => {
      const pos = caretPositionForDigitCount(masked, digitsBeforeCursor);
      input.setSelectionRange(pos, pos);
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'cnpj') {
      const digits = onlyDigits(cnpj);
      if (digits.length !== 14) {
        setValidationError('Informe um CNPJ com 14 dígitos.');
        return;
      }
      if (!isValidCNPJ(digits)) {
        setValidationError('CNPJ inválido (dígitos verificadores não conferem).');
        return;
      }
      setValidationError(null);
      void startSearch(digits);
    } else {
      const digits = onlyDigits(cpf);
      if (digits.length !== 11) {
        setValidationError('Informe um CPF com 11 dígitos.');
        return;
      }
      if (!isValidCPF(digits)) {
        setValidationError('CPF inválido (dígitos verificadores não conferem).');
        return;
      }
      setValidationError(null);
      void startPersonSearch(digits);
    }
  };

  return (
    <div className="flex min-h-full flex-col items-center p-6 pt-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex w-full max-w-3xl flex-col items-center"
      >
        <div className="mb-3 h-40 w-40 flex-none overflow-hidden rounded-full bg-black">
          <img src={LOGO_URL} alt="TRIAD3" className="h-full w-full object-contain" />
        </div>
        <h1 className="mb-6 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          PAINEL DE CONSULTAS
        </h1>

        <div className="mb-5 flex flex-nowrap items-center justify-center gap-x-3 whitespace-nowrap rounded-2xl bg-white px-6 py-3 text-sm shadow-md dark:bg-slate-800">
          <button
            type="button"
            onClick={() => switchMode('cnpj')}
            className={
              mode === 'cnpj'
                ? 'rounded-full bg-cyan-400 px-4 py-1.5 font-semibold text-slate-900'
                : 'rounded-full px-4 py-1.5 font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }
          >
            CNPJ
          </button>
          <span className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
          <button
            type="button"
            onClick={() => switchMode('cpf')}
            className={
              mode === 'cpf'
                ? 'rounded-full bg-cyan-400 px-4 py-1.5 font-semibold text-slate-900'
                : 'rounded-full px-4 py-1.5 font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }
          >
            Consulta Avançada
          </button>
          {LOCKED_TABS.map((tab) => (
            <span key={tab} className="flex items-center gap-3 text-slate-400">
              <span className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
              <span className="flex items-center gap-1" title="Ainda não disponível">
                {tab} <LockIcon />
              </span>
            </span>
          ))}
        </div>

        <form onSubmit={submit} className="w-full space-y-4">
          <div className="flex items-center gap-2 rounded-2xl bg-white p-2 pl-4 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-600">
            <svg className="h-5 w-5 flex-none text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            {mode === 'cnpj' ? (
              <input
                id="cnpj"
                value={cnpj}
                onChange={handleMaskedChange(maskCNPJ, setCnpj)}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
                className="min-w-0 flex-1 border-0 bg-transparent py-2 text-base tracking-wide text-slate-900 placeholder-slate-300 focus:outline-none dark:text-white"
                autoFocus
              />
            ) : (
              <input
                id="cpf"
                value={cpf}
                onChange={handleMaskedChange(maskCPF, setCpf)}
                placeholder="000.000.000-00"
                inputMode="numeric"
                className="min-w-0 flex-1 border-0 bg-transparent py-2 text-base tracking-wide text-slate-900 placeholder-slate-300 focus:outline-none dark:text-white"
                autoFocus
              />
            )}
            <button
              type="submit"
              className="flex flex-none items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-cyan-300"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              Buscar
            </button>
          </div>

          <div className="flex items-center justify-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 17l6-6 4 4 8-8M21 3h-6M21 3v6" />
              </svg>
              +67M empresas homologadas
            </span>
            <span className="h-3 w-px bg-slate-300 dark:bg-slate-600" />
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="12" cy="5" rx="8" ry="3" />
                <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
              </svg>
              +1M requisições diárias
            </span>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs">
            <label htmlFor="maxDepth" className="text-slate-400">
              Limite de níveis:
            </label>
            <select
              id="maxDepth"
              value={maxDepth === Infinity ? 'inf' : maxDepth}
              onChange={(e) => setMaxDepth(e.target.value === 'inf' ? Infinity : Number(e.target.value))}
              className="rounded-md border border-slate-200 bg-transparent px-1.5 py-0.5 text-slate-500 dark:border-slate-700 dark:text-slate-400"
            >
              <option value={3}>3 níveis</option>
              <option value={5}>5 níveis</option>
              <option value={10}>10 níveis</option>
              <option value="inf">Ilimitado</option>
            </select>
          </div>

          {(validationError || error) && (
            <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">
              {validationError ?? error}
            </p>
          )}

          {searchPhase === 'awaiting-decision' && (
            <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              <p>
                {searchFailedCpfs.length} de {searchProfilesTotal} perfil(is) não puderam ser carregados agora. O mapa
                ainda não foi aberto.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void retryFailedSearchProfiles()}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  Tentar novamente
                </button>
                <button
                  type="button"
                  onClick={continueWithAvailableData}
                  className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/50"
                >
                  Continuar com os dados disponíveis
                </button>
              </div>
            </div>
          )}
        </form>

        <RecentQueries onOpenAll={onOpenSavedQueries} />
      </motion.div>
    </div>
  );
}
