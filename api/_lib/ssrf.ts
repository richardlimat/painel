/**
 * Mitigação de SSRF para download de imagens de terceiros (URLs recebidas
 * da APIFull) a partir do servidor. O runtime edge não expõe resolução de
 * DNS (sem `node:dns`), então a defesa possível aqui é: só http/https,
 * bloquear hostnames/IPs literais óbvios de rede privada/loopback/link-local,
 * e nunca seguir redirect automaticamente (`redirect: 'manual'`, tratado
 * pelo chamador) — evita que um redirect leve a um IP interno depois da
 * primeira checagem.
 */

const PRIVATE_IPV4_RE =
  /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.)/;
const PRIVATE_IPV6_PREFIX_RE = /^(::1|::|fe80:|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:)/;

function isIpv4Literal(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

export function isSafeExternalHost(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;

  if (isIpv4Literal(hostname)) return !PRIVATE_IPV4_RE.test(hostname);
  if (hostname.includes(':')) {
    // Node/WHATWG URL mantém colchetes em `hostname` para literais IPv6 (ex.: "[::1]").
    const bare = hostname.replace(/^\[|\]$/g, '');
    return !PRIVATE_IPV6_PREFIX_RE.test(bare);
  }

  return true;
}
