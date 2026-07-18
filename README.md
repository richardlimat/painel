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
  histórico societário e navegação para nós relacionados.
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

| Provedor | CNPJ → sócios | CPF → empresas |
|---|---|---|
| **FonteData** (`cadastro-pj-plus`) | ✅ | ❌ (endpoint não oferece busca reversa por CPF) |

A chamada é feita direto do navegador com a chave em `VITE_FONTEDATA_API_KEY`
(sem backend/proxy — a chave fica exposta no bundle do cliente, aceitável
apenas para uso interno/restrito).

## Rodando

```bash
cp .env.example .env   # preencha VITE_FONTEDATA_API_KEY com sua chave da FonteData
npm install
npm run dev        # http://localhost:5173
npm run build      # produção em dist/
npm run preview
```

## Arquitetura

```
src/
├── types/graph.ts          # modelo de grafo: nós Pessoa/Empresa, relacionamentos tipados
├── services/
│   ├── provider.ts         # interface DataProvider (plugável)
│   └── fontedata.ts        # provedor real (API comercial FonteData)
├── store/graphStore.ts     # Zustand: expansão BFS, dedupe/anti-loop, filtros, tema
├── lib/
│   ├── filtering.ts        # filtros dinâmicos + estatísticas + grau dos nós
│   ├── flowLayout.ts       # layout radial + posicionamento incremental
│   ├── exporters.ts        # PNG/SVG/PDF/JSON/CSV
│   ├── colors.ts           # identidade visual de nós e conexões (paleta do painel)
│   └── format.ts           # CNPJ/CPF/moeda/data
├── painel.css              # estrutura visual do painel (grid, painéis, nós rf-entity)
└── components/
    ├── flow/               # FlowCanvas, EntityNode, FloatingEdge (React Flow)
    └── painel/              # Topbar, FiltersSidebar, Workspace, DetailsPanel
```
