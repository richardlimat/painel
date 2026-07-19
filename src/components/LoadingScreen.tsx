import { motion } from 'framer-motion';
import { useGraphStore } from '../store/graphStore';

const PHASE_LABEL: Record<string, string> = {
  company: 'Consultando empresa…',
  'company-found': 'Empresa encontrada…',
  profiles: 'Consultando perfis…',
  preparing: 'Preparando mapa…',
};

/** Tela cheia, centralizada — some assim que o mapa é liberado (rootId setado) ou volta pra tela de decisão em caso de falha. */
export function LoadingScreen() {
  const searchPhase = useGraphStore((s) => s.searchPhase);
  const searchProfilesTotal = useGraphStore((s) => s.searchProfilesTotal);
  const searchProfilesDone = useGraphStore((s) => s.searchProfilesDone);

  const subtitle =
    searchPhase === 'profiles' && searchProfilesTotal > 0
      ? `Consultando perfis: ${searchProfilesDone} de ${searchProfilesTotal}`
      : (PHASE_LABEL[searchPhase] ?? 'Só um instante…');

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-6 bg-slate-100 dark:bg-slate-950">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-6"
      >
        <div
          role="status"
          aria-label="Carregando"
          className="h-16 w-16 animate-spin rounded-full border-4 border-slate-300 border-t-gray-900 dark:border-slate-700 dark:border-t-white"
        />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Carregando...</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </motion.div>
    </div>
  );
}
