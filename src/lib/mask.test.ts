import { describe, expect, it } from 'vitest';
import { applyMask, classifyKey, stripHardFields } from './mask';

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
    expect(classifyKey('contaBancaria')).toBe('soft');
    expect(classifyKey('agenciaBancaria')).toBe('soft');
  });

  it('classifica nome dos pais como soft (revelável), sem falso positivo em palavras parecidas', () => {
    expect(classifyKey('nomeMae')).toBe('soft');
    expect(classifyKey('nome_pai')).toBe('soft');
    expect(classifyKey('filiacaoMae')).toBe('soft');
    expect(classifyKey('paisagem')).toBe('none'); // não deve casar com "pai" (sem fronteira de palavra)
  });

  it('classifica identificador/login de vazamento como soft — a credencial em si continua hard', () => {
    expect(classifyKey('loginVazado')).toBe('soft');
    expect(classifyKey('identificadorVazado')).toBe('soft');
    expect(classifyKey('credenciaisVazadas')).toBe('hard'); // objeto pai continua hard (contém senha/hash)
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

  it('classifica chave de API e código de sessão como hard, sem afetar chave Pix (dado bancário)', () => {
    expect(classifyKey('apiKey')).toBe('hard');
    expect(classifyKey('secretKey')).toBe('hard');
    expect(classifyKey('codigoSessao')).toBe('hard');
    expect(classifyKey('sessionId')).toBe('hard');
    expect(classifyKey('chavePix')).toBe('soft'); // dado bancário, não segredo — não pode virar hard
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

describe('stripHardFields', () => {
  it('remove campos hard em qualquer profundidade, preservando os demais', () => {
    const input = {
      nome: 'FULANO',
      cpf: '11144477735',
      credenciaisVazadas: [{ senha: 'segredo123', origem: 'vazamento X' }],
      auth: { apiKey: 'abc123', sessionCookie: 'xyz', publico: 'ok' },
    };
    const result = stripHardFields(input) as typeof input;
    expect(result.nome).toBe('FULANO');
    expect(result.cpf).toBe('11144477735');
    expect((result as Record<string, unknown>).credenciaisVazadas).toBeUndefined();
    expect((result.auth as Record<string, unknown>).apiKey).toBeUndefined();
    expect((result.auth as Record<string, unknown>).sessionCookie).toBeUndefined();
    expect((result.auth as Record<string, unknown>).publico).toBe('ok');
  });

  it('percorre arrays recursivamente', () => {
    const input = [{ token: 'abc', nome: 'A' }, { token: 'def', nome: 'B' }];
    const result = stripHardFields(input) as Record<string, unknown>[];
    expect(result.every((item) => !('token' in item))).toBe(true);
    expect(result.map((item) => item.nome)).toEqual(['A', 'B']);
  });

  it('não altera valores escalares', () => {
    expect(stripHardFields('texto')).toBe('texto');
    expect(stripHardFields(42)).toBe(42);
    expect(stripHardFields(null)).toBeNull();
  });
});
