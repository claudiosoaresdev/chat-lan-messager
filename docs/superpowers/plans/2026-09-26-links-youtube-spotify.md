# Links, YouTube e "O que estou ouvindo": plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Links clicáveis nas mensagens, com prévia (título, site, miniatura) como no WhatsApp; (2) link do YouTube vira um cartão que toca o vídeo dentro da conversa e pode ser "destacado" numa janela flutuante sempre-no-topo que se arrasta pela tela (picture-in-picture); (3) a barra acima da conversa perde "Enviar imagem" e "Chamar atenção" e vira um letreiro animado com a música que está tocando no Spotify.

**Architecture:** Mesmo princípio do GIPHY: **só o processo principal acessa a internet**, a interface continua presa pelo CSP e **quem recebe não precisa de internet** para ver a prévia — o remetente busca os metadados Open Graph (as tags `og:*` / `twitter:*`, que é o que o WhatsApp lê), reduz a miniatura e manda tudo pela LAN numa mensagem nova `preview` (cabeçalho JSON + frame binário, no molde de `avatar`/`scene`). Tocar o vídeo do YouTube aí sim exige internet em quem assiste. A música vem do Spotify **instalado no computador** (sem conta/OAuth): AppleScript no macOS, título da janela no Windows, MPRIS no Linux; vai para os contatos numa mensagem nova `listening`.

**Tech Stack:** Electron 44, TypeScript, `ws`, vitest. Sem dependências novas.

**Comandos:** `npm test`, `npm run typecheck`, `npm run lint`. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Compatibilidade:** versões antigas ignoram tipos de mensagem desconhecidos (`parseMessage` → `null`), então `preview` e `listening` não quebram contatos desatualizados — eles só veem o texto com o link.

---

## Fase A — Links clicáveis

### Task A1: Detectar URLs no texto

**Files:** Create `src/shared/links.ts`, `src/shared/links.test.ts`

- [ ] `findLinks(text): Array<{ start: number; end: number; url: string }>` — reconhece `http://`, `https://` e `www.` (vira `https://www.…`). Pontuação final (`.`, `,`, `)`, `!`, `?`, `:`, `;`, aspas) fica fora do link, exceto `)` balanceado (links da Wikipédia).
- [ ] `normalizeUrl(raw): string | null` — `new URL`, só `http:`/`https:`, sem usuário/senha, até 2048 caracteres.
- [ ] Testes: link no meio da frase, vários links, pontuação final, parênteses, `www.`, `javascript:`/`file:`/`data:` recusados, IPs da LAN (`http://192.168.0.10:3000`) aceitos.
- [ ] Commit — `Links: detectar URLs nas mensagens`.

### Task A2: Renderizar links (antes dos emoticons)

**Files:** Modify `src/renderer/emoticon-codes.ts` (`tokenize`), `src/renderer/emoticons.ts` (`renderRichText`), `src/index.css`

- [ ] `tokenize` corta primeiro os trechos de link e só procura emoticons no resto (senão `:/` de `https://` ou `8)` num caminho viram carinha). Novo token `{ link: string; text: string }`.
- [ ] `renderRichText` gera `<a class="msg-link" href=… target="_blank" rel="noopener noreferrer">` com `textContent` (nunca HTML). O clique já passa pelo `setWindowOpenHandler` de `src/main.ts` → `shell.openExternal` só para http(s).
- [ ] Mensagem pessoal do contato (cabeçalho) e lista de contatos continuam usando `renderRichText`: links clicáveis lá também — ok.
- [ ] Estilo: sublinhado, cor de link do tema (token novo `--link` em `theme-tokens.ts`, contraste checado como os outros), legível sobre a cena.
- [ ] Testes de `tokenize` com links + emoticons misturados.
- [ ] Commit — `Links: clicáveis na conversa`.

## Fase B — Prévia de links (Open Graph)

### Task B1: Buscar metadados no processo principal

**Files:** Create `src/main/link-preview.ts`, `src/main/link-preview.test.ts`

