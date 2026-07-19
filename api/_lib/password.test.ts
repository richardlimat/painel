import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password — hash PBKDF2 via Web Crypto', () => {
  it('1. hash nunca é a senha em texto puro e tem o formato pbkdf2$iter$salt$hash', async () => {
    const hash = await hashPassword('minhaSenhaSuperSecreta123');
    expect(hash).not.toContain('minhaSenhaSuperSecreta123');
    const parts = hash.split('$');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('pbkdf2');
    expect(Number(parts[1])).toBeGreaterThan(0);
    expect(parts[2]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[3]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('2. duas chamadas para a mesma senha geram hashes diferentes (salt aleatório)', async () => {
    const a = await hashPassword('repetida');
    const b = await hashPassword('repetida');
    expect(a).not.toBe(b);
  });

  it('3. verifyPassword aceita a senha correta', async () => {
    const hash = await hashPassword('correta-123');
    await expect(verifyPassword('correta-123', hash)).resolves.toBe(true);
  });

  it('4. verifyPassword rejeita senha incorreta', async () => {
    const hash = await hashPassword('correta-123');
    await expect(verifyPassword('errada-456', hash)).resolves.toBe(false);
  });

  it('5. verifyPassword nunca lança para hash malformado — retorna false', async () => {
    await expect(verifyPassword('qualquer', 'lixo-nao-formatado')).resolves.toBe(false);
    await expect(verifyPassword('qualquer', 'pbkdf2$abc$00$00')).resolves.toBe(false);
    await expect(verifyPassword('qualquer', '')).resolves.toBe(false);
  });
});
