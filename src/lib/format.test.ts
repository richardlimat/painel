import { describe, expect, it } from 'vitest';
import { isValidCPF, maskCPF } from './format';

describe('maskCPF', () => {
  it('aplica a máscara progressivamente conforme os dígitos entram', () => {
    expect(maskCPF('1')).toBe('1');
    expect(maskCPF('111')).toBe('111');
    expect(maskCPF('1114')).toBe('111.4');
    expect(maskCPF('111444')).toBe('111.444');
    expect(maskCPF('1114447')).toBe('111.444.7');
    expect(maskCPF('111444777')).toBe('111.444.777');
    expect(maskCPF('1114447773')).toBe('111.444.777-3');
    expect(maskCPF('11144477735')).toBe('111.444.777-35');
  });

  it('ignora caracteres não numéricos e trunca em 11 dígitos', () => {
    expect(maskCPF('111.444.777-35')).toBe('111.444.777-35');
    expect(maskCPF('111444777359999')).toBe('111.444.777-35');
  });
});

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
