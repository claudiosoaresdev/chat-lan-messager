# Aparência fase 1 (tokens, modo claro/escuro, temas): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todas as cores do app passam a vir de tokens; o usuário escolhe Sistema/Claro/Escuro e um de 8 temas (cor + fonte sugerida) numa janela "Aparência" com prévia ao vivo.

**Architecture:** `src/shared/themes.ts` é a fonte da verdade dos tokens (Azul clássico claro = visual atual; escuro desenhado à mão; demais temas por rotação de matiz). O CSS só usa `var(--…)`; os padrões em `:root` espelham o Azul clássico claro. O renderer aplica `data-mode` e os tokens do tema no `<html>`; o main guarda a escolha, ajusta `nativeTheme`/`backgroundColor` e avisa todas as janelas.

**Tech Stack:** Electron 44, TypeScript, CSS custom properties, vitest.

**Spec:** [docs/superpowers/specs/2026-09-26-aparencia-design.md](../specs/2026-09-26-aparencia-design.md) (seção Fase 1)

**Comandos:** `npm test`, `npm run typecheck`, `npm run lint`.

Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Ferramenta de verificação visual:** `/private/tmp/claude-501/-Users-claudiosoares-www-claudiosoaresdev-chat-lan/b4a1cd2e-e55e-4477-86e5-36083d19f8a3/scratchpad/cdp2.cjs` — `node cdp2.cjs <porta> <main|chat=<id>|list> <expressão JS | shot:<arquivo.png>>` controla uma instância empacotada aberta com `--remote-debugging-port`. Instâncias isoladas: `"out/Chat LAN-darwin-arm64/Chat LAN.app/Contents/MacOS/chat-lan" --user-data-dir=<dir> --port=<p> --remote-debugging-port=<dp>`; login pela página: preencher `#view-login input` e `requestSubmit()` no form.

---

### Task 1: Linha de base visual

- [ ] **Step 1:** `npm run package` no estado atual (antes de qualquer mudança de CSS).
- [ ] **Step 2:** Abrir duas instâncias isoladas (portas 47811/47812, depuração 9231/9232), logar como "Teste A"/"Teste B", abrir a conversa A↔B e trocar 2 mensagens.
- [ ] **Step 3:** Capturar em `scratchpad/baseline/`: login (antes de logar, numa terceira instância ou antes do login), home de A, conversa de A, menu ☰ aberto, menu de status aberto, diálogos "Alterar fonte", "Imagem de exibição", "Adicionar contato", ajuda, seletores de emoticon/wink/GIF abertos, barra de atualização (forçar `document.getElementById('update-bar').hidden=false` com texto de exemplo), contato piscando (`is-unread` forçado), contato offline, conversa com contato offline. Nomeie os arquivos pelo estado. Guarde também, para cada captura, o tamanho da janela (`innerWidth×innerHeight`).
- [ ] **Step 4:** Encerrar as instâncias. Nada a commitar (as capturas ficam no scratchpad).

---

### Task 2: Tokens e migração do CSS (parte A)

**Files:** Create `src/shared/theme-tokens.ts`, `src/shared/theme-tokens.test.ts`; Modify `src/index.css`

- [ ] **Step 1: Inventário.** Liste as cores literais (`#hex`, `rgb()/rgba()`, cores nomeadas usadas como cor) de `src/index.css` e agrupe por papel: fundo da página, superfícies (painéis, diálogos, campos), texto (normal, secundário, desativado), bordas (fina, forte), destaque (links, seleção, foco, botões padrão), vidro da barra de título, cabeçalhos com degradê (home, conversa, login), linhas (hover, selecionada), barra de ferramentas, aviso (barra de atualização, erro), não lida (laranja), sombras. Cores de ilustração (winks, emoticons, estrelas, ícones SVG) podem continuar literais com o comentário `/* cor-fixa */` na mesma linha.