- [ ] `fetchPreview(url, fetchImpl = fetch): Promise<LinkPreview | null>` com `LinkPreview = { url; title; description?; siteName?; image?: { mime: 'image/jpeg'; data: Uint8Array } }`.
- [ ] Limites (proteção, o app não pode virar baixador genérico): timeout 8 s, no máximo 3 redirecionamentos, só `text/html`, lê só os primeiros 512 KB e para no `</head>`; imagem ≤ 5 MB, conferida por `detectImageMime`.
- [ ] `parseHead(html, baseUrl)`: `og:title` → `twitter:title` → `<title>`; `og:description` → `twitter:description` → `meta description`; `og:site_name`; `og:image` → `twitter:image` (resolvido contra a URL final, só http/https). Decodifica entidades HTML, corta título em 200 e descrição em 300 caracteres. Parser por regex nos `<meta>` (não precisa de DOM).
- [ ] Miniatura reduzida com `nativeImage` (lado maior 480 px, JPEG qualidade 80) → tamanho previsível pela LAN e remove qualquer coisa estranha do arquivo original.
- [ ] Cache em memória por URL (LRU 100 itens, 30 min) — colar o mesmo link duas vezes não busca de novo.
- [ ] YouTube: se `youtubeId(url)` (Task C1) casar, usa o oEmbed (`https://www.youtube.com/oembed?url=…&format=json`) para título/canal e `https://i.ytimg.com/vi/<id>/hqdefault.jpg` como miniatura — mais confiável que raspar a página.
- [ ] Testes com `fetch` falso: OG completo, só `<title>`, sem imagem, imagem relativa, HTML gigante cortado, content-type errado, timeout, imagem que não é imagem.
- [ ] Commit — `Prévia de links: buscar Open Graph`.

### Task B2: Protocolo `preview`

**Files:** Modify `src/shared/protocol.ts`, `src/shared/protocol.test.ts`

- [ ] Mensagens `chat` ganham `id` opcional (string curta aleatória, `MAX_ID_LENGTH`) para a prévia se referir a elas; mensagem antiga sem `id` continua válida.
- [ ] ```ts
  export const MAX_PREVIEW_IMAGE_BYTES = 200 * 1024;
  export type PreviewHeader = {
    type: 'preview'; from: string; ref: string; url: string;
    title: string; description?: string; siteName?: string;
    youtube?: string;                     // id de 11 caracteres
    mime: 'image/jpeg' | null; size: number;
  };
  ```
- [ ] `parseMessage`: limites de tamanho em todos os campos, `url` passa por `normalizeUrl`, `youtube` casa `/^[A-Za-z0-9_-]{11}$/`, `size` 0 sem imagem ou `1..MAX_PREVIEW_IMAGE_BYTES` com imagem; o resto → `null`.
- [ ] Commit — `Protocolo: prévia de link`.

### Task B3: Enviar e receber a prévia

**Files:** Modify `src/main/peer-manager.ts` (+ testes), `src/main.ts`, `src/shared/api.ts`, `src/preload.ts`, `src/main/conversations.ts`

- [ ] Envio: `chat().send` responde na hora como hoje (o texto não espera a prévia). Em paralelo, o main pega o **primeiro** link da mensagem, chama `fetchPreview` e, se vier algo, manda `preview` (+ frame binário) ao contato e entrega à própria janela.
- [ ] Recebimento: mesmo fluxo pendente→frame binário do `avatar`; valida a assinatura JPEG; prévia de `ref` que não existe no histórico daquele contato é descartada.
- [ ] `Conversations`: a prévia é guardada junto do item de texto (`item.preview`), e os bytes da miniatura entram na conta de `MAX_IMAGE_BYTES_PER_CONTACT` — reabrir a conversa mostra a prévia.
- [ ] Nova IPC `chat:preview` → `{ peerId, ref, preview }` só para a janela daquele contato.
- [ ] Opção em Aparência/Menu: "Mostrar prévia de links que eu envio" (padrão ligado) — desligado, o main nem acessa a internet.
- [ ] Testes em loopback como os de avatar: prévia chega e se liga à mensagem certa; prévia sem mensagem é descartada; imagem inválida é descartada mas título/descrição ficam.
- [ ] Commit — `Prévia de links: troca entre contatos`.

