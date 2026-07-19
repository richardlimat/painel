import { create } from 'zustand';
import { getApiFullProfile, type ApiFullProfile } from '../services/apifull';
import { isValidCPF, onlyDigits } from '../lib/format';

/**
 * Store separado do graphStore, propositalmente: o perfil completo da
 * APIFull (potencialmente pesado e sensível) nunca deve entrar num
 * `GraphNode` nem em `nodes`/`links` do grafo — assim ele nunca é
 * exportado (PNG/SVG/PDF/JSON/CSV só leem `nodes`/`links`) e nunca
 * persiste além da sessão do navegador (sem `persist()` do Zustand, sem
 * localStorage/sessionStorage em nenhum ponto deste arquivo).
 *
 * Fila sequencial: no máximo 1 consulta à APIFull em voo por vez (nunca
 * `Promise.all`/`allSettled` aqui) — concorrência 1 é intencional, não uma
 * limitação a ser "otimizada". `loadProfile` (clique do usuário) entra com
 * prioridade (`unshift`); `prefetchProfiles` (segundo plano) entra no fim
 * (`push`). Falha de um CPF nunca para a fila.
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

  /** CPFs aguardando a vez (não inclui o que já está em requestsByCpf mas ainda não começou a busca real). */
  queue: string[];
  /** true enquanto o worker único da fila está ativo. */
  processing: boolean;
  /** Tamanho do lote atual — reinicia quando a fila estava ociosa (processing=false e queue vazia) no momento do enfileiramento. */
  queueTotal: number;
  queueDone: number;
  queueFailed: number;

  /** Cache/dedup real: Promise em voo (ou na fila) reaproveitada, erro nunca cacheado. Prioriza (entra na frente da fila). */
  loadProfile: (cpf: string) => Promise<ApiFullProfile>;
  /** Enfileira em segundo plano (fim da fila), sem bloquear o chamador e sem retornar Promise. CPFs inválidos são ignorados. */
  prefetchProfiles: (cpfs: string[]) => void;
  /** Remove da fila só os itens que ainda NÃO começaram a ser processados — a requisição em andamento (se houver) termina normalmente. */
  cancelPendingQueue: () => void;
  setSociedadesStatus: (cpf: string, status: SociedadesStatus) => void;
  markSociedadeOutcome: (cpf: string, cnpj: string, outcome: 'succeeded' | 'failed') => void;
  /** Move os CNPJs de `failed` de volta para `pending`, sem re-chamar a APIFull. */
  resetFailedToPending: (cpf: string) => void;
}

type SetFn = (
  partial: Partial<PersonProfileState> | ((s: PersonProfileState) => Partial<PersonProfileState>),
) => void;
type GetFn = () => PersonProfileState;

/**
 * Handles de resolução das Promises criadas no momento do enfileiramento —
 * intencionalmente fora do estado reativo do Zustand (implementação interna
 * da fila, nunca exposta/serializada).
 */
const pendingResolvers = new Map<
  string,
  { resolve: (p: ApiFullProfile) => void; reject: (e: unknown) => void }
>();

/** Guarda de execução do worker único — nunca dois loops processando a fila ao mesmo tempo. */
let workerRunning = false;

