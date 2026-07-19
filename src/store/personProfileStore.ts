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

export interface BatchResult {
  succeeded: string[];
  failed: string[];
}

export interface BatchOpts {
  priority?: boolean;
  onEach?: (cpf: string, ok: boolean) => void;
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
  /** Logout: cancela a fila pendente e limpa todo o cache de perfis/erros — evita vazar dados de um usuário para o próximo login na mesma aba. */
  clearAllProfiles: () => void;
  /** Abrir consulta salva: pré-popula o cache com os perfis do snapshot (sanitizados), sem nenhuma chamada à APIFull. */
  hydrateProfiles: (profiles: Record<string, ApiFullProfile>) => void;

  /**
   * Mecanismo de lote (batch) sobre a MESMA fila sequencial — sem
   * `Promise.all`/`allSettled`. `startBatch` abre um lote com os CPFs
   * iniciais e devolve `batchId` + a Promise que resolve quando o lote
   * fecha (`sealBatch`) E todos os CPFs que entraram nele já terminaram
   * (sucesso ou falha, via a própria conclusão do worker único). Use
   * `addToBatch` para incluir CPFs descobertos depois (ex.: sócios de uma
   * empresa nova) enquanto o lote ainda está aberto. `runBatch` é o atalho
   * para o caso simples: lista fixa de CPFs, fecha e aguarda de uma vez.
   */
  startBatch: (cpfs: string[], opts?: BatchOpts) => { batchId: string; promise: Promise<BatchResult> };
  addToBatch: (batchId: string, cpfs: string[], opts?: { priority?: boolean }) => void;
  sealBatch: (batchId: string) => void;
  runBatch: (cpfs: string[], opts?: BatchOpts) => Promise<BatchResult>;
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

/**
 * Bookkeeping de lotes — puramente imperativo (sem `Promise.all`/`allSettled`
 * em nenhum ponto): cada CPF que entra num lote é indexado em
 * `cpfToBatches`; quando o worker único da fila termina esse CPF (sucesso
 * ou falha) — ou quando o CPF já está em cache no momento do registro —
 * `recordBatchOutcome` decrementa `remaining` do(s) lote(s) interessados e
 * resolve a Promise do lote quando ele está selado (`sealed`) e vazio.
 */
interface BatchRecord {
  remaining: Set<string>;
  succeeded: string[];
  failed: string[];
  sealed: boolean;
  onEach?: (cpf: string, ok: boolean) => void;
  resolve: (result: BatchResult) => void;
}

let batchCounter = 0;
const batches = new Map<string, BatchRecord>();
/** CPF -> lotes que ainda aguardam a conclusão desse CPF. */
const cpfToBatches = new Map<string, Set<string>>();

function addBatchWaiter(cpf: string, batchId: string) {
  let waiters = cpfToBatches.get(cpf);
  if (!waiters) {
    waiters = new Set();
    cpfToBatches.set(cpf, waiters);
  }
  waiters.add(batchId);
}

function removeBatchWaiter(cpf: string, batchId: string) {
  const waiters = cpfToBatches.get(cpf);
  if (!waiters) return;
  waiters.delete(batchId);
  if (waiters.size === 0) cpfToBatches.delete(cpf);
}

function maybeResolveBatch(batchId: string) {
  const batch = batches.get(batchId);
  if (!batch || !batch.sealed || batch.remaining.size > 0) return;
  batch.resolve({ succeeded: batch.succeeded, failed: batch.failed });
  batches.delete(batchId);
}

/** Chamado pelo worker da fila (sucesso/falha) toda vez que um CPF termina — nunca por agregação em lote. */
function recordBatchOutcome(cpf: string, ok: boolean) {
  const waiters = cpfToBatches.get(cpf);
  if (!waiters) return;
  for (const batchId of [...waiters]) {
    const batch = batches.get(batchId);
    removeBatchWaiter(cpf, batchId);
    if (!batch || !batch.remaining.has(cpf)) continue;
    batch.remaining.delete(cpf);
    if (ok) batch.succeeded.push(cpf);
    else batch.failed.push(cpf);
    batch.onEach?.(cpf, ok);
    maybeResolveBatch(batchId);
  }
}

/** Inclui CPFs (validados/deduplicados) num lote existente — ou, se o lote já fechou, apenas os enfileira em segundo plano. */
function addCpfsToBatch(get: GetFn, set: SetFn, batchId: string, rawCpfs: string[], priority: boolean) {
  const batch = batches.get(batchId);
  for (const raw of rawCpfs) {
    const cpf = onlyDigits(raw);
    if (!batch) {
      if (isValidCPF(cpf)) enqueueOne(get, set, cpf, priority);
      continue;
    }
    if (batch.remaining.has(cpf) || batch.succeeded.includes(cpf) || batch.failed.includes(cpf)) continue;
    if (!isValidCPF(cpf)) {
      batch.failed.push(cpf);
      batch.onEach?.(cpf, false);
      continue;
    }
    const cached = get().profilesByCpf.get(cpf);
    if (cached) {
      batch.succeeded.push(cpf);
      batch.onEach?.(cpf, true);
      continue;
    }
    batch.remaining.add(cpf);
    addBatchWaiter(cpf, batchId);
    enqueueOne(get, set, cpf, priority);
  }
  maybeResolveBatch(batchId);
}

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
        recordBatchOutcome(cpf, true);
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
        recordBatchOutcome(cpf, false);
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
      // Sem isso, um lote (batch) aguardando este CPF nunca fecharia — ele nunca mais será processado pelo worker.
      recordBatchOutcome(cpf, false);
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

  clearAllProfiles: () => {
    get().cancelPendingQueue();
    set({
      profilesByCpf: new Map(),
      requestsByCpf: new Map(),
      errorsByCpf: new Map(),
      sociedadesStatusByCpf: new Map(),
      queueTotal: 0,
      queueDone: 0,
      queueFailed: 0,
    });
  },

  startBatch: (cpfs, opts) => {
    const batchId = `batch-${++batchCounter}`;
    let resolveFn!: (result: BatchResult) => void;
    const promise = new Promise<BatchResult>((resolve) => {
      resolveFn = resolve;
    });
    batches.set(batchId, {
      remaining: new Set(),
      succeeded: [],
      failed: [],
      sealed: false,
      onEach: opts?.onEach,
      resolve: resolveFn,
    });
    addCpfsToBatch(get, set, batchId, cpfs, Boolean(opts?.priority));
    return { batchId, promise };
  },

  addToBatch: (batchId, cpfs, opts) => {
    addCpfsToBatch(get, set, batchId, cpfs, Boolean(opts?.priority));
  },

  sealBatch: (batchId) => {
    const batch = batches.get(batchId);
    if (!batch) return;
    batch.sealed = true;
    maybeResolveBatch(batchId);
  },

  runBatch: (cpfs, opts) => {
    const { batchId, promise } = get().startBatch(cpfs, opts);
    get().sealBatch(batchId);
    return promise;
  },

  hydrateProfiles: (profiles) => {
    set((s) => {
      const next = new Map(s.profilesByCpf);
      for (const [cpf, profile] of Object.entries(profiles)) next.set(onlyDigits(cpf), profile);
      return { profilesByCpf: next };
    });
  },
}));
