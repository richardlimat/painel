import { motion } from 'framer-motion';

/** Tela cheia, centralizada — some assim que o mapa é liberado (rootId setado) ou volta pra tela de decisão em caso de falha. */
export function LoadingScreen() {
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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Carregando...</h1>
      </motion.div>
    </div>
  );
}
