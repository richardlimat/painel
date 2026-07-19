/**
 * Só HTTP/HTTPS são aceitos como URL de imagem exibível — `javascript:`,
 * `data:`, `file:` e qualquer outro esquema são rejeitados (previne XSS via
 * `src`/link e evita tratar Base64 embutido como se fosse uma URL segura).
 */
export function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