### Task B4: Cartão da prévia na conversa

**Files:** Modify `src/renderer/chat.ts`, `src/index.css`

- [ ] `addText` marca a linha com `data-msg-id`; `addPreview(ref, preview)` acha a linha e põe embaixo um cartão: miniatura (blob:, liberada junto das imagens em `append`), título em negrito, descrição com 2 linhas (`line-clamp`), domínio pequeno. O cartão inteiro é um `<a target="_blank">`.
- [ ] Mantém a rolagem grudada no fim se já estava (como `addImage`).
- [ ] Cartão legível sobre a cena (mesmo véu das mensagens).
- [ ] Commit — `Prévia de links: cartão na conversa`.

## Fase C — Vídeo do YouTube na conversa + janela flutuante

### Task C1: Reconhecer links do YouTube

**Files:** Modify `src/shared/links.ts` (+ testes)

- [ ] `youtubeId(url): string | null` para `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/embed/`, `m.` e `music.`; `youtubeStart(url)` lê `t=90`, `t=1m30s`, `start=`.
- [ ] Commit — `YouTube: reconhecer links`.

### Task C2: Player dentro da conversa

**Files:** Modify `index.html` (CSP), `src/main.ts`, `src/renderer/chat.ts`, `src/index.css`

- [ ] Cartão do YouTube = cartão da prévia com o botão ▶ sobre a miniatura (vem pela LAN, aparece mesmo offline). Clique no ▶ troca a miniatura por um `<iframe>` 16:9 de `https://www.youtube-nocookie.com/embed/<id>?autoplay=1&enablejsapi=1&start=<t>` com `sandbox="allow-scripts allow-same-origin allow-presentation"` e `allow="autoplay; encrypted-media; picture-in-picture; fullscreen"`.
- [ ] CSP: `frame-src https://www.youtube-nocookie.com` (só esse domínio; o resto do CSP não muda).
- [ ] **Erro 153 do YouTube em Electron:** páginas `file://` não mandam `Referer` e o YouTube recusa o embed. No main, `session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/*'] }, …)` põe `Referer: https://chatlan.local/` (e `Origin` coerente). Verificar no app empacotado, não só no dev server.
- [ ] `setWindowOpenHandler` e `will-frame-navigate` já impedem o iframe de abrir janelas/navegar a janela principal; cliques em "Assistir no YouTube" caem no `shell.openExternal`.
- [ ] Um vídeo por vez tocando por conversa: ao dar play em outro, o anterior volta a ser miniatura. Botões no canto do cartão: "Destacar" (C3) e "Fechar player".
- [ ] Contato offline / sem internet: o iframe mostra o erro do próprio YouTube; o link continua clicável.
- [ ] Commit — `YouTube: tocar na conversa`.

### Task C3: Janela flutuante (picture-in-picture arrastável)

**Files:** Create `src/main/video-window.ts` (+ teste de lógica de posição), `video.html` + `src/renderer/video-window.ts`, Modify `src/main.ts`, `src/preload.ts`, `src/shared/api.ts`, `vite` config de entradas do forge

Por que janela própria e não o PiP nativo: o `requestPictureInPicture()` só funciona em `<video>` do próprio documento — o vídeo do YouTube está num iframe de outro domínio, então não dá para acioná-lo de fora. O Document Picture-in-Picture recarregaria o iframe. Uma `BrowserWindow` sempre-no-topo resolve melhor e **solta de verdade**: fica por cima de qualquer app, mesmo com a conversa minimizada.

