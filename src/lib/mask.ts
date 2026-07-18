/**
 * Classificação e mascaramento de campos sensíveis do perfil da APIFull.
 *
 * IMPORTANTE — isto NÃO é controle de acesso: é só uma conveniência de UI.
 * Como o projeto não tem autenticação, qualquer pessoa com acesso ao painel
 * pode clicar em "Revelar" nos campos "soft", e o JSON completo (mascarado
 * ou não) já está visível na aba Network do navegador e via chamada direta
 * a `/api/cpf-ultra`, sem passar pela interface. Ver README.
 *
 * Classificação por PALAVRA normalizada (minúsculo, sem acento, camelCase e
 * snake_case separados em palavras) — evita falsos positivos de substring
 * cru (ex.: "cargo" não deve casar com "rg", "contador" não deve casar com
 * "conta"). Aplicado recursivamente em qualquer profundidade do JSON pelo
 * chamador (src/lib/profileRender.ts), checando cada chave visitada.
 */

export type MaskClass = 'hard' | 'soft' | 'none';

// Match exato de palavra — nunca revelados, sob nenhuma circunstância.
const HARD_EXACT = ['password', 'senha', 'hash', 'token', 'cookie', 'secret'];
// Prefixo de palavra — cobre variações/plurais em pt-BR e en (credencial/
// credenciais, autorização/autorizacao/authorization).
const HARD_PREFIX = ['credenc', 'autoriz', 'authoriz'];

// Match exato de palavra — mascarados por padrão, com botão de revelar (UI).
const SOFT_EXACT = [
  'cpf',
  'documento',
  'rg',
  'cns',
  'pis',
  'titulo',
  'conta',
  'pix',
  'telefone',
  'email',
  'endereco',
];

function splitToWords(key: string): string[] {
  return key
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos/cedilha
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // fronteira de camelCase
    .replace(/[_\-\s]+/g, ' ')
    .toLowerCase()
    .split(' ')
    .filter(Boolean);
}

export function classifyKey(key: string): MaskClass {
  const words = splitToWords(key);
  if (words.some((w) => HARD_EXACT.includes(w) || HARD_PREFIX.some((p) => w.startsWith(p)))) return 'hard';
  if (words.some((w) => SOFT_EXACT.includes(w))) return 'soft';
  return 'none';
}

function maskFully(): string {
  return '••••••••'; // tamanho fixo — não revela nem o tamanho do valor original
}

function maskPartial(value: string): string {
  if (value.length <= 4) return '••••';
  return `${value.slice(0, 2)}${'•'.repeat(Math.max(value.length - 4, 4))}${value.slice(-2)}`;
}

/**
 * Aplica a máscara de exibição. Campos "hard" NUNCA retornam o valor cru,
 * mesmo com `reveal: true` — essa regra é fixa e não depende de nenhuma
 * configuração ou permissão.
 */
export function applyMask(value: string, cls: MaskClass, reveal: boolean): string {
  if (cls === 'none') return value;
  if (cls === 'hard') return maskFully();
  return reveal ? value : maskPartial(value);
}
