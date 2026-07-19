import { usePersonProfileStore } from '../../store/personProfileStore';

/**
 * Indicador discreto do progresso da fila de perfis da APIFull (prefetch em
 * segundo plano + cliques do usuário). Só leitura de estado — nunca bloqueia
 * o controle de camadas nem exibe CPF algum. Não renderiza nada quando a
 * fila está ociosa e concluída.
 */
export function QueueProgress() {
  const processing = usePersonProfileStore((s) => s.processing);
  const queueLength = usePersonProfileStore((s) => s.queue.length);
  const queueTotal = usePersonProfileStore((s) => s.queueTotal);
  const queueDone = usePersonProfileStore((s) => s.queueDone);
  const queueFailed = usePersonProfileStore((s) => s.queueFailed);

  const active = processing || queueLength > 0;
  if (!active) return null;

  const completed = queueDone + queueFailed;
  const total = Math.max(queueTotal, completed + queueLength + (processing ? 1 : 0));

  return (
    <div className="queue-progress" role="status" aria-live="polite">
      <span className="queue-progress-spinner" aria-hidden="true" />
      <span>
        Carregando perfis: {completed} de {total}
        {queueFailed > 0 ? ` (${queueFailed} falharam)` : ''}
      </span>
    </div>
  );
}