- [ ] **Step 2: Definir os tokens** em `src/shared/theme-tokens.ts`:

```ts
// Tokens de cor da interface. Os valores de CLASSIC_LIGHT são o visual original (Azul clássico, modo claro)
// e ficam espelhados no :root do index.css para o primeiro desenho da janela.
export const TOKEN_NAMES = [/* nomes sem o prefixo --, ex.: 'bg', 'surface', 'text', 'accent', … */] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];
export type Tokens = Record<TokenName, string>;
export const CLASSIC_LIGHT: Tokens = { /* valores exatos atuais */ };
```

Regras dos nomes: kebab-case, por **papel** (não por cor): `bg`, `surface`, `surface-2`, `text`, `text-muted`, `border`, `border-strong`, `accent`, `accent-soft`, `accent-text`, `link`, `focus`, `title-glass`, `title-text`, `title-line`, `header-bg`, `row-hover`, `row-selected`, `field-bg`, `field-border`, `btn-face`, `btn-border`, `warning-bg`, `warning-border`, `unread`, `unread-soft`, `shadow`… Degradês podem ser um token só com o valor completo (`linear-gradient(...)`). Reaproveite os nomes que já existem no `:root` (`--title-glass`, `--text`, `--muted`, `--link`…) quando o papel é o mesmo, para reduzir a mudança. Mantenha `--st-available/away/busy/offline` fixos (status). Alvo: 25–45 tokens; se precisar de mais, está granular demais.

- [ ] **Step 3: Teste dos tokens** (`src/shared/theme-tokens.test.ts`):
  - `:root` do `src/index.css` declara exatamente os tokens de `TOKEN_NAMES` com os valores de `CLASSIC_LIGHT` (leia o arquivo com `fs`, extraia o bloco `:root { … }` e compare).
  - Fora do bloco `:root` inicial, nenhuma linha de `src/index.css` contém `#hex`, `rgb(`, `rgba(`, `hsl(` salvo se a linha tiver `/* cor-fixa */`, ou se a cor estiver dentro de `var(--x, fallback)` (não permitido: não use fallback literal).
  - Rode e veja falhar.

- [ ] **Step 4: Migrar a parte A** do `src/index.css`: seções do início até o fim de "home (lista de contatos, estilo WLM)", mais "menu de status", "diálogos", "toast" e "aviso de atualização". Troque cada literal pelo token do seu papel. `rgba()` de sombras/véus: use tokens (`--shadow`, `--overlay`) ou `color-mix(in srgb, var(--token) N%, transparent)`.

- [ ] **Step 5:** O teste do Step 3 ainda falha só por linhas das seções da parte B (conversa, emoticons, GIFs, winks, divisor, alterar fonte, imagem de exibição). Confirme isso listando as linhas restantes.
- [ ] **Step 6: Verificação visual.** `npm run package`, repita as capturas da Task 1 para as telas da parte A e compare com a linha de base: devem ser **idênticas** (compare os bytes dos PNG; se diferirem, compare visualmente lado a lado com a ferramenta Read e corrija até não haver diferença perceptível — reporte qualquer diferença residual).
- [ ] **Step 7: Commit** `src/shared/theme-tokens.ts src/shared/theme-tokens.test.ts src/index.css` — mensagem `Aparência: tokens de cor (parte A do CSS)`. (O teste do Step 3 pode ser marcado `it.todo` para as seções da parte B até a Task 3; documente no commit.)

---

### Task 3: Migração do CSS (parte B) e cores no TypeScript

**Files:** Modify `src/index.css`, `src/shared/theme-tokens.ts` (se faltar token), `src/shared/theme-tokens.test.ts`, arquivos de `src/renderer/*.ts` que definem cores de interface

