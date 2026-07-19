import { describe, expect, it } from 'vitest';
import {
  decodeBase64ToBlob,
  describePrimitive,
  formatApproxSize,
  guessMimeType,
  isLikelyDocumentBlob,
  truncateItems,
} from './profileRender';

describe('isLikelyDocumentBlob', () => {
  it('trata string muito longa (>2000) como documento, independente da chave', () => {
    expect(isLikelyDocumentBlob('qualquerCampo', 'a'.repeat(2001))).toBe(true);
  });

  it('não trata string curta comum como documento', () => {
    expect(isLikelyDocumentBlob('nome', 'FULANO DE TAL')).toBe(false);
  });

  it('trata string >200 chars com cara de Base64 SOMENTE quando a chave sugere documento/foto', () => {
    const base64Like = 'A'.repeat(300);
    expect(isLikelyDocumentBlob('docsBase64', base64Like)).toBe(true);
    expect(isLikelyDocumentBlob('foto', base64Like)).toBe(true);
    expect(isLikelyDocumentBlob('descricaoLonga', base64Like)).toBe(false);
  });

  it('não marca como documento se a chave sugere mas o conteúdo não parece Base64', () => {
    const naoBase64 = 'texto com espaços e pontuação!'.repeat(10);
    expect(isLikelyDocumentBlob('documento', naoBase64.length > 2000 ? naoBase64.slice(0, 500) : naoBase64)).toBe(
      false,
    );
  });

  it('ignora valores que não são string', () => {
    expect(isLikelyDocumentBlob('foto', 12345)).toBe(false);
    expect(isLikelyDocumentBlob('foto', null)).toBe(false);
  });
});

describe('formatApproxSize', () => {
  it('formata em B/KB/MB conforme o tamanho', () => {
    expect(formatApproxSize(10)).toMatch(/B$/);
    expect(formatApproxSize(2000)).toMatch(/KB$/);
    expect(formatApproxSize(2_000_000)).toMatch(/MB$/);
  });
});

describe('describePrimitive', () => {
  it('formata null/undefined/string vazia como "Não informado"', () => {
    expect(describePrimitive(null)).toBe('Não informado');
    expect(describePrimitive(undefined)).toBe('Não informado');
    expect(describePrimitive('')).toBe('Não informado');
    expect(describePrimitive('   ')).toBe('Não informado');
  });

  it('formata booleano como Sim/Não', () => {
    expect(describePrimitive(true)).toBe('Sim');
    expect(describePrimitive(false)).toBe('Não');
  });

  it('mantém string e número normalmente', () => {
    expect(describePrimitive('ATIVA')).toBe('ATIVA');
    expect(describePrimitive(42)).toBe('42');
  });
});

describe('truncateItems', () => {
  it('não trunca quando está dentro do limite', () => {
    const items = [1, 2, 3];
    expect(truncateItems(items, 50)).toEqual({ visible: items, hiddenCount: 0 });
  });

  it('trunca e reporta quantos itens ficaram de fora', () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    const { visible, hiddenCount } = truncateItems(items, 50);
    expect(visible).toHaveLength(50);
    expect(hiddenCount).toBe(70);
  });
});

describe('guessMimeType', () => {
  it('reconhece PNG, JPEG e PDF pelos magic bytes', () => {
    expect(guessMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('image/png');
    expect(guessMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(guessMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('application/pdf');
  });

  it('usa application/octet-stream como fallback', () => {
    expect(guessMimeType(new Uint8Array([0x00, 0x01, 0x02]))).toBe('application/octet-stream');
  });
});

describe('decodeBase64ToBlob', () => {
  it('decodifica Base64 válido para um Blob com tipo detectado', async () => {
    // "hello" em Base64
    const blob = decodeBase64ToBlob('aGVsbG8=');
    expect(blob.size).toBe(5);
    const text = await blob.text();
    expect(text).toBe('hello');
  });
});