- [ ] "Destacar": o renderer pega o tempo atual do player (mensagens `infoDelivery` da API do iframe via `postMessage`, `enablejsapi=1`), fecha o iframe inline e pede `video:open { id, start }`.
- [ ] Main abre uma única `BrowserWindow` de vídeo: `frame: false`, `alwaysOnTop: true` (nível `'floating'`), `resizable`, `setAspectRatio(16/9)`, 480×270, `skipTaskbar`, `visibleOnAllWorkspaces` no macOS; mesmas `WEB_PREFERENCES` e `harden()`. Segundo "Destacar" troca o vídeo na mesma janela.
- [ ] Arrastar: a página tem uma faixa superior com `-webkit-app-region: drag` que aparece no hover (com botões "Voltar para a conversa", "Fechar"); o iframe ocupa o resto. Ao soltar, o main encosta na borda da tela mais próxima se estiver a < 24 px (efeito PiP) — `snapToEdge(bounds, workArea)` pura e testada.
- [ ] Guarda posição/tamanho no `config` e reabre no mesmo lugar (garantindo que cabe em alguma tela, como as janelas de conversa).
- [ ] "Voltar para a conversa": devolve `{ id, start }` à janela de conversa de origem, que reabre o player inline.
- [ ] CSP da `video.html`: `frame-src https://www.youtube-nocookie.com`, sem mais nada.
- [ ] Commit — `YouTube: janela flutuante arrastável`.

## Fase D — Barra da conversa: sai imagem/atenção, entra letreiro do Spotify

### Task D1: Limpar a barra

**Files:** Modify `index.html`, `src/renderer/chat.ts`, `src/index.css`

- [ ] Remover `<label class="chat-tool">Enviar imagem</label>` e `#chat-nudge` da `.chat-toolbar`. **Atenção:** o `<input type="file" id="file-input">` está dentro desse label — mover para perto do `#fmt-image` na barra de formatação (que continua enviando imagem, junto com colar e arrastar). "Chamar atenção" continua no `#fmt-nudge`.
- [ ] Tirar `els.nudge` e seus usos em `chat.ts` (`setPeer`, listener). Limpar CSS morto de `.chat-tool` (inclusive as regras de cena em `index.css:3054`/`3092`).
- [ ] Commit — `Conversa: barra superior sem botões`.

### Task D2: Ler o Spotify local

**Files:** Create `src/main/now-playing.ts`, `src/main/now-playing.test.ts`, Modify `forge.config.ts`

- [ ] `NowPlaying = { artist: string; title: string } | null`. Leitores por sistema, todos com `execFile` (sem shell), timeout 2 s, e **sem abrir o Spotify se ele estiver fechado**:
  - macOS: `osascript -e 'if application "Spotify" is running then tell application "Spotify" to if player state is playing then return (artist of current track) & tab & (name of current track)'`. Primeira vez o macOS pede permissão de Automação → adicionar `NSAppleEventsUsageDescription` no `extendInfo` do `forge.config.ts`. Permissão negada = trata como "nada tocando" e não tenta de novo até reiniciar.
  - Windows: `tasklist /v /fo csv /fi "imagename eq Spotify.exe"`; o título da janela é `Artista - Música` quando toca e `Spotify`/`Spotify Premium`/`Spotify Free` quando pausado. Parser `parseSpotifyTitle` testado (música com " - " no nome: separa no primeiro).
  - Linux: `playerctl -p spotify metadata --format '{{status}}\t{{artist}}\t{{title}}'`; sem `playerctl` → desativa silenciosamente.
- [ ] `NowPlayingWatcher` (EventEmitter): consulta a cada 5 s, emite `'change'` só quando muda; pausa a consulta quando a opção está desligada.
- [ ] Testes com `execFile` falso para os três sistemas e os casos pausado/fechado/erro.
- [ ] Commit — `Spotify: ler a música tocando`.

### Task D3: Compartilhar com os contatos (como o "O que estou ouvindo" do WLM)

**Files:** Modify `src/shared/protocol.ts` (+ testes), `src/main/peer-manager.ts` (+ testes), `src/main.ts`, `src/shared/api.ts`, `src/preload.ts`

