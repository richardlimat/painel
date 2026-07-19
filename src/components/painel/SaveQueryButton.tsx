import { useState } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { usePersonProfileStore } from '../../store/personProfileStore';
import { buildImageAssetsForSave } from '../../lib/profileImages';
import { createSavedQuery } from '../../services/savedQueries';

/** Botão "Salvar consulta" — nada é salvo automaticamente, só ao clicar e confirmar. */
export function SaveQueryButton() {
  const rootId = useGraphStore((s) => s.rootId);
  const nodes = useGraphStore((s) => s.nodes);
  const buildSnapshot = useGraphStore((s) => s.buildSnapshot);
  const notify = useGraphStore((s) => s.notify);

  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [saving, setSaving] = useState(false);

  if (!rootId) return null;

  const handleSave = async () => {
    const snapshot = buildSnapshot();
    if (!snapshot) return;
    setSaving(true);
    try {
      const profilesByCpf = usePersonProfileStore.getState().profilesByCpf;
      const images = buildImageAssetsForSave(nodes, profilesByCpf);
      const rootNode = nodes.find((n) => n.id === rootId);
      const cnpjRaiz = rootNode?.company?.cnpj ?? '';
      const result = await createSavedQuery({
        titulo: titulo.trim() || undefined,
        cnpjRaiz,
        snapshot,
        images,
      });
      notify(
        result.imagesFailed > 0
          ? `Consulta salva. ${result.imagesFailed} imagem(ns) não puderam ser copiadas.`
          : 'Consulta salva com sucesso.',
      );
      setOpen(false);
      setTitulo('');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Falha ao salvar a consulta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="export-wrap">
      <button type="button" className="btn plain" onClick={() => setOpen((v) => !v)} title="Salvar consulta">
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
          <path d="M17 21v-8H7v8M7 3v5h8" />
        </svg>
        <span>Salvar consulta</span>
      </button>
      {open && (
        <div className="export-menu save-query-menu">
          <label className="save-query-title-label">
            Título (opcional)
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Grupo XYZ"
              maxLength={200}
            />
          </label>
          <button type="button" className="btn plain" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Salvando…' : 'Confirmar'}
          </button>
        </div>
      )}
    </div>
  );
}
