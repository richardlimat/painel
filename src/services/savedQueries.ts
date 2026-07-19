import type { GraphSnapshot } from '../store/graphStore';
import type { ImageAsset } from '../lib/profileImages';

export interface SavedQuerySummary {
  id: string;
  titulo: string | null;
  cnpj_raiz: string;
  created_at: string;
  updated_at: string;
}

export interface SavedQueryDetail {
  id: string;
  titulo: string | null;
  cnpjRaiz: string;
  snapshot: GraphSnapshot;
  photoUrlsByPersonId: Record<string, string>;
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = (body as { message?: string } | null)?.message ?? `Falha na operação (HTTP ${res.status}).`;
    throw new Error(message);
  }
  return body as T;
}

/** Same-origin — o cookie de sessão HttpOnly é enviado automaticamente pelo navegador. */
export async function listSavedQueries(): Promise<SavedQuerySummary[]> {
  const res = await fetch('/api/saved-queries', { credentials: 'same-origin' });
  const body = await parseJsonOrThrow<{ items: SavedQuerySummary[] }>(res);
  return body.items;
}

export async function createSavedQuery(payload: {
  titulo?: string;
  cnpjRaiz: string;
  snapshot: GraphSnapshot;
  images: ImageAsset[];
}): Promise<{ id: string; imagesFailed: number }> {
  const res = await fetch('/api/saved-queries', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<{ id: string; imagesFailed: number }>(res);
}

export async function getSavedQuery(id: string): Promise<SavedQueryDetail> {
  const res = await fetch(`/api/saved-queries/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
  return parseJsonOrThrow<SavedQueryDetail>(res);
}

export async function deleteSavedQuery(id: string): Promise<void> {
  const res = await fetch(`/api/saved-queries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  await parseJsonOrThrow<{ ok: true }>(res);
}
