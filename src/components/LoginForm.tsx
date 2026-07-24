import { FormEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../store/authStore';

const LOGO_URL = 'https://aisfizoyfpcisykarrnt.supabase.co/storage/v1/object/public/imagens/LOGO%20TRIAD3%20.png';

/** Tela de login — exibida antes de liberar qualquer parte do sistema. */
export function LoginForm() {
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col items-center p-6 pt-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex w-full max-w-sm flex-col items-center"
      >
        <div className="mb-3 h-16 w-16 flex-none overflow-hidden rounded-full bg-black">
          <img src={LOGO_URL} alt="TRIAD3" className="h-full w-full object-contain" />
        </div>
        <h1 className="mb-8 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          PAINEL DE CONSULTAS
        </h1>

        <div className="w-full rounded-3xl bg-white p-8 shadow-xl dark:bg-slate-900">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                E-mail
              </label>
              <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-3 dark:bg-slate-800">
                <svg className="h-4 w-4 flex-none text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
                </svg>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.toLowerCase().replace(/\s/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === ' ') e.preventDefault();
                  }}
                  autoCapitalize="off"
                  autoComplete="username"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 placeholder-slate-300 focus:outline-none dark:text-white"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                Senha
              </label>
              <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-3 dark:bg-slate-800">
                <svg className="h-4 w-4 flex-none text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/\s/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === ' ') e.preventDefault();
                  }}
                  autoComplete="current-password"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 placeholder-slate-300 focus:outline-none dark:text-white"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="flex-none text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a3 3 0 0 0 4.24 4.24" />
                      <path d="M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.7-1.2M16.9 16.9C19.5 15.1 22 12 22 12s-1.2-2.4-3.3-4.3" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !email.trim() || !password.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {submitting ? (
                <>
                  <span
                    role="status"
                    aria-label="Carregando"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                  Entrando…
                </>
              ) : (
                <>
                  Entrar
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Powered by: TRIAD3 Inteligência
        </p>
      </motion.div>
    </div>
  );
}