- [ ] **Step 1:** Migrar as seções restantes (conversa, emoticons, GIFs, winks, divisor, alterar fonte, imagem de exibição). Ilustrações com `/* cor-fixa */`.
- [ ] **Step 2:** Revisar cores definidas no TypeScript do renderer (`grep -n "#[0-9a-fA-F]\{3,6\}\|rgb" src/renderer/*.ts`): paleta de cores das mensagens (`font.ts` COLORS) e cores de ilustração (winks, emoticons, avatares padrão) continuam literais; cores de **interface** aplicadas via `style` passam a usar `var(--token)`.
- [ ] **Step 3:** Remover o `it.todo` e deixar o teste de "nenhuma cor literal" completo passando.
- [ ] **Step 4: Verificação visual** de todas as telas da Task 1: idênticas à linha de base.
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm test`.
- [ ] **Step 6: Commit** — `Aparência: tokens de cor (parte B e renderer)`.

---

### Task 4: Azul clássico escuro, temas e contraste

**Files:** Modify `src/shared/theme-tokens.ts`; Create `src/shared/themes.ts`, `src/shared/themes.test.ts`, `src/shared/color.ts`, `src/shared/color.test.ts`

- [ ] **Step 1: Utilitários de cor** (`src/shared/color.ts`, com testes): `parseHex`, `toHex`, `rgbToHsl`, `hslToRgb`, `luminance` (sRGB relativa WCAG), `contrast(a, b)` (1–21), `rotateHue(hex, degrees, saturationScale = 1)`, e `mapColors(value, fn)` que aplica `fn` a cada `#hex` dentro de um valor (inclusive dentro de `linear-gradient(...)`). Testes: contraste preto/branco = 21, #777 sobre branco ≈ 4,48, rotação de 120° de vermelho puro dá verde puro, `mapColors` preserva o texto do degradê.

- [ ] **Step 2: `CLASSIC_DARK`** em `theme-tokens.ts`: conjunto escuro desenhado à mão para todos os tokens. Diretrizes: fundo `#1b1f27`-ish, superfícies em degraus levemente mais claras, texto `#e6ebf2`, texto secundário ≥ 4,5:1 sobre as superfícies, bordas discretas, destaque azul mais claro que no modo claro (≥ 4,5:1 como texto/link sobre o fundo), **vidro escuro** da barra de título (degradê azul-marinho com brilho sutil, não a inversão do claro), cabeçalhos com degradê escuro coerente, linha selecionada azul escuro com texto legível, aviso âmbar escuro, não lida laranja escuro com texto legível.

- [ ] **Step 3: Temas** (`src/shared/themes.ts`):

```ts
export type ThemeMode = 'light' | 'dark';
export interface Theme {
  id: string;
  name: string;
  /** Cor representativa (cartão do tema). */
  swatch: string;
  /** Rotação de matiz em graus a partir do Azul clássico e escala de saturação. */
  hue: number;
  saturation: number;
  /** Fonte sugerida das mensagens (favorita do Google ou clássica). */
  font: string;
  /** Cena padrão (usada na fase 2). */
  scene: string;
}
export const THEMES: readonly Theme[] = [ /* 8 temas, Azul clássico primeiro com hue 0 e saturation 1 */ ];
export const DEFAULT_THEME = 'azul-classico';
export function findTheme(id: string): Theme | undefined;
/** Tokens do tema no modo: Azul clássico usa os conjuntos à mão; os demais giram os tokens cromáticos. */
export function themeTokens(id: string, mode: ThemeMode): Tokens;
```

Fontes: Azul clássico `Segoe UI`, Verde `Nunito`, Rosa `Raleway`, Roxo `Rubik`, Laranja `Manrope`, Menta `DM Sans`, Vermelho `Oswald`, Grafite `Inter`. Cenas (placeholder para a fase 2): `ceu`, `folhas`, `petalas`, `aurora`, `por-do-sol`, `ondas`, `brasas`, `pontilhado`.

