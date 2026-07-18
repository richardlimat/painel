import { create } from 'zustand';
import { getApiFullProfile, type ApiFullProfile } from '../services/apifull';

/**
 * Store separado do graphStore, propositalmente: o perfil completo da
 * APIFull (potencialmente pesado e sensível) nunca deve entrar num
 * `GraphNode` nem em `nodes`/`links` do grafo — assim ele nunca é
 * exportado (PNG/SVG/PDF/JSON/CSV só leem `nodes`/`links`) e nunca
 * persiste além da sessão do navegador (sem `persist()` do Zustand, sem
 * localStorage/sessionStorage em nenhum ponto deste arquivo).
 */

export interface SociedadesStatus {
  pending: string[];
  succeeded: string[];
  failed: string[];
}

interface PersonProfileState {
  profilesByCpf: Map<string, ApiFullProfile>;
  requestsByCpf: Map<string, Promise<ApiFullProfile>>;
  errorsByCpf: Map<string, string>;
  /** Progresso do enriquecimento via FonteData dos CNPJs de sociedades[] de cada CPF. */
  sociedadesStatusByCpf: Map<string, SociedadesStatus>;

  /** Cache/dedup real: Promise em voo reaproveitada, erro nunca cacheado. */
  loadProfile: (cpf: string) => Promise<ApiFullProfile>;
  setSociedadesStatus: (cpf: string, status: SociedadesStatus) => void;
  markSociedadeOutcome: (cpf: string, cnpj: string, outcome: 'succeeded' | 'failed') => void;
  /** Move os CNPJs de `failed` de volta para `pending`, sem re-chamar a APIFull. */
  resetFailedToPending: (cpf: string) => void;
}

export const usePersonProfileStore = create<PersonProfileState>((set, get) => ({
  profilesByCpf: new Map(),
  requestsByCpf: new Map(),
  errorsByCpf: new Map(),
  sociedadesStatusByCpf: new Map(),

  loadProfile: (cpf: string) => {
    const state = get();
    const cached = state.profilesByCpf.get(cpf);
    if (cached) return Promise.resolve(cached);
    const inFlight = state.requestsByCpf.get(cpf);
    if (inFlight) return inFlight;

    const promise = getApiFullProfile(cpf)
      .then((profile) => {
        set((s) => {
          const requests = new Map(s.requestsByCpf);
          requests.delete(cpf);
          const errors = new Map(s.errorsByCpf);
          errors.delete(cpf);
          return {
            profilesByCpf: new Map(s.profilesByCpf).set(cpf, profile),
            requestsByCpf: requests,
            errorsByCpf: errors,
          };
        });
        return profile;
      })
      .catch((err: unknown) => {
        set((s) => {
          const requests = new Map(s.requestsByCpf);
          requests.delete(cpf); // erro nunca fica em cache — permite nova tentativa
          return {
            requestsByCpf: requests,
            errorsByCpf: new Map(s.errorsByCpf).set(
              cpf,
              err instanceof Error ? err.message : 'Erro ao carregar perfil.',
            ),
          };
        });
        throw err;
      });

    set((s) => ({ requestsByCpf: new Map(s.requestsByCpf).set(cpf, promise) }));
    return promise;
  },

  setSociedadesStatus: (cpf, status) => {
    set((s) => ({ sociedadesStatusByCpf: new Map(s.sociedadesStatusByCpf).set(cpf, status) }));
  },

  markSociedadeOutcome: (cpf, cnpj, outcome) => {
    set((s) => {
      const current = s.sociedadesStatusByCpf.get(cpf) ?? { pending: [], succeeded: [], failed: [] };
      const next: SociedadesStatus = {
        pending: current.pending.filter((c) => c !== cnpj),
        succeeded: outcome === 'succeeded' ? [...current.succeeded, cnpj] : current.succeeded,
        failed:
          outcome === 'failed' ? [...current.failed.filter((c) => c !== cnpj), cnpj] : current.failed.filter((c) => c !== cnpj),
      };
      return { sociedadesStatusByCpf: new Map(s.sociedadesStatusByCpf).set(cpf, next) };
    });
  },

  resetFailedToPending: (cpf) => {
    set((s) => {
      const current = s.sociedadesStatusByCpf.get(cpf);
      if (!current || current.failed.length === 0) return {};
      const next: SociedadesStatus = { pending: [...current.pending, ...current.failed], succeeded: current.succeeded, failed: [] };
      return { sociedadesStatusByCpf: new Map(s.sociedadesStatusByCpf).set(cpf, next) };
    });
  },
}));
