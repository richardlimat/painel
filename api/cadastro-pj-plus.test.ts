import { describe, expect, it } from 'vitest';
import { buildFonteDataUrl } from './cadastro-pj-plus';

describe('buildFonteDataUrl', () => {
  it('monta a URL exata esperada pela FonteData', () => {
    const url = buildFonteDataUrl('33260563000178');

    expect(url.origin).toBe('https://app.fontedata.com');
    expect(url.pathname).toBe('/api/v1/consulta/cadastro-pj-plus');
    expect(url.searchParams.get('CNPJ')).toBe('33260563000178');
    expect(url.searchParams.has('cnpj')).toBe(false);
    expect(url.toString()).toBe(
      'https://app.fontedata.com/api/v1/consulta/cadastro-pj-plus?CNPJ=33260563000178',
    );
  });
});
