import { describe, expect, it } from 'vitest';
import { isSafeHttpUrl } from './url';

describe('isSafeHttpUrl', () => {
  it('1. aceita http e https', () => {
    expect(isSafeHttpUrl('http://example.com/foto.jpg')).toBe(true);
    expect(isSafeHttpUrl('https://example.com/foto.jpg')).toBe(true);
  });

  it('2. rejeita javascript:, data: e file:', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
  });

  it('3. rejeita valores não-string, vazios ou malformados', () => {
    expect(isSafeHttpUrl(undefined)).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(123)).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
    expect(isSafeHttpUrl('   ')).toBe(false);
    expect(isSafeHttpUrl('not a url')).toBe(false);
  });
});
