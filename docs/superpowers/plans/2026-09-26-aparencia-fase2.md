# Aparência fase 2 (cenas e papel de parede): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O usuário escolhe uma cena (galeria embutida, imagem própria ou nenhuma); ela aparece no topo da lista de contatos e da conversa (com degradê) e atrás das mensagens (com véu), sempre legível.

**Architecture:** Galeria = SVGs em `public/scenes/` listados em `src/shared/scenes.ts`. Imagens próprias = JPEG 1600×900 em `userData/scenes/` (store no main, como as imagens de exibição), entregues ao renderer por IPC e exibidas como `blob:`. A escolha fica em `appearance.scene`; `null` = cena padrão do tema. O renderer põe a imagem em `--scene-image` e mede o brilho do topo para escolher texto claro/escuro sobre a cena.

**Tech Stack:** Electron 44, TypeScript, CSS custom properties, canvas, vitest.

**Spec:** [docs/superpowers/specs/2026-09-26-aparencia-design.md](../specs/2026-09-26-aparencia-design.md) (Fase 2)

**Comandos:** `npm test`, `npm run typecheck`, `npm run lint`. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Verificação visual:** mesma ferramenta da fase 1 (`scratchpad/cdp2.cjs`, instâncias empacotadas isoladas com `--user-data-dir`, `--port`, `--remote-debugging-port`; só mensagens A↔B).

---

### Task 1: Galeria de cenas (SVG)

**Files:** Create `public/scenes/*.svg`, `src/shared/scenes.ts`, `src/shared/scenes.test.ts`

- [ ] **Step 1:** Desenhe 10 cenas SVG paisagem (`viewBox="0 0 1600 900"`, `preserveAspectRatio="xMidYMid slice"` no uso), leves (≤ 12 KB cada, sem imagens embutidas, sem scripts, sem fontes, sem `<foreignObject>`), no clima do WLM: `ceu` (céu azul com nuvens), `folhas` (folhagem verde estilizada), `petalas` (pétalas rosadas), `aurora` (aurora roxa/verde), `por-do-sol` (laranja), `ondas` (ondas menta/azul), `brasas` (vermelho quente abstrato), `pontilhado` (padrão de pontos grafite), `noite-estrelada`, `montanhas`. Os 8 primeiros são as cenas padrão dos temas (`THEMES[].scene`). A parte de cima (≈ 20% da altura) deve ter detalhe suficiente para ficar bonita atrás do cabeçalho; nada de texto nas imagens.
- [ ] **Step 2:** `src/shared/scenes.ts`: `export interface BuiltinScene { id: string; name: string }`, `BUILTIN_SCENES` (10, nomes em português), `findBuiltinScene(id)`. Tipo da escolha:

```ts
/** Cena escolhida: da galeria, imagem própria (id do arquivo) ou nenhuma. null em Appearance = padrão do tema. */
export type SceneChoice = { kind: 'builtin'; id: string } | { kind: 'custom'; id: string } | { kind: 'none' };
export function validateSceneChoice(v: unknown): SceneChoice | null; // custom id: /^[0-9a-f]{16}$/
```

- [ ] **Step 3: Testes:** todos os `THEMES[].scene` existem em `BUILTIN_SCENES`; cada SVG existe em `public/scenes/<id>.svg`, tem ≤ 12 KB, `viewBox="0 0 1600 900"`, e não contém `<script`, `href="http`, `<image`, `<foreignObject`, `on[a-z]+=`; `validateSceneChoice` aceita/recusa os formatos.
- [ ] **Step 4: Verificação visual:** abra cada SVG com a ferramenta Read (renderiza) e itere até ficarem bonitos e coerentes com os temas. Monte uma prancha (contact sheet) em `scratchpad/cenas/`.
- [ ] **Step 5: Commit** — `Cenas: galeria embutida`.

---

### Task 2: Cena na aparência e imagens próprias no main

**Files:** Modify `src/shared/themes.ts` (Appearance), `src/main/config.ts` (+ teste), `src/shared/api.ts`, `src/preload.ts`, `src/main.ts`; Create `src/main/scene-store.ts`, `src/main/scene-store.test.ts`

