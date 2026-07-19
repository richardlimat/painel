import type { ApiFullProfile } from '../services/apifull';
import { isSafeHttpUrl } from './url';

const URL_KEYS = ['url', 'foto', 'imagem', 'link', 'src'] as const;

function bestUrlFromArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    if (isSafeHttpUrl(item)) return item;
    if (item && typeof item === 'object') {
      for (const key of URL_KEYS) {
        const candidate = (item as Record<string, unknown>)[key];
        if (isSafeHttpUrl(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

/**
 * Ordem de prioridade: `cadastral.foto` → melhor URL válida de `fotos[]` →
 * primeira URL válida de `extraFotos[]`. Só HTTP/HTTPS — nunca Base64, nunca
 * outro esquema. Formato de `fotos[]`/`extraFotos[]` não confirmado em
 * fixture real da APIFull; extração propositalmente permissiva (string OU
 * objeto com chave comum), a validar contra uma resposta real quando disponível.
 */
export function extractPersonPhotoUrl(profile: ApiFullProfile): string | undefined {
  const sr = profile.SERVICE_RESPONSE;

  const cadastral = sr.cadastral;
  if (cadastral && typeof cadastral === 'object') {
    const foto = (cadastral as Record<string, unknown>).foto;
    if (isSafeHttpUrl(foto)) return foto;
  }

  return bestUrlFromArray(sr.fotos) ?? bestUrlFromArray(sr.extraFotos);
}
