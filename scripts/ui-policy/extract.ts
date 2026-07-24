/**
 * Extração heurística (baseada em regex, sem parser completo de
 * TS/JSX) do texto que realmente pode chegar ao usuário — string e template
 * literals, e texto de nós JSX — a partir do código-fonte de um arquivo
 * .ts/.tsx. Comentários, nomes de tipo/função/variável e o restante da
 * sintaxe NUNCA são incluídos: identificadores como `ApiFullProfile` ou
 * `FonteDataProvider` não viram texto renderizado nem string enviada ao
 * navegador (o bundle minificado renomeia/descarta bindings não exportados
 * publicamente — checado à parte pelo scanner do bundle compilado), então
 * não são o alvo do scanner de código-fonte.
 */

export interface ExtractedSpan {
  line: number;
  text: string;
}

const STRING_LITERAL_RE = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\\n]|\\.)*`/g;
// Texto simples entre `>` e `<` (filho de elemento JSX), ignorando linhas que
// são só espaço/chaves — heurística suficiente para o estilo de JSX deste
// projeto (texto solto como filho direto, ex.: `<b>Texto</b>`).
const JSX_TEXT_RE = />([^<>{}\n]*[A-Za-zÀ-ÿ][^<>{}\n]*)</g;
// Um especificador de módulo (`from '...'` ou `import('...')`) nunca vira
// texto renderizado nem string enviada ao navegador — o bundler resolve o
// caminho em tempo de build. Detecta se o texto imediatamente antes do
// match, na mesma linha, termina em `from` ou `import(`.
const MODULE_SPECIFIER_CONTEXT_RE = /(?:\bfrom\s*|\bimport\s*\()$/;
// Interpolação `${expr}` de um template literal — em runtime vira o VALOR da
// expressão (ex.: um número), nunca o texto do nome da variável. Substituída
// por um placeholder neutro antes de casar contra os termos proibidos, senão
// o nome de uma constante (ex.: `MAX_APIFULL_CALLS_PER_EXPAND_ALL`) geraria
// falso-positivo mesmo nunca aparecendo daquele jeito pro usuário.
const TEMPLATE_INTERPOLATION_RE = /\$\{[^}]*\}/g;

/** Extrai, por linha, todo trecho de string/template literal e texto JSX de um arquivo-fonte. */
export function extractUserFacingSpans(source: string): ExtractedSpan[] {
  const spans: ExtractedSpan[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;

    STRING_LITERAL_RE.lastIndex = 0;
    while ((m = STRING_LITERAL_RE.exec(line))) {
      const before = line.slice(0, m.index);
      if (MODULE_SPECIFIER_CONTEXT_RE.test(before)) continue;
      const text = m[0].replace(TEMPLATE_INTERPOLATION_RE, '…');
      spans.push({ line: i + 1, text });
    }

    JSX_TEXT_RE.lastIndex = 0;
    while ((m = JSX_TEXT_RE.exec(line))) {
      const text = m[1].trim();
      if (text) spans.push({ line: i + 1, text });
    }
  }
  return spans;
}
