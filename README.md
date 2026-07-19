# Painel de Consultas — Inteligência Societária (Graph Intelligence)

Módulo de inteligência societária com visualização em grafo interativo (React Flow):
a partir de um CNPJ, o sistema descobre a estrutura societária em múltiplas camadas
(empresa → sócios → outras empresas dos sócios → …), com expansão sob demanda e
prevenção de loops.

![stack](https://img.shields.io/badge/React%2018-TypeScript-blue) ![vite](https://img.shields.io/badge/Vite-5-purple)

## Interface

Layout em grade, sempre em modo claro: topbar com busca inteligente e ações;
sidebar esquerda com filtros (switches), profundidade e legenda; workspace
central com breadcrumb, indicador de nível e o mapa (nós circulares com cartão
de rótulo, arestas com chip de relacionamento e controles centrais); painel
direito de detalhes com abas (Visão geral / Sócios / Histórico) e modo
Estatísticas (Indicadores / Linha do tempo). Percentuais de participação
societária não são exibidos nem exportados.

A identidade visual é totalmente branca e neutra (preto/grafite/cinza — sem azul):
empresas são círculos grafite preenchidos, pessoas são círculos brancos com borda,
baixadas têm contorno tracejado e filiais usam cinza médio.

## Funcionalidades

- **Mapa interativo em React Flow** (@xyflow/react): pan, zoom, arrastar nós (posição
  preservada), controles, layout radial automático e botão **Reorganizar**.
- **Controle de camadas** `[ − ] Camada N [ + ]` flutuante sobre o mapa: camadas
  cumulativas (avançar adiciona o próximo nível de relacionamentos mantendo os
  anteriores; voltar oculta apenas os exclusivos das camadas superiores, com cache
  dos dados já consultados). O `−` desabilita na Camada 1 e o `+` quando não há
  novas conexões nos dados.
- **Expansão individual**: clique simples seleciona (painel de detalhes); **duplo
  clique** expande as conexões do nó. Botões **Expandir Tudo** (BFS até o limite de
  níveis, com teto de segurança de 600 nós) e **Recolher Tudo**.
- **Configurar mapa** (⚙, abaixo do controle de camadas): painel retrátil de forças
  estilo Obsidian — força centrípeta, repulsão, força e distância dos links (escala
  0–100, d3-force) — que refina as posições geradas pelo layout radial, com botões
  **Animar** e **Restaurar padrão** e persistência em localStorage. Com valores
  padrão a simulação não roda e o layout permanece o radial puro; personalizado,
  o refinamento se aplica automaticamente a novas camadas e expansões.
- **Limite de camadas configurável**: 2, 3, 5, 10 ou ilimitado; entidades já visitadas
  são deduplicadas (anti-loop).
- **Identidade visual**: empresas ativas em azul, pessoas em verde, administradores em
  amarelo, inativas em cinza, baixadas em vermelho, filiais em laranja, matrizes com anel
  roxo. Tamanho do nó cresce com conexões e capital social. Cada tipo de relacionamento
  tem cor própria e legenda na linha (visível ao aproximar o zoom).
- **Painel lateral** com dados cadastrais completos (empresa) ou participações (pessoa),
  histórico societário e navegação para nós relacionados. No nó pessoa, uma seção
  **Perfil completo** (APIFull) traz o restante da resposta em seções recolhíveis
  simples, uma por chave — ver "Fontes de dados" e o aviso de segurança abaixo.
- **Busca inteligente** por nome, CPF, CNPJ, razão social ou fantasia — destaca,
  centraliza e aplica zoom no nó encontrado.
- **Filtros dinâmicos**: pessoas/empresas, situação cadastral, administradores, sócios,
  filiais/matrizes, participação mínima, UF, CNAE, data de abertura.
- **Breadcrumb** de navegação, **painel de estatísticas** (totais, capital somado,
  estados, municípios, CNAEs) e **linha do tempo** societária.
- **Exportação**: PNG em alta resolução, SVG, PDF (preservando o layout), JSON completo
  e CSV das conexões.
- **Layout responsivo** (drawers em mobile), sempre em modo claro.

## Fontes de dados

A camada de dados é plugável (`src/services/provider.ts`):

| Provedor | CNPJ → sócios | CPF → perfil + empresas |
|---|---|---|
| **FonteData** (`cadastro-pj-plus`) | ✅ | — |
| **APIFull** (`cpf-ultra`) | — | ✅ (perfil completo + `sociedades[]`) |

Nenhuma chamada é feita direto do navegador para a FonteData/APIFull:
`api/cadastro-pj-plus.ts` e `api/cpf-ultra.ts` (Vercel Edge Functions) atuam
como proxy same-origin, repassando as consultas com `FONTEDATA_API_KEY` e
`APIFULL_AUTHORIZATION` só no servidor. Isso evita bloqueio de CORS (as duas
são APIs servidor-a-servidor) e mantém as chaves fora do bundle do cliente.

**Pipeline entre camadas:** CNPJ → FonteData → empresa + sócios (Camada 1) →
ao avançar de camada, cada CPF da fronteira é consultado na APIFull → os
CNPJs em `sociedades[]` são enriquecidos na FonteData (empresa completa +
todos os seus sócios) → empresa nova e seus sócios entram juntos na mesma
camada seguinte à da pessoa → repete a partir das pessoas novas na próxima
camada. Só `sociedades[]` altera o grafo — o restante do perfil da APIFull
(documentos, contatos, vazamentos etc.) aparece só no painel lateral da
pessoa, nunca vira nó/aresta.

Clicar numa pessoa carrega o perfil completo (cache/dedup real por CPF em
`src/store/personProfileStore.ts`, compartilhado com a expansão de camada)
mas **não** expande o grafo — isso só acontece ao avançar de camada. Uma
falha ao enriquecer algum CNPJ de `sociedades[]` não cancela os demais nem
o restante da camada; o nó da pessoa fica clicável de novo pra tentar só o
que faltou (o perfil já em cache não é rebuscado).

### ⚠️ Aviso de segurança — leia antes de configurar em produção

**Nem `/api/cadastro-pj-plus` nem `/api/cpf-ultra` têm controle de acesso.**
Este projeto não tem autenticação (sem login, sessão ou middleware em lugar
nenhum do código) — isso é uma decisão consciente da primeira versão, não
uma configuração pendente. Qualquer pessoa que descubra a URL do deployment
pode chamar essas rotas e consumir créditos pagos das duas APIs.

**O mascaramento de campos sensíveis no painel (CPF, RG, contas, Pix etc.,
com botão "Revelar") não é controle de acesso — é só conveniência de UI.**
Qualquer pessoa com acesso ao painel pode clicar em "Revelar". O JSON
completo da resposta já está visível na aba Network do navegador, e a rota
`/api/cpf-ultra` pode ser chamada diretamente (`curl`, Postman etc.) sem
passar pela interface. Só os campos "duros" (senhas, hashes, tokens de
`credenciaisVazadas`) nunca são exibidos, sob nenhuma circunstância — essa
é a única proteção real de conteúdo que existe hoje.

**Antes de configurar `APIFULL_AUTHORIZATION`/`FONTEDATA_API_KEY` num
ambiente acessível pela internet**, ative pelo menos o
[Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)
(senha nativa da Vercel para o deployment inteiro). Sem isso, uma rota paga
de consulta de CPF fica completamente aberta na internet.

Também não há rate-limit nem controle de concorrência no servidor (exigiria
KV/Redis, que este projeto não tem) — a única mitigação hoje é client-side:
cache por CPF/CNPJ, lotes com concorrência limitada, e uma confirmação antes
de "Expandir Tudo" iniciar uma cascata grande de consultas pagas.

## Rodando

```bash
cp .env.example .env   # preencha FONTEDATA_API_KEY e APIFULL_AUTHORIZATION
npm install
npm run dev        # http://localhost:5173 — só a UI; /api/* não é servido (ver abaixo)
npm run build      # produção em dist/
npm run preview
npm run test       # Vitest (normalização, URLs, cache, camadas, dedup, mascaramento)
```

`npm run dev`/`npm run preview` sozinhos **não** servem `/api/*` (Vite não
conhece Vercel Functions), então a busca vai falhar localmente com esses
comandos — servem só para trabalhar na UI. Para testar o fluxo completo
(incluindo as chamadas reais à FonteData/APIFull) é preciso rodar via
[Vercel CLI](https://vercel.com/docs/cli): `vercel dev` (lê as variáveis do
`.env` automaticamente), ou testar direto numa URL de deployment de
Preview/Produção da Vercel com as variáveis configuradas naquele ambiente —
**garanta que o deployment não fique publicamente exposto antes de testar**
(ver aviso de segurança acima).

## Arquitetura

```
api/
├── cadastro-pj-plus.ts     # Vercel Edge Function: proxy same-origin p/ FonteData
└── cpf-ultra.ts            # Vercel Edge Function: proxy same-origin p/ APIFull (rota pública, ver aviso)

src/
├── types/graph.ts          # modelo de grafo: nós Pessoa/Empresa, relacionamentos tipados
├── services/
│   ├── provider.ts         # interface DataProvider (plugável)
│   ├── fontedata.ts        # provedor real (API comercial FonteData)
│   └── apifull.ts          # perfil completo + sociedades[] (API comercial APIFull)
├── store/
│   ├── graphStore.ts          # Zustand: expansão BFS, camadas, dedupe/anti-loop, filtros, tema
│   └── personProfileStore.ts  # Zustand: cache/dedup do perfil APIFull por CPF (separado do grafo)
├── lib/
│   ├── filtering.ts        # filtros dinâmicos + estatísticas + grau dos nós
│   ├── flowLayout.ts       # layout radial + posicionamento incremental
│   ├── exporters.ts        # PNG/SVG/PDF/JSON/CSV (nunca inclui o perfil da APIFull)
│   ├── colors.ts           # identidade visual de nós e conexões (paleta do painel)
│   ├── format.ts           # CNPJ/CPF/moeda/data
│   ├── mask.ts             # classificação/mascaramento de campos sensíveis (UI, não é ACL)
│   └── profileRender.ts    # limites de profundidade/itens + detecção de Base64/documento
├── painel.css              # estrutura visual do painel (grid, painéis, nós rf-entity, perfil)
└── components/
    ├── flow/               # FlowCanvas, EntityNode, FloatingEdge (React Flow)
    └── painel/              # Topbar, FiltersSidebar, Workspace, DetailsPanel,
                              # PersonProfilePanel, CollapsibleSection
```
