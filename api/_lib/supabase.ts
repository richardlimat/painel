import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase server-only. Usa a Service Role Key (`SUPABASE_SECRET_KEY`)
 * — sempre ignora RLS, por isso NUNCA deve ser importado por código
 * client-side (nada em `src/` importa este arquivo). `SUPABASE_URL` e
 * `SUPABASE_SECRET_KEY` nunca usam prefixo `VITE_*`.
 */

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL/SUPABASE_SECRET_KEY não configuradas no servidor.');
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Só para testes — força o próximo `getSupabaseClient()` a recriar o client. */
export function resetSupabaseClientCache(): void {
  cached = null;
}
