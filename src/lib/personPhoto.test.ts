import { describe, expect, it } from 'vitest';
import type { ApiFullProfile } from '../services/apifull';
import { extractPersonPhotoUrl } from './personPhoto';

function profile(serviceResponse: Record<string, unknown>): ApiFullProfile {
  return { SERVICE_RESPONSE: serviceResponse };
}

describe('extractPersonPhotoUrl', () => {
  it('1. prioriza cadastral.foto sobre fotos[]/extraFotos[]', () => {
    const p = profile({
      cadastral: { foto: 'https://cdn.example.com/cadastral.jpg' },
      fotos: ['https://cdn.example.com/fotos1.jpg'],
    });
    expect(extractPersonPhotoUrl(p)).toBe('https://cdn.example.com/cadastral.jpg');
  });

  it('2. sem cadastral.foto, usa a primeira URL válida de fotos[] (formato string)', () => {
    const p = profile({ fotos: ['not-a-url', 'https://cdn.example.com/foto2.jpg'] });
    expect(extractPersonPhotoUrl(p)).toBe('https://cdn.example.com/foto2.jpg');
  });

  it('3. aceita fotos[] em formato objeto com chave url/foto/imagem/link/src', () => {
    const p = profile({ fotos: [{ url: 'https://cdn.example.com/objeto.jpg' }] });
    expect(extractPersonPhotoUrl(p)).toBe('https://cdn.example.com/objeto.jpg');
  });

  it('4. sem fotos[] válida, cai para extraFotos[]', () => {
    const p = profile({ fotos: ['javascript:alert(1)'], extraFotos: ['https://cdn.example.com/extra.jpg'] });
    expect(extractPersonPhotoUrl(p)).toBe('https://cdn.example.com/extra.jpg');
  });

  it('5. rejeita esquemas inseguros em qualquer campo (cadastral.foto, fotos[], extraFotos[])', () => {
    const p = profile({
      cadastral: { foto: 'data:image/png;base64,AAAA' },
      fotos: ['javascript:alert(1)'],
      extraFotos: ['file:///etc/passwd'],
    });
    expect(extractPersonPhotoUrl(p)).toBeUndefined();
  });

  it('6. sem nenhuma foto disponível retorna undefined', () => {
    expect(extractPersonPhotoUrl(profile({}))).toBeUndefined();
  });
});
