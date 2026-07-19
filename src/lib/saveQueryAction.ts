import { useGraphStore } from '../store/graphStore';
import { usePersonProfileStore } from '../store/personProfileStore';
import { buildImageAssetsForSave } from './profileImages';
import { createSavedQuery } from '../services/savedQueries';

/**
 * Salva a consulta atualmente aberta — usado tanto pelo botão "Salvar
 * consulta" quanto pelo modal de confirmação ao sair sem salvar. Único ponto
 * que monta o payload (snapshot + imagens) e chama a API; sempre marca
 * `unsavedChanges = false` no graphStore ao terminar com sucesso.
 */
export async function saveCurrentQuery(titulo?: string): Promise<{ id: string; imagesFailed: number }> {
  const graphState = useGraphStore.getState();
  const snapshot = graphState.buildSnapshot();
  if (!snapshot) throw new Error('Não há consulta aberta para salvar.');

  const profilesByCpf = usePersonProfileStore.getState().profilesByCpf;
  const images = buildImageAssetsForSave(graphState.nodes, profilesByCpf);
  const rootNode = graphState.nodes.find((n) => n.id === graphState.rootId);
  const cnpjRaiz = rootNode?.company?.cnpj ?? rootNode?.person?.cpf ?? '';

  const result = await createSavedQuery({ titulo, cnpjRaiz, snapshot, images });
  useGraphStore.getState().markSaved();
  return result;
}
