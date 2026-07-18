# Painel de Consultas — Inteligência Societária (Graph Intelligence)

Módulo de inteligência societária com visualização em grafo interativo (React Flow):
a partir de um CNPJ, o sistema descobre a estrutura societária em múltiplas camadas
(empresa → sócios → outras empresas dos sócios → …), com expansão sob demanda e
prevenção de loops.

![stack](https://img.shields.io/badge/React%2018-TypeScript-blue) ![vite](https://img.shields.io/badge/Vite-5-purple)

## Interface

Layout em grade, sempre em modo claro: topbar com busca inteligente e ações;
sidebar esquerda com filtros (switches), profundidade e legenda; workspace
central com breadcrumb, indicador de nível e o mapa React Flow (nós circulares
com cartão de rótulo, arestas com chip de relacionamento, controles centrais e
minimapa); painel direito de detalhes com abas (Visão geral / Sócios /
Histórico) e modo Estatísticas (Indicadores / Linha do tempo).

## Funcionalidades

- **Mapa interativo em React Flow** (@xyflow/react): pan, zoom, arrastar nós (posição
  preservada), minimapa, controles, layout radial automático e botão **Reorganizar**.
- **Expansão inteligente**: carrega inicialmente só a empresa pesquisada + sócios; cada
  clique expande a próxima camada. Botões **Expandir Tudo** (BFS até o limite de níveis,
  com teto de segurança de 600 nós) e **Recolher Tudo**.
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
- **Breadcrumb** de navegação, **mini mapa** da rede, **painel de estatísticas**
  (totais, capital somado, estados, municípios, CNAEs) e **linha do tempo** societária.
- **Exportação**: PNG em alta resolução, SVG, PDF (preservando o layout), JSON completo
  e CSV das conexões.
- **Layout responsivo** (drawers em mobile), sempre em modo claro.

## Fontes de dados

A camada de dados é plugável (`src/services/provider.ts`):

| Provedor | CNPJ → sócios | CPF → empresas |
|---|---|---|
| **Demonstração** (padrão) | ✅ rede sintética determinística | ✅ |
| **BrasilAPI** (Receita Federal, dados abertos) | ✅ | ❌ (nenhuma API pública gratuita oferece busca reversa por CPF) |

Para expansão completa em produção, implemente `DataProvider` sobre um provedor
comercial (CNPJá, BigDataCorp, Serasa, base interna etc.).

## Rodando

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # produção em dist/
npm run preview
```

No modo demonstração, qualquer CNPJ de 14 dígitos funciona (ex.: `12.345.678/0001-90`).

## Arquitetura

```
src/
├── types/graph.ts          # modelo de grafo: nós Pessoa/Empresa, relacionamentos tipados
├── services/
│   ├── provider.ts         # interface DataProvider (plugável)
│   ├── brasilapi.ts        # provedor real (dados abertos da Receita)
│   └── demoProvider.ts     # rede sintética determinística p/ demonstração
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
