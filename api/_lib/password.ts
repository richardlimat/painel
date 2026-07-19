/**
 * Hash de senha via Web Crypto (`crypto.subtle`), sem dependências externas —
 * funciona nativamente no runtime edge da Vercel (e em Node >= 19, usado
 * pelos testes). PBKDF2-HMAC-SHA256, 210.000 iterações (referência OWASP
 * 2023 para PBKDF2-SHA256), salt aleatório de 16 bytes por senha.
 *
 * Formato armazenado: pbkdf2$<iterações>$<saltHex>$<hashHex>
 */

const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new Error('Hex inválido.');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    HASH_BITS,
  );
  return new Uint8Array(derived);
}

/** Gera o hash armazenável em `users.password_hash`. Nunca lança para senha vazia — trata como qualquer outra string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await deriveBits(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(derived)}`;
}

/** Comparação em tempo constante (byte a byte, sem early-return) — evita timing attack grosseiro. */
function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  if (aHex.length !== bHex.length) return false;
  let diff = 0;
  for (let i = 0; i < aHex.length; i++) {
    diff |= aHex.charCodeAt(i) ^ bHex.charCodeAt(i);
  }
  return diff === 0;
}

/** Verifica uma senha em texto puro contra o hash armazenado. Nunca lança — hash malformado só resulta em `false`. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;
  let salt: Uint8Array;
  try {
    salt = hexToBytes(parts[2]);
  } catch {
    return false;
  }
  const expectedHex = parts[3];
  const derived = await deriveBits(password, salt, iterations);
  return timingSafeEqualHex(bytesToHex(derived), expectedHex);
}
