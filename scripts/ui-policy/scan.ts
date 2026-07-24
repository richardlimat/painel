import { ALLOWLIST, FORBIDDEN_TERMS, type ForbiddenTerm } from './terms';

export interface Violation {
  file: string;
  line: number;
  termId: string;
  reason: string;
  excerpt: string;
}

function isAllowed(file: string, termId: string): boolean {
  return ALLOWLIST.some((a) => a.file === file && a.termId === termId);
}

function clip(text: string, max = 140): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Aplica os termos proibidos a um trecho de texto já extraído (spans de código-fonte, ou uma linha do bundle). */
export function findViolations(
  file: string,
  line: number,
  text: string,
  terms: ForbiddenTerm[] = FORBIDDEN_TERMS,
): Violation[] {
  const found: Violation[] = [];
  for (const term of terms) {
    if (isAllowed(file, term.id)) continue;
    if (term.pattern.test(text)) {
      found.push({ file, line, termId: term.id, reason: term.reason, excerpt: clip(text) });
    }
  }
  return found;
}

/**
 * Varre um conteúdo bruto (ex.: um arquivo do bundle compilado, tipicamente
 * minificado numa única linha gigante) por ocorrência de cada termo,
 * reportando o número de linha real (contando `\n` até o índice do match) e
 * uma janela de contexto ao redor — não a linha inteira, que num bundle
 * minificado pode ter megabytes.
 */
export function scanRawContent(file: string, content: string, terms: ForbiddenTerm[] = FORBIDDEN_TERMS): Violation[] {
  const found: Violation[] = [];
  for (const term of terms) {
    if (isAllowed(file, term.id)) continue;
    const re = new RegExp(term.pattern.source, term.pattern.flags.includes('g') ? term.pattern.flags : `${term.pattern.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) {
      const line = content.slice(0, m.index).split('\n').length;
      const start = Math.max(0, m.index - 60);
      const end = Math.min(content.length, m.index + m[0].length + 60);
      found.push({ file, line, termId: term.id, reason: term.reason, excerpt: clip(content.slice(start, end)) });
      if (m[0].length === 0) re.lastIndex++; // evita loop infinito em padrão que casa string vazia
    }
  }
  return found;
}

export function formatViolation(v: Violation): string {
  return `  ${v.file}:${v.line}  [${v.termId}]  ${v.reason}\n      → ${v.excerpt}`;
}

export function printReport(title: string, violations: Violation[]): void {
  if (violations.length === 0) {
    console.log(`✓ ${title}: nenhuma ocorrência proibida encontrada.`);
    return;
  }
  console.error(`✗ ${title}: ${violations.length} ocorrência(s) proibida(s) encontrada(s):\n`);
  for (const v of violations) console.error(formatViolation(v));
  console.error('');
}