Rotação: aplique `rotateHue` só aos tokens **cromáticos** (saturação HSL > 0,15) — neutros (cinzas, branco, preto) ficam. Grafite: `saturation` 0,15 (quase cinza). Ajuste fino: se algum par falhar no contraste, corrija clareando/escurecendo o token do texto/destaque do tema (função de correção automática por luminância, não valores mágicos por tema).

- [ ] **Step 4: Teste de contraste** (`themes.test.ts`): para cada tema × modo, `contrast` ≥ 4,5 para os pares de texto (defina a lista de pares no teste: `text/bg`, `text/surface`, `text-muted/surface`, `link/surface`, `accent-text/accent`, `title-text/<cor média do title-glass>`, texto sobre `row-selected`, texto sobre `warning-bg`, texto sobre `unread-soft`…) e ≥ 3 para `border-strong/surface` e `focus/surface`. Para degradês, use a média das cores do degradê. Também: `themeTokens('azul-classico','light')` é exatamente `CLASSIC_LIGHT`; todo tema tem todos os tokens; fontes sugeridas existem (`isKnownFont`).
- [ ] **Step 5:** `npx vitest run src/shared` → PASS.
- [ ] **Step 6: Commit** — `Aparência: modo escuro e 8 temas com contraste verificado`.

---

### Task 5: Guardar, aplicar e sincronizar a aparência

**Files:** Modify `src/main/config.ts` (+ teste), `src/shared/api.ts`, `src/preload.ts`, `src/main.ts`; Create `src/renderer/appearance.ts`; Modify `src/renderer.ts`, `src/renderer/font.ts`

