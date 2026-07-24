# Painel de Consultas — instruções permanentes

## Neutralidade do frontend (regra absoluta)

O frontend deste produto **nunca** pode mencionar, mostrar ou enviar ao
navegador — em texto visível, mensagem de erro, tooltip, placeholder,
metadado, export (PDF/CSV/JSON/Markdown), preview de requisição, histórico,
HTML renderizado, bundle compilado ou qualquer outro caminho:

- nome de fornecedor ou provedor de dados (ex.: FonteData, APIFull), nem
  termos genéricos que revelem a arquitetura ("provedor", "fornecedor",
  "integração configurada", "serviço terceiro", "motor externo");
- a palavra "API" (ou "endpoint", "SDK") em texto técnico voltado ao usuário;
- saldo, créditos, consumo da conta, limite do fornecedor ou custo por
  consulta — nem um widget disso, nem uma consulta de saldo feita pelo
  navegador;
- chave de acesso (ou parte mascarada dela), header de autenticação,
  variável de ambiente, endpoint/domínio externo, request ID do fornecedor,
  nome de modelo/SDK, stack trace ou payload técnico bruto;
- erro repassado diretamente do fornecedor — toda falha externa passa pelo
  normalizador central (`api/_lib/upstreamError.ts`) antes de chegar ao
  cliente, virando `{ code, message, id }` em pt-BR, neutro, sem detalhe
  técnico. O cliente só lê esse envelope via
  `src/services/proxyError.ts::readNeutralErrorMessage` — nunca texto cru.

**Todas as integrações externas são server-only** (`api/**`): nenhuma
chave em `VITE_*`, nenhum SDK/cliente de fornecedor importado por `src/`,
nenhum endpoint externo construído no navegador. O frontend só conversa com
rotas internas de nome neutro (`/api/consulta-pessoa`, `/api/consulta-empresa`,
`/api/saved-queries/*`, `/api/auth/*`) — nunca com o nome/endpoint real do
fornecedor. Requisições internas continuam tecnicamente visíveis no DevTools
(isso é normal e não é o problema a resolver) — o que importa é que **o
caminho, o corpo e o erro sejam neutros**.

**Toda nova interface (tela, componente, mensagem, export, rota) precisa
passar nessa checagem antes de ser considerada pronta.** Rode:

```bash
npm run check:ui-policy          # varre src/**, index.html (código-fonte)
npm run build
npm run check:ui-policy:static   # varre dist/** (bundle compilado — a checagem definitiva)
```

Os dois comandos usam a lista central de termos em `scripts/ui-policy/terms.ts`
e falham (exit 1) apontando arquivo + linha de cada ocorrência. Qualquer
exceção precisa entrar na allowlist explícita desse arquivo, com
justificativa — nunca uma allowlist ampla por diretório. Categorias em que um
termo proibido pode legitimamente aparecer: código estritamente server-only
(`api/**`, nunca importado por `src/`), os testes da própria política
(`scripts/ui-policy/*.test.ts`), o próprio arquivo central de termos, e
documentação técnica interna (`README.md`, este arquivo) — nunca no que é
servido ao navegador.

### Nunca adultere conteúdo legítimo pesquisado

A regra acima é sobre **metadados técnicos da integração** — nunca sobre o
**resultado da pesquisa**. Se o usuário pesquisa uma empresa/pessoa cujo nome
real coincide com o de um fornecedor usado internamente (ex.: uma empresa
chamada "Fontedata Consultoria Ltda"), esse nome é dado do resultado, não
metadado técnico — deve aparecer intacto, sem mascarar/alterar/remover. Os
scripts de política nunca tocam dado dinâmico de busca: eles só varrem
arquivos-fonte estáticos (`src/**/*.ts(x)`) e o bundle compilado — nunca
`SERVICE_RESPONSE` nem qualquer valor vindo de uma consulta em tempo de
execução. Ver `EntityDetail.test.tsx` (teste "AUDITORIA DE NEUTRALIDADE") e
`scripts/ui-policy/terms.test.ts` para a prova disso.
