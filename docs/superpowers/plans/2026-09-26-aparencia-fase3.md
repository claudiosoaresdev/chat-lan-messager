# Aparência fase 3 (cena compartilhada): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Como no WLM, o contato vê a sua cena na conversa com você e você vê a dele (topo e fundo das mensagens), sempre com as cores do seu tema e legível; opção "Mostrar cenas dos contatos".

**Architecture:** Nova mensagem de protocolo `scene`, no mesmo molde da `avatar` (cabeçalho JSON + frame binário quando há imagem). O `PeerManager` guarda a cena de cada contato e a sua, envia ao conectar e quando muda. O main manda a cena do contato só para a janela de conversa dele; o renderer da conversa usa a cena do contato no lugar da própria quando a opção está ligada.

**Tech Stack:** Electron 44, TypeScript, `ws`, vitest.

**Spec:** [docs/superpowers/specs/2026-09-26-aparencia-design.md](../specs/2026-09-26-aparencia-design.md) (Fase 3)

**Comandos:** `npm test`, `npm run typecheck`, `npm run lint`. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Verificação visual como nas fases 1–2 (`scratchpad/cdp2.cjs`, instâncias empacotadas isoladas, só mensagens A↔B).

---

### Task 1: Protocolo `scene`

**Files:** Modify `src/shared/protocol.ts`, `src/shared/protocol.test.ts`

- [ ] Tipos:

```ts
export const MAX_SCENE_BYTES = 400 * 1024;
export type SceneHeader =
  | { type: 'scene'; from: string; kind: 'builtin'; id: string }
  | { type: 'scene'; from: string; kind: 'image'; mime: 'image/jpeg' | 'image/png'; size: number }
  | { type: 'scene'; from: string; kind: 'none' };
```

- [ ] `parseMessage`: `builtin` exige `findBuiltinScene(id)`; `image` exige mime permitido e `1 ≤ size ≤ MAX_SCENE_BYTES`; campos extras descartados; qualquer outra coisa → `null`. `validateImageBytes` (ou equivalente) confere a assinatura no recebimento dos bytes.
- [ ] Testes: formatos válidos, id desconhecido, mime/size inválidos, compatibilidade (mensagem desconhecida por versão antiga é ignorada — já é o comportamento; documente no teste com um `parseMessage` de tipo desconhecido → `null`).
- [ ] Commit — `Protocolo: mensagem de cena`.

### Task 2: PeerManager guarda e troca cenas

**Files:** Modify `src/main/peer-manager.ts`, `src/main/peer-manager.test.ts`, `src/shared/api.ts` (tipo `PeerScene`)

- [ ] `PeerScene = { id: string; scene: { kind: 'builtin'; id: string } | { kind: 'image'; mime; data: Uint8Array } | { kind: 'none' } }`.
- [ ] `setScene(scene)` guarda a sua cena (builtin id | bytes JPEG/PNG ≤ 400 KB | none) e envia a todos os conectados; ao conectar (depois do hello aceito, como o avatar), envia a sua cena atual.
- [ ] Recebimento: cabeçalho `image` → `pending` e, no frame binário, valida assinatura/tamanho → guarda no peer e emite `'scene'`; `builtin`/`none` → guarda e emite direto. Evento só quando muda.
- [ ] `getPeerScenes()` e `getPeerScene(id)`.
- [ ] Testes (com instâncias reais em loopback, como os de avatar): envia ao conectar, ao trocar, `none`; imagem inválida é descartada; frame binário sem cabeçalho não vira cena; contato antigo que não manda cena → sem entrada.
- [ ] Commit — `Cenas: troca entre contatos`.

### Task 3: Main e IPC

**Files:** Modify `src/main.ts`, `src/shared/api.ts`, `src/preload.ts`, `src/shared/themes.ts` (+ `config.ts`/testes)

- [ ] `Appearance.showContactScenes: boolean` (padrão `true`; arquivo antigo → `true`).
- [ ] Cena anunciada: a efetiva **salva** (não a de prévia): `scene ?? builtin(theme.scene)`; `custom` → bytes do `SceneStore`; `none`. Enviar no login (`peers.setScene`) e sempre que a aparência salva mudar a cena efetiva (inclusive trocando o tema quando `scene` é `null`, e ao remover a imagem em uso).
- [ ] `peers.on('scene', s => chats.get(s.id)?.send(IPC.peerScene, s))`; `getPeerScene(id)` para a janela de conversa ao abrir.
- [ ] Commit — `Cenas: anunciar a própria e repassar a do contato`.

### Task 4: Conversa mostra a cena do contato

**Files:** Modify `src/renderer/scene.ts`, `src/renderer/chat-window.ts`, `src/renderer/appearance.ts`

- [ ] Na janela de conversa: cena efetiva = `showContactScenes && cenaDoContato && kind !== 'none' ? cenaDoContato : minhaCenaEfetiva`. Contato com `none` explícito → usa a minha (ele escolheu não ter cena). Builtin do contato → `scenes/<id>.svg` (tabela de cores pré-calculada); imagem → `blob:` + medição (mesma função `sceneColors`).
- [ ] Toda a legibilidade da fase 2 vale igual (texto do topo pelo brilho, mensagens contra o pior ponto sob o véu). Cores continuam as do **meu** tema.
- [ ] Atualiza ao vivo quando o contato troca a cena, quando eu mudo `showContactScenes` e quando a minha muda (se estiver usando a minha).
- [ ] A lista de contatos continua com a minha cena.
- [ ] Commit — `Cenas: conversa mostra a cena do contato`.

### Task 5: Opção na janela Aparência

**Files:** Modify `index.html`, `src/renderer/appearance-dialog.ts`, `src/index.css`

- [ ] Caixa "Mostrar cenas dos contatos nas conversas" abaixo da seção Cena (prévia ao vivo; OK salva; Cancelar desfaz). Não conta para "Personalizado".
- [ ] Commit — `Cenas: opção de mostrar cenas dos contatos`.

### Task 6: Verificação manual e README

- [ ] Instâncias A/B empacotadas: A com Aurora, B com Céu → na conversa, A vê Céu e B vê Aurora; A troca para imagem própria → B vê a imagem ao vivo; A escolhe Nenhuma → B volta à própria cena; B desliga "Mostrar cenas dos contatos" → B vê a própria; legibilidade das mensagens nos dois lados (temas claro/escuro diferentes em A e B); reiniciar A → B recebe a cena de novo ao reconectar.
- [ ] README: a cena é compartilhada como no WLM + a opção.
- [ ] Commit — `README: cena compartilhada`.