- [ ] **Step 1: Configuração.** `Settings.appearance: { mode: 'system' | 'light' | 'dark'; theme: string }` (padrão `{ mode: 'system', theme: 'azul-classico' }`; valores inválidos no arquivo → padrão). Teste no `config.test.ts`.
- [ ] **Step 2: API/IPC.** `getAppearance()`, `setAppearance(a)` (valida modo e `findTheme`), evento `onAppearanceChanged`. `setAppearance` salva, atualiza `nativeTheme.themeSource` (`'system'|'light'|'dark'`), troca o `backgroundColor` de todas as janelas para `themeTokens(theme, efetivo).bg` e faz broadcast. Na criação de janelas, use o `bg` do modo efetivo (`nativeTheme.shouldUseDarkColors` quando `system`). Escute `nativeTheme.on('updated')` para refazer o `backgroundColor` quando o SO muda.
- [ ] **Step 3: Renderer** (`src/renderer/appearance.ts`): `applyAppearance(a)` resolve o modo efetivo (`matchMedia('(prefers-color-scheme: dark)')` quando `system`), põe `document.documentElement.dataset.mode`, e aplica cada token com `document.documentElement.style.setProperty('--' + nome, valor)`. Escuta `matchMedia(...).addEventListener('change', …)` e `chat().onAppearanceChanged`. `initAppearance()` é chamado no início de `src/renderer.ts` (antes de qualquer tela) para as duas janelas. Exporte `previewAppearance(a)` (aplica sem salvar) para o diálogo.
- [ ] **Step 4: Cor das mensagens legível no fundo atual** (`font.ts` `readableColor`): em vez de só escurecer cores claras, garanta contraste ≥ 3:1 contra `getComputedStyle(document.documentElement).getPropertyValue('--surface')` (o fundo da conversa): se falhar, ajuste a luminosidade da cor (clareando no escuro, escurecendo no claro) até passar. Extraia a lógica pura para `src/shared/color.ts` (`ensureContrast(hex, bgHex, min)`) com teste. Mensagens já exibidas devem ser reajustadas quando o modo muda (recalcule em `onAppearanceChanged`: guarde a cor original em `dataset.color` de cada linha e reaplique).
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm test`.
- [ ] **Step 6: Commit** — `Aparência: guardar, aplicar e sincronizar modo e tema`.

---

### Task 6: Janela "Aparência"

**Files:** Modify `index.html`, `src/index.css`, `src/renderer/home.ts`; Create `src/renderer/appearance-dialog.ts`

- [ ] **Step 1: HTML** `<dialog class="msn-dialog appearance-dialog" id="appearance-dialog">` no padrão dos outros diálogos (barra de título com a borboleta): seção "Modo" com controle segmentado (Sistema / Claro / Escuro, `role="radiogroup"`, ícones sol/lua/monitor em SVG inline no padrão dos símbolos do `index.html`); seção "Tema — cor, cena e fonte" com grade de 8 cartões (`role="radiogroup"`): cada cartão tem uma mini-janela de prévia (barra de título com o `title-glass` do tema, faixa de cabeçalho, duas linhas de "mensagem" na fonte sugerida), nome e fonte; rodapé com "Personalizado · Restaurar tema" (só quando personalizado), "Cancelar" e "OK" (OK é o botão padrão). Acessível pelo teclado (setas movem dentro dos radiogroups, Enter confirma, Esc cancela).
- [ ] **Step 2: Comportamento** (`appearance-dialog.ts`): ao abrir, guarda a aparência e a fonte atuais; cada clique chama `previewAppearance` (prévia ao vivo na janela) **e** faz broadcast de prévia para as outras janelas (pode ser um `setAppearance` provisório com flag `preview: true` que não salva, ou aplicar só na janela atual — escolha a mais simples que mostre a prévia em todas as janelas abertas e documente); escolher tema aplica também a fonte sugerida (mantendo tamanho/cor/sublinhado do usuário, peso 400, sem itálico) — só é salva no OK. Cancelar/Esc restaura tudo. OK salva aparência e fonte.
- [ ] **Step 3: Personalizado:** o tema aparece "Personalizado" quando a fonte atual das mensagens difere da fonte sugerida do tema; "Restaurar tema" reaplica a fonte sugerida. (Na fase 2 a cena entra na mesma regra.)
- [ ] **Step 4: Menu ☰** da home ganha "Aparência…" (acima de "Sons de mensagem").
- [ ] **Step 5: CSS** do diálogo só com tokens; cartões com foco visível; tamanho cabe na janela de login/home (a home é estreita: 440 px — a grade vira 2 colunas quando necessário).
- [ ] **Step 6:** `npm run typecheck && npm run lint && npm test`; build do renderer.
- [ ] **Step 7: Commit** — `Aparência: janela de modo e temas`.

---

### Task 7: Verificação manual e README

- [ ] **Step 1:** `npm run package`; instâncias A/B como na Task 1.
- [ ] **Step 2: Roteiro.**
  1. Azul clássico claro: capturas idênticas à linha de base.
  2. Para **cada tema** nos modos claro e escuro: capturas de home, conversa (com mensagens de cores variadas, incluindo preta e amarela), menu ☰, "Alterar fonte" e "Aparência". Revisar visualmente: legibilidade, vidro da barra de título, cabeçalhos, seleção, contato piscando, barra de atualização.
  3. Modo Sistema: trocar o modo do macOS não é automatizável aqui — simular com `Emulation.setEmulatedMedia` (`prefers-color-scheme`) via CDP e confirmar que a janela troca sem recarregar.
  4. Prévia ao vivo: abrir Aparência na home com uma conversa aberta; trocar tema → conversa muda junto; Cancelar → volta; OK → persiste após reiniciar.
  5. Tema aplica a fonte sugerida; mudar a fonte em "Alterar fonte" → Aparência mostra "Personalizado"; "Restaurar tema" volta a fonte.
  6. Sem flash branco ao abrir uma conversa no modo escuro (capturar logo após `openChat`).
- [ ] **Step 3: README:** seção "Aparência" (modo, temas, fonte sugerida, personalizado).
- [ ] **Step 4: Commit** — `README: aparência (modo e temas)`.
