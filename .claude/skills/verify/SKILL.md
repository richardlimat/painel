---
name: verify
description: Build, launch and drive the Painel Societário graph app end-to-end with headless Chromium.
---

# Verificando o Painel Societário

App Vite + React (SPA) com uma Vercel Edge Function (`api/cadastro-pj-plus.ts`)
como proxy same-origin para a FonteData. Superfície: navegador.

## Build e launch

```bash
npm run build                                  # tsc -b && vite build
npm run preview -- --port 4173 --host 127.0.0.1 &   # serve dist/
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/   # espera 200
```

`npm run dev` também funciona (porta 5173) para iterar sem rebuild — mas nem
`npm run dev` nem `npm run preview` servem `/api/*` (Vite não conhece Vercel
Functions); servem só para trabalhar na UI, não são um teste válido da
integração completa. Para exercitar a busca real (que chama
`/api/cadastro-pj-plus`) é preciso `vercel dev` (Vercel CLI) com
`FONTEDATA_API_KEY` no `.env`, ou testar direto numa URL de deploy/preview
da Vercel. Sem isso, só dá para verificar a tela inicial estática e a
validação client-side de CNPJ.

`npm run test` roda a suíte Vitest (normalização de CNPJ, construção da URL
da FonteData, separação CPF/CNPJ, cache por documento) — não depende de rede
nem de chave.

## Drive (Playwright)

`playwright-core` está em devDependencies; o Chromium do ambiente fica em
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (passe como `executablePath`).
Scripts .mjs fora do repo precisam de um symlink para `node_modules` (ESM ignora NODE_PATH).

O único provedor de dados é a FonteData (API comercial, real, sem modo
demonstração): a expansão end-to-end depende de rede externa, de `vercel dev`
(ou deploy real) servindo `/api/cadastro-pj-plus`, e de `FONTEDATA_API_KEY`
configurada — sem isso, toda consulta falha ("Failed to fetch" se `/api/*`
não existe no servidor atual, ou "Chave de API da FonteData ausente ou
inválida" se a function responde mas a chave não está configurada). Não há
mais CNPJ fictício determinístico para smoke test.

Fluxo principal a dirigir (requer chave válida e um CNPJ real conhecido).
Os nós do grafo são DOM (React Flow), seletor `.rf-entity`:

1. Preencher `#cnpj` com um CNPJ real válido, submeter → `page.waitForSelector('.rf-entity')`.
2. Clique simples em `.rf-entity` → seleciona e abre `.details.open`; DUPLO clique → expande.
   Controle de camadas: `.layer-control` (− / "Camada N" / +) no canto superior esquerdo.
   Forças: `.map-config-btn` abre painel com sliders `input[aria-label="Força de repulsão"]`
   etc.; simulação d3-force roda ~3–4s após mudança (debounce 300ms). Limpar
   `localStorage['painel-forcas']` antes de testes que dependem dos padrões.
3. `button:has-text("Expandir Tudo")` → rede cresce em ondas (esperar ~8s até estabilizar).
4. Painéis: `button:has-text("Estatísticas")` (painel direito, abas Indicadores/Linha do tempo),
   filtros na sidebar esquerda (`.filter-row`, `.range`).
5. Busca: `input[aria-label="Buscar no grafo"]` + Enter → centraliza o primeiro resultado.
6. Exportar: `button:has-text("Exportar")` → `.export-menu button`; capturar com
   `page.waitForEvent('download')`.

## Pegadinhas

- Sem `FONTEDATA_API_KEY` válida não dá para verificar nada além do build/launch
  estático (tela inicial); qualquer submit de CNPJ vai falhar.
- A FonteData não expande pessoas (busca reversa CPF → empresas não suportada, por
  design) — duplo clique num nó de pessoa mostra o aviso `notice`, não expande.
- "Recolher Tudo" durante "Expandir Tudo" cancela a expansão via `graphEpoch` — testar esse
  probe se mexer na lógica de expansão do store.
- Contagens do "Expandir Tudo" variam com o tempo de espera (a expansão é em ondas) e com
  o tamanho real do quadro societário do CNPJ usado no teste (não é mais determinístico).
