import { useState } from 'react';

interface Props {
  onSaveAndLeave: () => Promise<void>;
  onLeaveWithoutSaving: () => void;
  onCancel: () => void;
}

/** Modal central: exibido ao tentar sair do grafo com alterações não salvas. */
export function LeaveConfirmModal({ onSaveAndLeave, onLeaveWithoutSaving, onCancel }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSaveAndLeave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar a consulta.');
      setSaving(false);
    }
  };

  return (
    <div className="leave-modal-overlay" role="dialog" aria-modal="true" aria-label="Sair sem salvar?">
      <div className="leave-modal-card">
        <h2>Sair sem salvar?</h2>
        <p>Você tem alterações não salvas nesta consulta. Se sair agora sem salvar, vai perder tudo.</p>
        {error && <p className="leave-modal-error">{error}</p>}
        <div className="leave-modal-actions">
          <button type="button" className="btn plain" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="leave-modal-danger" onClick={onLeaveWithoutSaving} disabled={saving}>
            Sair sem salvar
          </button>
          <button type="button" className="leave-modal-primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar e sair'}
          </button>
        </div>
      </div>
    </div>
  );
}
