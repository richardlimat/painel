import { describe, expect, it } from 'vitest';
import type { ApiFullProfile } from '../services/apifull';
import type { GraphNode } from '../types/graph';
import { buildImageAssetsForSave, collectProfileImageAssets } from './profileImages';

function makeBase64(magicBytes: number[], totalLength = 300): string {
  const bytes = new Uint8Array(totalLength);
  magicBytes.forEach((b, i) => {
    bytes[i] = b;
  });
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const PNG_BASE64 = makeBase64([0x89, 0x50, 0x4e, 0x47]);
const PDF_BASE64 = makeBase64([0x25, 0x50, 0x44, 0x46]);

describe('collectProfileImageAssets', () => {
  it('1. coleta URL de imagem em campo com chave sugestiva', () => {
    const profile: ApiFullProfile = { SERVICE_RESPONSE: { fotos: ['https://cdn.example.com/a.jpg'] } };
    expect(collectProfileImageAssets(profile).urls).toEqual(['https://cdn.example.com/a.jpg']);
  });

  it('2. ignora URL http(s) em campo sem chave sugestiva de imagem/documento', () => {
    const profile: ApiFullProfile = { SERVICE_RESPONSE: { urlExterna: 'https://cdn.example.com/pagina' } };
    expect(collectProfileImageAssets(profile).urls).toEqual([]);
  });

  it('3. rejeita esquemas inseguros mesmo com chave sugestiva', () => {
    const profile: ApiFullProfile = { SERVICE_RESPONSE: { foto: 'javascript:alert(1)' } };
    expect(collectProfileImageAssets(profile).urls).toEqual([]);
  });

  it('4. coleta Base64 que decodifica para imagem (magic bytes), ignora Base64 que não é imagem', () => {
    const profile: ApiFullProfile = {
      SERVICE_RESPONSE: { fotoBase64: PNG_BASE64, documentoBase64: PDF_BASE64 },
    };
    const { base64s } = collectProfileImageAssets(profile);
    expect(base64s).toEqual([PNG_BASE64]);
  });

  it('5. nenhuma imagem encontrada retorna listas vazias', () => {
    expect(collectProfileImageAssets({ SERVICE_RESPONSE: {} })).toEqual({ urls: [], base64s: [] });
  });
});

describe('buildImageAssetsForSave', () => {
  const CPF = '11144477735';
  const personNode: GraphNode = {
    id: 'p:11144477735',
    kind: 'person',
    label: 'FULANO',
    depth: 0,
    expanded: false,
    person: { cpf: CPF, nome: 'FULANO', photoUrl: 'https://cdn.example.com/nodo.jpg' },
  };
  const companyNode: GraphNode = {
    id: 'c:1',
    kind: 'company',
    label: 'EMPRESA',
    depth: 0,
    expanded: false,
    company: { cnpj: '11222333000181', razaoSocial: 'EMPRESA', situacao: 'ATIVA' },
  };

  it('1. inclui a foto canônica do nó mesmo sem perfil em cache', () => {
    const assets = buildImageAssetsForSave([personNode, companyNode], new Map());
    expect(assets).toEqual([{ personId: personNode.id, cpf: CPF, sourceUrl: 'https://cdn.example.com/nodo.jpg' }]);
  });

  it('2. nunca gera asset para nó de empresa', () => {
    const assets = buildImageAssetsForSave([companyNode], new Map());
    expect(assets).toEqual([]);
  });

  it('3. deduplica a foto do nó com a mesma URL encontrada no perfil', () => {
    const profile: ApiFullProfile = { SERVICE_RESPONSE: { fotos: ['https://cdn.example.com/nodo.jpg'] } };
    const assets = buildImageAssetsForSave([personNode], new Map([[CPF, profile]]));
    expect(assets).toHaveLength(1);
  });

  it('4. inclui imagens adicionais do perfil (além da foto canônica)', () => {
    const profile: ApiFullProfile = { SERVICE_RESPONSE: { extraFotos: ['https://cdn.example.com/extra.jpg'] } };
    const assets = buildImageAssetsForSave([personNode], new Map([[CPF, profile]]));
    expect(assets.map((a) => a.sourceUrl)).toEqual(
      expect.arrayContaining(['https://cdn.example.com/nodo.jpg', 'https://cdn.example.com/extra.jpg']),
    );
  });
});
