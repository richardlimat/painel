---
name: verify
description: Build, launch and drive the Painel Societário graph app end-to-end with headless Chromium.
---

# Verificando o Painel Societário

App Vite + React (SPA, sem backend). Superfície: navegador.

## Build e launch

```bash
npm run build                                  # tsc -b && vite build
npm run preview -- --port 4173 --host 127.0.0.1 &   # serve dist/
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/   # espera 200
```

`npm run dev` também funciona (porta 5173) para iterar sem rebuild.

## Drive (Playwright)

`playwright-core` está em devDependencies; o Chromium do ambiente fica em
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (passe como `executablePath`).
Scripts .mjs fora do repo precisam de um symlink para `node_modules` (ESM ignora NODE_PATH).

Fluxo principal a dirigir (modo Demonstração — determinístico, sem rede):

1. Preencher `#cnpj` com `12.345.678/0001-90`, submeter → esperar `canvas` + ~2,5s de física.
2. Clicar no centro do canvas → nó raiz selecionado, painel `[role=dialog]` abre.
3. `text=⤢ Expandir Tudo` → rede cresce em ondas (esperar ~6s).
4. Painéis: `text=📊 Estatísticas`, `text=🕑 Timeline`, `text=☰ Filtros`.
5. Exportar: `text=⬇ Exportar` → itens do menu; capturar com `page.waitForEvent('download')`.

## Pegadinhas

- O dropdown da busca do grafo intercepta cliques na toolbar — clicar em outro lugar antes.
- A raiz do modo demo `12345678000190` nasce com situação BAIXADA (nó vermelho): é esperado.
- O modo BrasilAPI depende de rede externa e não expande pessoas (por design).
