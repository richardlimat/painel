import type { ApiFullProfile } from '../services/apifull';
import type { GraphNode } from '../types/graph';
import { isSafeHttpUrl } from './url';
import { decodeBase64ToBlob } from './profileRender';
import { onlyDigits } from './format';

const IMAGE_KEY_HINT_RE = /(foto|imagem|selfie|fotografia|avatar|picture|photo|documento|anexo|base64)/;
const BASE64_CHARSET_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_DEPTH = 6;
/** Teto de segurança — nunca envia mais que isso por pessoa ao salvar. */
const MAX_ASSETS_PER_PERSON = 8;

export interface ImageAsset {
  personId: string;
  cpf: string;
  sourceUrl?: string;
  base64?: string;
}

function collect(value: unknown, keyHint: string, depth: number, urls: Set<string>, base64s: Set<string>): void {
  if (depth > MAX_DEPTH || value == null) return;
  if (typeof value === 'string') {
    const hinted = IMAGE_KEY_HINT_RE.test(keyHint.toLowerCase());
    if (hinted && isSafeHttpUrl(value)) {
      urls.add(value);
    } else if (hinted && value.length > 200 && BASE64_CHARSET_RE.test(value)) {
      base64s.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, keyHint, depth + 1, urls, base64s);
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) collect(v, k, depth + 1, urls, base64s);
  }
}

/**
 * Coleta URLs http(s) e Base64 que parecem imagem dentro de um perfil da
 * APIFull — usado só ao salvar a consulta (upload para o bucket). Base64
 * candidatos são confirmados por magic bytes (nunca confia só na chave);
 * strings que decodificam para algo que não é imagem (ex.: PDF) são
 * descartadas aqui.
 */
export function collectProfileImageAssets(profile: ApiFullProfile): { urls: string[]; base64s: string[] } {
  const urls = new Set<string>();
  const base64Candidates = new Set<string>();
  collect(profile.SERVICE_RESPONSE, '', 0, urls, base64Candidates);

  const base64s = [...base64Candidates].filter((b64) => {
    try {
      return decodeBase64ToBlob(b64).type.startsWith('image/');
    } catch {
      return false;
    }
  });

  return { urls: [...urls], base64s };
}

/**
 * Monta a lista de imagens a enviar ao salvar a consulta: a foto canônica já
 * exibida no nó (se houver) + imagens adicionais encontradas no perfil em
 * cache de cada pessoa do grafo. Nunca inclui Base64 cru de campos que não
 * decodificam para imagem.
 */
export function buildImageAssetsForSave(nodes: GraphNode[], profilesByCpf: Map<string, ApiFullProfile>): ImageAsset[] {
  const assets: ImageAsset[] = [];
  for (const n of nodes) {
    if (n.kind !== 'person' || !n.person) continue;
    const cpf = onlyDigits(n.person.cpf);
    const seenUrls = new Set<string>();
    let count = 0;

    if (n.person.photoUrl && isSafeHttpUrl(n.person.photoUrl)) {
      assets.push({ personId: n.id, cpf, sourceUrl: n.person.photoUrl });
      seenUrls.add(n.person.photoUrl);
      count++;
    }

    const profile = profilesByCpf.get(cpf);
    if (!profile) continue;
    const { urls, base64s } = collectProfileImageAssets(profile);
    for (const url of urls) {
      if (count >= MAX_ASSETS_PER_PERSON) break;
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      assets.push({ personId: n.id, cpf, sourceUrl: url });
      count++;
    }
    for (const base64 of base64s) {
      if (count >= MAX_ASSETS_PER_PERSON) break;
      assets.push({ personId: n.id, cpf, base64 });
      count++;
    }
  }
  return assets;
}
