import { describe, expect, it } from 'vitest';
import { isValidCPF } from './format';

describe('isValidCPF', () => {
  it('aceita CPF válido (fixture sintética, não é um documento real)', () => {
    expect(isValidCPF('111.444.777-35')).toBe(true);
    expect(isValidCPF('11144477735')).toBe(true);
  });

  it('rejeita CPF com dígito verificador errado', () => {
    expect(isValidCPF('111.444.777-36')).toBe(false);
  });

  it('rejeita CPF com menos de 11 dígitos', () => {
    expect(isValidCPF('123456789')).toBe(false);
  });

  it('rejeita CPF com mais de 11 dígitos', () => {
    expect(isValidCPF('123456789012')).toBe(false);
  });

  it('rejeita sequência de dígitos repetidos', () => {
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCPF('00000000000')).toBe(false);
  });
});
