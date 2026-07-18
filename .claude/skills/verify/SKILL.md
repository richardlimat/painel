---
name: verify
description: Build, launch and drive the Painel Societário graph app end-to-end with headless Chromium.
---

# Verificando o Painel Societário

App Vite + React (SPA) com duas Vercel Edge Functions como proxy same-origin:
`api/cadastro-pj-plus.ts` (FonteData, CNPJ→sócios) e `api/cpf-ultra.ts`
(APIFull, perfil de pessoa + `sociedades[]`). **Nenhuma das duas tem
controle de acesso** — ver aviso de segurança no README antes de testar num
deployment real/exposto. Superfície: navegador.

## Build e launch

```bash
npm run build                                  # tsc -b && vite build
npm run preview -- --port 4173 --host 127.0.0.1 &   # serve dist/
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/   # espera 200
```

`npm run dev` também funciona (porta 5173) para iterar sem rebuild — mas nem
`npm run dev` nem `npm run preview` servem `/api/*` (Vite não conhece Vercel
Functions); servem só para trabalhar na UI, não são um teste válido da
integração completa. Para exercitar a busca real (FonteData e/ou APIFull) é
preciso `vercel dev` (Vercel CLI) com `FONTEDATA_API_KEY` e
`APIFULL_AUTHORIZATION` no `.env`, ou testar direto numa URL de deploy/preview
da Vercel. Sem isso, só dá para verificar a tela inicial estática e a
validação client-side de CNPJ.

`npm run test` roda a suíte Vitest (normalização de CNPJ/CPF, construção das
URLs, cache/dedup por documento, camadas, dedup de aresta, mascaramento
recursivo, detecção de Base64) — não depende de rede nem de chave.

## Drive (Playwright)

`playwright-core` está em devDependencies; o Chromium do ambiente fica em
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (passe como `executablePath`).
Scripts .mjs fora do repo precisam de um symlink para `node_modules` (ESM ignora NODE_PATH).

Sem rede externa/chaves configuradas, toda consulta falha ("Failed to fetch"
se `/api/*` não existe no servidor atual, ou "Chave... ausente ou inválida"
se a function responde mas a variável não está configurada). Não há CNPJ/CPF
fictício determinístico para smoke test — qualquer teste real consome
créditos pagos das duas APIs, então minimize repetições.

Fluxo principal a dirigir (requer chaves válidas e um CNPJ real conhecido).
Os nós do grafo são DOM (React Flow), seletor `.rf-entity`:

1. Preencher `#cnpj` com um CNPJ real válido, submeter → `page.waitForSelector('.rf-entity')`.
2. Clique simples em `.rf-entity` → seleciona e abre `.details.open`; DUPLO clique → expande.
   Num nó pessoa, clicar (seleção simples) já carrega o perfil da APIFull na seção
   "Perfil completo" do painel (accordion simples, `.profile-section` recolhida por
   padrão) — **sem** expandir o grafo. Controle de camadas: `.layer-control`
   (− / "Camada N" / +) no canto superior esquerdo. Avançar de camada com pessoas na
   fronteira é que dispara a expansão real (APIFull → sociedades[] → FonteData).
   Forças: `.map-config-btn` abre painel com sliders `input[aria-label="Força de repulsão"]`
   etc.; simulação d3-force roda ~3–4s após mudança (debounce 300ms). Limpar
   `localStorage['painel-forcas']` antes de testes que dependem dos padrões.
3. `button:has-text("Expandir Tudo")` → **mostra um `window.confirm` nativo** se houver
   pessoa não-expandida na fronteira (aviso de custo); Playwright precisa tratar o
   dialog (`page.on('dialog', d => d.accept())`) antes de clicar, senão o clique trava
   esperando o dialog. Depois de aceito, rede cresce em ondas (esperar ~8s).
4. Painéis: `button:has-text("Estatísticas")` (painel direito, abas Indicadores/Linha do tempo),
   filtros na sidebar esquerda (`.filter-row`, `.range`).
5. Busca: `input[aria-label="Buscar no grafo"]` + Enter → centraliza o primeiro resultado.
6. Exportar: `button:has-text("Exportar")` → `.export-menu button`; capturar com
   `page.waitForEvent('download')`. O JSON exportado nunca deve conter chaves de
   `SERVICE_RESPONSE` da APIFull (perfil vive num store separado, não no grafo).

## Pegadinhas

- Sem `FONTEDATA_API_KEY`/`APIFULL_AUTHORIZATION` válidas não dá para verificar nada
  além do build/launch estático (tela inicial); qualquer submit de CNPJ ou avanço de
  camada com pessoas vai falhar.
- Avançar camada numa pessoa dispara APIFull + potencialmente várias chamadas
  FonteData (uma por CNPJ em `sociedades[]`) — mais lento e mais caro que a
  expansão de empresa. Uma falha parcial (uma empresa falha, outras não) deixa
  o nó da pessoa não-expandido de propósito (permite retry só do que faltou) —
  não é bug se o nó continuar clicável depois de uma expansão parcial.
- `window.confirm` do "Expandir Tudo" trava a página em Playwright se o dialog
  não for tratado antes do clique.
- "Recolher Tudo" durante "Expandir Tudo" cancela a expansão via `graphEpoch` — testar esse
  probe se mexer na lógica de expansão do store.
- Contagens do "Expandir Tudo"/avanço de camada variam com o tempo de espera (expansão
  em ondas) e com o quadro societário real do CNPJ/CPF usado no teste (não é determinístico).
