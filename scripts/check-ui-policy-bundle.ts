#!/usr/bin/env -S npx tsx
/**
 * Política de neutralidade do frontend — nível "bundle compilado".
 *
 * A checagem definitiva: varre exatamente o que é servido ao navegador
 * (`dist/**` após `npm run build` — JS, CSS, HTML e, se algum dia forem
 * publicados, source maps) pelos termos proibidos. Comentários e nomes de
 * identificador não sobrevivem à minificação de bindings não exportados
 * publicamente, então este é o nível que prova, sem depender de heurística
 * de extração, que nada proibido chega ao usuário.
 *
 * Usa `BUNDLE_FORBIDDEN_TERMS` (exclui termos 'source-only', como a palavra
 * solta "API", que no bundle final colide com jargão interno de
 * dependências de terceiros sem relação com nossos fornecedores — ver
 * `ui-policy/terms.ts`).
 *
 * Falha (exit 1) e lista arquivo + linha + termo de cada ocorrência. Falha
 * também (com instrução clara) se `dist/` não existir — rode `npm run
 * build` antes.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BUNDLE_FORBIDDEN_TERMS } from './ui-policy/terms';
import { printReport, scanRawContent, type Violation } from './ui-policy/scan';

const ROOT = join(import.meta.dirname, '..');
const DIST_DIR = join(ROOT, 'dist');
const SCAN_EXTENSIONS = /\.(js|mjs|cjs|css|html|map)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SCAN_EXTENSIONS.test(entry)) out.push(full);
  }
  return out;
}

function main() {
  if (!existsSync(DIST_DIR)) {
    console.error('✗ dist/ não encontrado. Rode "npm run build" antes de "npm run check:ui-policy:static".');
    process.exit(1);
  }

  const files = walk(DIST_DIR);
  if (files.length === 0) {
    console.error('✗ dist/ existe mas não contém .js/.css/.html/.map — build incompleto?');
    process.exit(1);
  }

  const violations: Violation[] = [];
  for (const abs of files) {
    const rel = relative(ROOT, abs).replace(/\\/g, '/');
    const content = readFileSync(abs, 'utf8');
    violations.push(...scanRawContent(rel, content, BUNDLE_FORBIDDEN_TERMS));
  }

  printReport(`Política de neutralidade — bundle compilado (${files.length} arquivo(s))`, violations);
  if (violations.length > 0) process.exit(1);
}

main();