- [ ] **Step 1:** `Appearance.scene: SceneChoice | null` (padrão `null` = cena do tema). `validateAppearance` valida com `validateSceneChoice` (custom inexistente é tratado no main: se o arquivo não existir, cai para `null`). Testes de config: arquivo antigo sem `scene` → `null`.
- [ ] **Step 2: `SceneStore`** (padrão do `AvatarStore`): pasta `userData/scenes/`; `add(data: Uint8Array)` valida JPEG (assinatura `FF D8 FF`), ≤ 400 KB, grava `<sha1 16 hex>.jpg`, devolve `{ id }`; `list()` → `{ id, data }[]` (mais recentes primeiro, no máximo 12 — ao passar, apaga as mais antigas que não estão em uso); `get(id)`; `remove(id)`. Nomes só `[0-9a-f]{16}`. Testes com pasta temporária.
- [ ] **Step 3: IPC:** `listCustomScenes()`, `addCustomScene(bytes)`, `removeCustomScene(id)` (se for a cena em uso, a aparência volta para `null` e é salva/broadcast), `getCustomScene(id)` → bytes. `setAppearance`/`previewAppearance` aceitam `scene`.
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test`. **Commit** — `Cenas: escolha na aparência e imagens próprias`.

---

### Task 3: Exibir a cena (topo e fundo das mensagens)

**Files:** Create `src/renderer/scene.ts`, `src/renderer/scene-tone.ts`, `src/renderer/scene-tone.test.ts`; Modify `src/renderer/appearance.ts`, `src/index.css`, `index.html` (se precisar de camadas)

- [ ] **Step 1: Resolver a cena efetiva:** `appearance.scene ?? { kind: 'builtin', id: theme.scene }`; builtin → URL relativa `scenes/<id>.svg`; custom → bytes por IPC → `blob:` (revogar o anterior); none → sem imagem. Aplicar em `document.documentElement.style.setProperty('--scene-image', 'url("…")')` ou `none`, e `data-scene="on|off"` no `<html>`.
- [ ] **Step 2: Tom do topo** (`scene-tone.ts`, puro + teste): dado um `Uint8ClampedArray` RGBA da faixa superior (desenhe a imagem num canvas 160×40 correspondente aos 20% de cima com o mesmo recorte `cover`), calcule a luminância média e a variação (desvio padrão); `tone = média > 0.55 ? 'light' : 'dark'`, `busy = desvio > 0.18`. Aplique `data-scene-tone` e `data-scene-busy` no `<html>`.
- [ ] **Step 3: CSS.**
  - Topo: `.home-header` e `.chat-header` ganham camada de cena atrás do conteúdo: `background-image: var(--scene-image)` com `background-size: cover; background-position: center top`, altura estendida (≈ 150–180 px na home, cobrindo cabeçalho + busca; na conversa, cabeçalho + barra de ferramentas) e um degradê para `var(--bg)`/`var(--surface)` na parte de baixo (`linear-gradient(to bottom, transparent 40%, var(--surface))` por cima da imagem). Sem cena, fica o `--header-bg` de hoje.
  - Texto sobre a cena: com `data-scene-tone="dark"` o texto do cabeçalho usa um token claro (`--scene-text-on-dark`, ex.: `#fff`) e com `light` um escuro (`--scene-text-on-light`); `text-shadow` sutil de legibilidade; com `data-scene-busy="true"`, o bloco de nome/mensagem pessoal/endereço (e o nome do contato na conversa) ganha uma faixa translúcida (`color-mix(in srgb, var(--surface) 70%, transparent)` com `border-radius`). Novos tokens entram no `theme-tokens.ts`/`:root`/bloco escuro (valores iguais em todos os temas se fizer sentido).
  - Fundo das mensagens: `.chat-body` (ou `.conversation`) com `background-image: linear-gradient(color-mix(in srgb, var(--surface) var(--scene-veil), transparent), color-mix(in srgb, var(--surface) var(--scene-veil), transparent)), var(--scene-image)`; `background-size: cover; background-attachment: local` ou `fixed` (escolha o que não “escorrega” ao rolar), `--scene-veil: 88%` no claro e `82%` no escuro.
  - `@media (prefers-reduced-motion: reduce)`: sem transição; fora disso, troca de cena com `transition: background-image` não funciona — use um fade simples de opacidade numa camada `::before` se quiser animar (opcional).
- [ ] **Step 4:** Mensagens, campo de texto e avisos continuam com o contraste do tema (o véu garante): confirme com uma verificação no teste de contraste que `text` sobre `mix(surface 82%, preto)` e sobre `mix(surface 82%, branco)` passa 4,5 em todos os temas escuros (e 88% nos claros).
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm test`. **Commit** — `Cenas: topo e fundo das mensagens com legibilidade`.

---

### Task 4: Cena na janela Aparência

**Files:** Modify `index.html`, `src/renderer/appearance-dialog.ts`, `src/index.css`; reaproveite o recorte de `src/renderer/avatar.ts` (extraia uma função genérica se precisar)

- [ ] **Step 1:** Seção "Cena" abaixo dos temas: grade de miniaturas (galeria + imagens próprias com **×** para remover, + botão "Procurar…" + opção "Nenhuma"), `role="radiogroup"`, teclado como na grade de temas. A cena padrão do tema selecionado ganha um selo "do tema".
- [ ] **Step 2: Procurar…:** PNG/JPEG/WebP/GIF; recorte central 16:9, redução para 1600×900, JPEG com qualidade decrescente até ≤ 400 KB; `addCustomScene`; seleciona a nova.
- [ ] **Step 3: Regras:** escolher cena faz prévia ao vivo (todas as janelas); escolher tema volta a cena para `null` (a do tema) — exceto ao voltar ao tema inicial, que restaura a cena inicial (mesma lógica da fonte); "Personalizado" quando a fonte **ou** a cena diferem do tema; "Restaurar tema" volta ambas. OK salva tudo junto; Cancelar desfaz. Os cartões de tema mostram a cena do tema na mini-janela.
- [ ] **Step 4:** Cabe na home (440 px) com rolagem interna se preciso; tokens apenas.
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm test`. **Commit** — `Cenas: escolha na janela Aparência`.

---

### Task 5: Verificação manual e README

- [ ] **Step 1:** `npm run package`; instâncias A/B.
- [ ] **Step 2: Roteiro:** para 3 temas (Azul clássico, Roxo, Laranja) × claro/escuro, capturas de home e conversa com a cena padrão; cena "Nenhuma"; imagem própria clara (ex.: foto de céu) e escura (ex.: noite) e uma "agitada" (padrão contrastado) — conferir tom do texto e faixa translúcida; mensagens legíveis sobre o fundo; rolar a conversa longa (imagem não pisca nem desalinha); remover a imagem própria em uso volta para a cena do tema; "Personalizado"/"Restaurar tema"; reiniciar mantém a cena.
- [ ] **Step 3: README:** seção "Aparência" ganha "Cenas".
- [ ] **Step 4: Commit** — `README: cenas`.