function runQueue(get: GetFn, set: SetFn) {
  if (workerRunning) return;
  workerRunning = true;
  set({ processing: true });
  void (async () => {
    for (;;) {
      const cpf = get().queue[0];
      if (!cpf) break;
      set((s) => ({ queue: s.queue.slice(1) }));
      try {
        // eslint-disable-next-line no-await-in-loop -- concorrência 1 é intencional (fila sequencial)
        const profile = await getApiFullProfile(cpf);
        set((s) => {
          const requests = new Map(s.requestsByCpf);
          requests.delete(cpf);
          const errors = new Map(s.errorsByCpf);
          errors.delete(cpf);
          return {
            profilesByCpf: new Map(s.profilesByCpf).set(cpf, profile),
            requestsByCpf: requests,
            errorsByCpf: errors,
            queueDone: s.queueDone + 1,
          };
        });
        pendingResolvers.get(cpf)?.resolve(profile);
        pendingResolvers.delete(cpf);
      } catch (err) {
        set((s) => {
          const requests = new Map(s.requestsByCpf);
          requests.delete(cpf); // erro nunca fica em cache — permite nova tentativa
          return {
            requestsByCpf: requests,
            errorsByCpf: new Map(s.errorsByCpf).set(
              cpf,
              err instanceof Error ? err.message : 'Erro ao carregar perfil.',
            ),
            queueFailed: s.queueFailed + 1,
          };
        });
        pendingResolvers.get(cpf)?.reject(err);
        pendingResolvers.delete(cpf);
      }
    }
    workerRunning = false;
    set({ processing: false });
  })();
}

/** Enfileira (ou reaproveita cache/fila/andamento) um único CPF. Fonte comum de `loadProfile`/`prefetchProfiles`. */
function enqueueOne(get: GetFn, set: SetFn, rawCpf: string, priority: boolean): Promise<ApiFullProfile> {
  const cpf = onlyDigits(rawCpf);
  if (!isValidCPF(cpf)) {
    const rejected = Promise.reject(new Error('CPF inválido.'));
    rejected.catch(() => {});
    return rejected;
  }

  const state = get();
  const cached = state.profilesByCpf.get(cpf);
  if (cached) return Promise.resolve(cached);

  const inFlight = state.requestsByCpf.get(cpf);
  if (inFlight) {
    // Já em andamento ou na fila — clique do usuário (priority) pula pra frente
    // só se ainda não começou a ser processado (ainda está em `queue`).
    if (priority && state.queue.includes(cpf)) {
      set((s) => ({ queue: [cpf, ...s.queue.filter((c) => c !== cpf)] }));
    }
    return inFlight;
  }

  const promise = new Promise<ApiFullProfile>((resolve, reject) => {
    pendingResolvers.set(cpf, { resolve, reject });
  });
  // Evita "unhandled rejection" quando ninguém aguarda (ex.: prefetch em segundo
  // plano cancelado) — a Promise original devolvida/guardada em requestsByCpf
  // continua rejeitando normalmente pra quem de fato a aguardar.
  promise.catch(() => {});

  set((s) => {
    const wasIdle = !s.processing && s.queue.length === 0;
    const queue = priority ? [cpf, ...s.queue] : [...s.queue, cpf];
    return {
      requestsByCpf: new Map(s.requestsByCpf).set(cpf, promise),
      queue,
      queueTotal: wasIdle ? 1 : s.queueTotal + 1,
      queueDone: wasIdle ? 0 : s.queueDone,
      queueFailed: wasIdle ? 0 : s.queueFailed,
    };
  });

  runQueue(get, set);
  return promise;
}

export const usePersonProfileStore = create<PersonProfileState>((set, get) => ({
  profilesByCpf: new Map(),
  requestsByCpf: new Map(),
  errorsByCpf: new Map(),
  sociedadesStatusByCpf: new Map(),
  queue: [],
  processing: false,
  queueTotal: 0,
  queueDone: 0,
  queueFailed: 0,

  loadProfile: (cpf: string) => enqueueOne(get, set, cpf, true),

  prefetchProfiles: (cpfs: string[]) => {
    for (const cpf of cpfs) enqueueOne(get, set, cpf, false);
  },

  cancelPendingQueue: () => {
    const cancelled = get().queue;
    if (cancelled.length === 0) return;
    set((s) => {
      const requests = new Map(s.requestsByCpf);
      for (const cpf of cancelled) requests.delete(cpf);
      return { queue: [], requestsByCpf: requests, queueTotal: s.queueDone + s.queueFailed };
    });
    for (const cpf of cancelled) {
      pendingResolvers.get(cpf)?.reject(new Error('Consulta cancelada: nova pesquisa iniciada.'));
      pendingResolvers.delete(cpf);
    }
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
