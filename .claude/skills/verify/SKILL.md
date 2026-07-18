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

Fluxo principal a dirigir (modo Demonstração — determinístico, sem rede).
Os nós do grafo são DOM (React Flow), seletor `.rf-entity`:

1. Preencher `#cnpj` com `12.345.678/0001-90`, submeter → `page.waitForSelector('.rf-entity')`.
2. Clique simples em `.rf-entity` → seleciona e abre `.details.open`; DUPLO clique → expande.
   Controle de camadas: `.layer-control` (− / "Camada N" / +) sobreposto ao topo do mapa.
3. `button:has-text("Expandir Tudo")` → rede cresce em ondas (esperar ~8s até estabilizar).
4. Painéis: `button:has-text("Estatísticas")` (painel direito, abas Indicadores/Linha do tempo),
   filtros na sidebar esquerda (`.filter-row`, `.range`).
5. Busca: `input[aria-label="Buscar no grafo"]` + Enter → centraliza o primeiro resultado.
6. Exportar: `button:has-text("Exportar")` → `.export-menu button`; capturar com
   `page.waitForEvent('download')`.

## Pegadinhas

- A raiz do modo demo `12345678000190` nasce com situação BAIXADA (nó vermelho): é esperado.
- O modo BrasilAPI depende de rede externa e não expande pessoas (por design).
- "Recolher Tudo" durante "Expandir Tudo" cancela a expansão via `graphEpoch` — testar esse
  probe se mexer na lógica de expansão do store.
- Contagens do "Expandir Tudo" variam com o tempo de espera (a expansão é em ondas).
