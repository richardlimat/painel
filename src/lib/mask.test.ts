import { describe, expect, it } from 'vitest';
import { applyMask, classifyKey } from './mask';

describe('classifyKey', () => {
  it('classifica campos sensíveis (soft) mesmo com camelCase/snake_case', () => {
    expect(classifyKey('cpf')).toBe('soft');
    expect(classifyKey('cpfParente')).toBe('soft');
    expect(classifyKey('documento_socio')).toBe('soft');
    expect(classifyKey('representante_cpf')).toBe('soft');
    expect(classifyKey('telefoneComDDD')).toBe('soft');
    expect(classifyKey('email')).toBe('soft');
    expect(classifyKey('endereco')).toBe('soft');
    expect(classifyKey('chavePix')).toBe('soft');
  });

  it('classifica credenciais/segredos como hard mesmo em plural pt-BR', () => {
    expect(classifyKey('senha')).toBe('hard');
    expect(classifyKey('password')).toBe('hard');
    expect(classifyKey('passwordHash')).toBe('hard');
    expect(classifyKey('authToken')).toBe('hard');
    expect(classifyKey('credenciaisVazadas')).toBe('hard');
    expect(classifyKey('sessionCookie')).toBe('hard');
    expect(classifyKey('apiSecret')).toBe('hard');
    expect(classifyKey('autorizacao')).toBe('hard');
  });

  it('não gera falso positivo em palavras que contêm substrings parecidas', () => {
    expect(classifyKey('cargo')).toBe('none'); // não deve casar com "rg"
    expect(classifyKey('contador')).toBe('none'); // não deve casar com "conta"
    expect(classifyKey('nome')).toBe('none');
    expect(classifyKey('situacaoCadastral')).toBe('none');
  });

  it('retorna "none" para chaves não sensíveis', () => {
    expect(classifyKey('razaoSocial')).toBe('none');
    expect(classifyKey('dataEntrada')).toBe('none');
  });
});

describe('applyMask', () => {
  it('nunca revela valor "hard", mesmo com reveal: true', () => {
    expect(applyMask('minhaSenha123', 'hard', true)).not.toContain('minhaSenha123');
    expect(applyMask('minhaSenha123', 'hard', false)).not.toContain('minhaSenha123');
    expect(applyMask('minhaSenha123', 'hard', true)).toBe(applyMask('minhaSenha123', 'hard', false));
  });

  it('mascara "soft" por padrão e revela quando reveal: true', () => {
    const masked = applyMask('12345678900', 'soft', false);
    expect(masked).not.toContain('12345678900');
    expect(applyMask('12345678900', 'soft', true)).toBe('12345678900');
  });

  it('não mascara "none"', () => {
    expect(applyMask('EMPRESA TESTE LTDA', 'none', false)).toBe('EMPRESA TESTE LTDA');
  });
});