- [ ] `{ type: 'listening'; from; artist: string; title: string } | { type: 'listening'; from; artist: null; title: null }` — cada campo até 128 caracteres.
- [ ] `PeerManager.setListening()` manda a todos e reenvia ao conectar (como avatar/cena); guarda o do contato e emite `'listening'`.
- [ ] Opção no menu da janela principal: "Compartilhar o que estou ouvindo no Spotify" (padrão ligado, salva no `config`). Desligada: não consulta o Spotify e manda `null`.
- [ ] IPC `listening:peer` para a janela de conversa daquele contato e `listening:mine` para todas.
- [ ] Commit — `Spotify: compartilhar o que estou ouvindo`.

### Task D4: Letreiro na barra

**Files:** Modify `index.html`, `src/renderer/chat.ts` (ou novo `src/renderer/marquee.ts`), `src/index.css`

- [ ] Na `.chat-toolbar`: ícone ♫ + `<div class="marquee"><span>…</span></div>`. Texto: `Fulano está ouvindo: Banda – Música` (a música do **contato**); se o contato não estiver ouvindo nada, mostra a minha (`Você está ouvindo: …`); nada tocando dos dois lados → barra some (`hidden`) e a conversa ganha a altura.
- [ ] Animação CSS pura (`@keyframes` com `translateX`), duração proporcional à largura do texto (≈ 60 px/s) para a velocidade ser igual em músicas curtas e longas; o texto é duplicado com um separador `•` para o loop não ter buraco. Texto que cabe na barra fica parado.
- [ ] Troca de música: fade rápido e reinicia o loop; mesma música não reinicia a animação.
- [ ] `prefers-reduced-motion`: sem rolagem, texto com reticências e `title` completo.
- [ ] Clique no letreiro abre a busca `https://open.spotify.com/search/<artista música>` no navegador (opcional, via `openExternal`).
- [ ] Legível sobre a cena (mesmo tratamento que a `.chat-toolbar` já tem em `index.css:3054`).
- [ ] Commit — `Spotify: letreiro na conversa`.

## Verificação manual e README

- [ ] Instâncias A/B empacotadas (como nas fases de aparência):
  - Link comum em A → clicável nos dois lados, prévia aparece em A e B; B **sem internet** também vê a prévia.
  - Link com emoticon junto (`https://x.com/a:/b :)`) → só o `:)` vira carinha.
  - Link do YouTube → cartão com miniatura; ▶ toca inline no app **empacotado** (confirma a correção do Referer); "Destacar" continua do mesmo segundo numa janela sempre-no-topo; arrastar, redimensionar (mantém 16:9), encostar na borda; fechar a conversa não fecha o vídeo; "Voltar para a conversa".
  - Barra: sem "Enviar imagem"/"Chamar atenção"; enviar imagem pelo botão da barra de formatação, colar e arrastar ainda funcionam.
  - Spotify tocando em A → letreiro em B com a música de A; pausar → some; trocar música → atualiza em ≤ 5 s; opção desligada → B não vê nada. macOS: diálogo de Automação aparece uma vez.
- [ ] README: links e prévias, YouTube + janela flutuante, "O que estou ouvindo" (e o que sai da internet: só o processo principal de quem envia; a música só sai do computador com a opção ligada).
- [ ] Commit — `README: links, YouTube e Spotify`.

---

## Ordem sugerida e tamanho

| Fase | Depende de | Esforço |
|---|---|---|
| A — links clicáveis | — | pequeno |
| D1 — limpar barra | — | pequeno |
| D2–D4 — Spotify | D1 | médio |
| B — prévia | A | médio/grande (protocolo + histórico) |
| C — YouTube + flutuante | B (usa o cartão) | grande |

A e D podem ir em paralelo; B antes de C.

## Riscos

- **YouTube em Electron** (erro 153/Referer) é o ponto mais frágil — fazer um spike de 30 min da Task C2 antes do resto da fase C.
- **Windows/tasklist** depende do título da janela do Spotify; se o Spotify mudar isso, cai para "nada tocando" (sem quebrar). Alternativa futura mais robusta: API de mídia do Windows (SMTC), mas exige módulo nativo.
- **Privacidade:** o remetente acessa o site do link para montar a prévia (o site vê o IP de quem enviou) — por isso a opção de desligar.
