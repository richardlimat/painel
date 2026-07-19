import { create } from 'zustand';
import { useGraphStore } from './graphStore';
import { usePersonProfileStore } from './personProfileStore';

export interface AuthUser {
  id: string;
  nome: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  status: 'checking' | 'authenticated' | 'unauthenticated';
  error: string | null;
  checkSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'checking',
  error: null,

  checkSession: async () => {
    try {
      const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
      if (!res.ok) {
        set({ user: null, status: 'unauthenticated' });
        return;
      }
      const body = await safeJson(res);
      const user = body?.user as AuthUser | undefined;
      if (!user) {
        set({ user: null, status: 'unauthenticated' });
        return;
      }
      set({ user, status: 'authenticated' });
    } catch {
      set({ user: null, status: 'unauthenticated' });
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await safeJson(res);
      if (!res.ok) {
        set({ error: (body?.message as string) ?? 'Não foi possível entrar.' });
        return false;
      }
      const user = body?.user as AuthUser | undefined;
      if (!user) {
        set({ error: 'Resposta inesperada do servidor.' });
        return false;
      }
      set({ user, status: 'authenticated', error: null });
      return true;
    } catch {
      set({ error: 'Falha de conexão. Tente novamente.' });
      return false;
    }
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // logout é best-effort no cliente — o cookie expira localmente de qualquer forma via nova checagem
    }
    // Nunca deixar dados do usuário anterior visíveis para o próximo login na mesma aba.
    useGraphStore.getState().reset();
    usePersonProfileStore.getState().clearAllProfiles();
    set({ user: null, status: 'unauthenticated', error: null });
  },
}));
