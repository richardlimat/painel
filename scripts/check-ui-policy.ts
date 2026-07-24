#!/usr/bin/env -S npx tsx
/**
 * Política de neutralidade do frontend — nível "código-fonte".
 *
 * Varre TODO o código destinado ao navegador (`src/**`, `index.html`) em
 * busca dos termos proibidos definidos em `scripts/ui-policy/terms.ts`
 * (fornecedor, API, saldo, créditos, chave, endpoint, provedor…). Arquivos
 * de teste (`*.test.ts(x)`) são ignorados aqui — não são enviados ao
 * navegador; o que realmente é entregue é verificado à parte, no bundle
 * compilado, por `check-ui-policy-bundle.ts` (rode `npm run build` antes).
 *
 * Em `.ts`/`.tsx`, só o texto que pode mesmo chegar ao usuário é checado —
 * strings/template literals e texto de nós JSX (ver `ui-policy/extract.ts`).
 * Comentários e nomes de tipo/função/variável nunca viram texto renderizado
 * nem string enviada ao navegador, então não fazem parte do risco real.
 *
 * Falha (exit 1) e lista arquivo + linha + termo de cada ocorrência.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { extractUserFacingSpans } from './ui-policy/extract';
import { findViolations, printReport, type Violation } from './ui-policy/scan';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function scanSourceFile(absPath: string): Violation[] {
  const rel = relative(ROOT, absPath).replace(/\\/g, '/');
  const content = readFileSync(absPath, 'utf8');
  const violations: Violation[] = [];
  for (const span of extractUserFacingSpans(content)) {
    violations.push(...findViolations(rel, span.line, span.text));
  }
  return violations;
}

function scanIndexHtml(): Violation[] {
  const abs = join(ROOT, 'index.html');
  const rel = 'index.html';
  const content = readFileSync(abs, 'utf8');
  const violations: Violation[] = [];
  content.split('\n').forEach((line, i) => {
    violations.push(...findViolations(rel, i + 1, line));
  });
  return violations;
}

function main() {
  const files = walk(SRC_DIR);
  const violations = files.flatMap(scanSourceFile);
  violations.push(...scanIndexHtml());

  printReport(`Política de neutralidade — código-fonte (${files.length + 1} arquivo(s))`, violations);
  if (violations.length > 0) process.exit(1);
}

main();
