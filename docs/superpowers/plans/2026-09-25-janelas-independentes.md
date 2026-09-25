# Janelas de conversa independentes e bandeja: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada contato ganha a própria janela de conversa (botão próprio na barra de tarefas/Dock), a home fica separada e o app continua rodando na bandeja ao fechar a home.

**Architecture:** O processo principal (main) vira a fonte da verdade: envia mensagens só para o contato alvo (`PeerManager`), guarda o histórico da sessão por contato (`Conversations`) e roteia cada evento para a janela certa (`ChatWindows`). Todas as janelas carregam o mesmo `index.html`; a URL `?chat=<id>` diz que a janela é a conversa daquele contato. Um ícone na bandeja (`Tray`) mantém o app vivo com a home escondida.

**Tech Stack:** Electron 44 + Electron Forge (Vite), TypeScript 5.9, `ws`, vitest.

**Spec:** [docs/superpowers/specs/2026-09-25-janelas-independentes-design.md](../specs/2026-09-25-janelas-independentes-design.md)

**Comandos do projeto:**
- Testes: `npm test` (um arquivo: `npx vitest run src/main/<arquivo>.test.ts`)
- Tipos: `npm run typecheck`
- Lint: `npm run lint`
- App em dev: `npm start`

**Aviso sobre tipos:** as Tasks 1 a 8 mudam assinaturas usadas por `src/main.ts` e pelo renderer. O `npm run typecheck` fica vermelho a partir da Task 1 e volta a passar no fim da Task 9. Em cada task, rode só os testes indicados. Não "conserte" `main.ts` ou o renderer antes da task que cuida deles.

**Nota de nomes:** a spec chama o gerente de janelas de `windows.ts`; aqui ele se chama `src/main/chat-windows.ts`, porque só gerencia janelas de conversa.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/main/peer-manager.ts` | Modificar | Envio individual (`to`), erro de offline, cooldown por contato |
| `src/main/peer-manager.test.ts` | Modificar | Testes do envio individual |
| `src/shared/api.ts` | Modificar | `ConversationItem`, `ChatInit`, novos canais IPC e métodos da `ChatApi` |
| `src/main/conversations.ts` | Criar | Histórico da sessão por contato, com `seq` e teto de 200 |
| `src/main/conversations.test.ts` | Criar | Testes do histórico |
| `src/main/chat-windows.ts` | Criar | Abrir/reaproveitar janelas de conversa e rotear itens (sem Electron) |
| `src/main/chat-windows.test.ts` | Criar | Testes com janela falsa |
| `src/main/tray-text.ts` | Criar | Texto da dica do ícone da bandeja (puro) |
| `src/main/tray-text.test.ts` | Criar | Testes da dica |
| `src/main/tray.ts` | Criar | Ícone e menu da bandeja (Electron) |
| `scripts/make-tray-icons.mjs` | Criar | Gera os PNGs da bandeja a partir das formas da borboleta |
| `public/tray/*.png` | Criar (gerado) | Ícones da bandeja |
| `src/preload.ts` | Modificar | Expõe os novos métodos da API |
| `src/main.ts` | Modificar | Janelas de conversa, roteamento, bandeja, esconder a home, broadcast |
| `src/renderer/state.ts` | Modificar | `peerId` da janela; remove `unread` |
| `src/renderer/font.ts` | Modificar | `watchFontChanges()` |
| `src/renderer/avatar.ts` | Modificar | `watchMyAvatar()` |
| `src/renderer/giphy.ts` | Modificar | `giphySend(to, id)` |
| `src/renderer/chat.ts` | Modificar | Conversa de um contato só |
| `src/renderer/home.ts` | Modificar | Abrir conversa por contato; tira o grupo |
| `src/renderer/main-window.ts` | Criar | Inicialização da janela principal (login + home) |
| `src/renderer/chat-window.ts` | Criar | Inicialização da janela de conversa (histórico + eventos) |
| `src/renderer.ts` | Modificar | Barra de título, ajuda e escolha do papel da janela |
| `index.html` | Modificar | Cabeçalho da conversa por contato; tira grupo, "Contatos" e "Convidar" |
| `README.md` | Modificar | Documenta janelas e bandeja |

`src/renderer/toast.ts` fica no repositório sem uso nesta entrega; ele é o ponto de partida da issue #6.

---

### Task 1: Envio individual no PeerManager

**Files:**
- Modify: `src/main/peer-manager.ts`
- Test: `src/main/peer-manager.test.ts`

- [ ] **Step 1: Ajustar os testes existentes para a nova assinatura**

Em `src/main/peer-manager.test.ts`, troque cada chamada de envio para receber o id do contato como primeiro argumento:

| Linha aproximada | Antes | Depois |
|---|---|---|
| 68 | `a.sendText('  olá  ')` | `a.sendText('bbb', '  olá  ')` |
| 73 | `b.sendText('oi')` | `b.sendText('aaa', 'oi')` |
| 79 | `a.sendText('formatado', font)` | `a.sendText('bbb', 'formatado', font)` |
| 114 | `a.sendText('oi')` | `a.sendText('bbb', 'oi')` |
| 161 | `a.sendNudge(1_000_000)` | `a.sendNudge('bbb', 1_000_000)` |
| 165 | `a.sendNudge(1_000_000 + 1000)` | `a.sendNudge('bbb', 1_000_000 + 1000)` |
| 176 | `a.sendWink('fogos', 2_000_000)` | `a.sendWink('bbb', 'fogos', 2_000_000)` |
| 178 | `a.sendWink('beijo', 2_000_000 + 500)` | `a.sendWink('bbb', 'beijo', 2_000_000 + 500)` |
| 179 | `a.sendWink('x' as never, 3_000_000)` | `a.sendWink('bbb', 'x' as never, 3_000_000)` |
| 203 | `a.sendImage({ name: 'foto.png', ... })` | `a.sendImage('bbb', { name: 'foto.png', ... })` |
| 221 | `a.sendImage({ name: 'grande.png', ... })` | `a.sendImage('bbb', { name: 'grande.png', ... })` |
| 229 | `a.sendImage({ name: 'x.svg', ... })` | `a.sendImage('bbb', { name: 'x.svg', ... })` |
| 230 | `a.sendImage({ name: 'x', ... })` | `a.sendImage('bbb', { name: 'x', ... })` |
| 297 | `a.sendText('uma vez')` | `a.sendText('bbb', 'uma vez')` |

Use `grep -n "sendText\|sendNudge\|sendWink\|sendImage" src/main/peer-manager.test.ts` para achar todas; nenhuma chamada pode ficar sem o id.

- [ ] **Step 2: Adicionar os testes novos**

Logo depois do teste `'não cria conexão duplicada quando os dois lados discam ao mesmo tempo'`, adicione:

```ts
  it('envia só para o contato escolhido', async () => {
    const a = await create('aaa');
    const b = await create('bbb');
    const c = await create('ccc');
    const bReady = next(b, 'peer', onlineWith('aaa'));
    const cReady = next(c, 'peer', onlineWith('aaa'));
    await a.connect(HOST, b.port);
    await a.connect(HOST, c.port);
    await Promise.all([bReady, cReady]);

    const atC: string[] = [];
    c.on('message', (m) => atC.push(m.text));
    const atB = next(b, 'message');
    a.sendText('bbb', 'só pra você');
    expect(await atB).toMatchObject({ from: 'aaa', text: 'só pra você' });
    await sleep(100);
    expect(atC).toEqual([]);
  });

  it('recusa enviar para contato offline ou desconhecido', async () => {
    const a = await create('aaa');
    const b = await create('bbb', 'Bia');
    const bReady = next(a, 'peer', onlineWith('bbb'));
    await a.connect(HOST, b.port);
    await bReady;

    const offline = next(a, 'peer', (p) => p.id === 'bbb' && !p.online);
    await b.stop();
    managers = managers.filter((m) => m !== b);
    await offline;

    expect(() => a.sendText('bbb', 'oi')).toThrow('Bia está offline.');
    expect(() => a.sendNudge('bbb')).toThrow('Bia está offline.');
    expect(() => a.sendText('nao-existe', 'oi')).toThrow('Contato desconhecido.');
  });

  it('limite de chamar atenção e de wink é por contato', async () => {
    const a = await create('aaa');
    const b = await create('bbb');
    const c = await create('ccc');
    const bReady = next(b, 'peer', onlineWith('aaa'));
    const cReady = next(c, 'peer', onlineWith('aaa'));
    await a.connect(HOST, b.port);
    await a.connect(HOST, c.port);
    await Promise.all([bReady, cReady]);

    a.sendNudge('bbb', 1_000_000);
    expect(() => a.sendNudge('bbb', 1_000_500)).toThrow(/Aguarde/);
    expect(a.sendNudge('ccc', 1_000_500)).toMatchObject({ self: true });

    a.sendWink('bbb', 'fogos', 2_000_000);
    expect(() => a.sendWink('bbb', 'fogos', 2_000_500)).toThrow(/Aguarde/);
    expect(a.sendWink('ccc', 'fogos', 2_000_500)).toMatchObject({ self: true });
  });
```

- [ ] **Step 3: Rodar os testes e ver falhar**

Run: `npx vitest run src/main/peer-manager.test.ts`
Expected: FAIL. Os testes novos falham (mensagem chega em `ccc`, não lança "offline", cooldown global) e os antigos falham porque o texto vira o id.

- [ ] **Step 4: Implementar o envio individual**

Em `src/main/peer-manager.ts`:

Troque os campos de cooldown de envio:

```ts
  private lastNudgeSent = 0;
  private readonly lastNudgeFrom = new Map<string, number>();
  private lastWinkSent = 0;
  private readonly lastWinkFrom = new Map<string, number>();
```

por:

```ts
  private readonly lastNudgeSent = new Map<string, number>();
  private readonly lastNudgeFrom = new Map<string, number>();
  private readonly lastWinkSent = new Map<string, number>();
  private readonly lastWinkFrom = new Map<string, number>();
```

Substitua os quatro métodos `sendText`, `sendNudge`, `sendWink` e `sendImage` inteiros por:

```ts
  sendText(to: string, text: string, font?: MessageFont): UiChatMessage {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Mensagem vazia');
    if (trimmed.length > MAX_TEXT_LENGTH) throw new Error(`Mensagem maior que ${MAX_TEXT_LENGTH} caracteres`);
    const ws = this.socketFor(to);
    const ts = Date.now();
    ws.send(encodeMessage({ type: 'chat', from: this.id, text: trimmed, ts, ...(font ? { font } : {}) }));
    return { from: this.id, fromName: this._name, text: trimmed, ts, self: true, ...(font ? { font } : {}) };
  }

  /** Chama a atenção do contato. Limitado a um a cada NUDGE_COOLDOWN_MS por contato. */
  sendNudge(to: string, now = Date.now()): UiNudge {
    const ws = this.socketFor(to);
    if (now - (this.lastNudgeSent.get(to) ?? 0) < NUDGE_COOLDOWN_MS) {
      throw new Error('Aguarde alguns segundos para chamar a atenção de novo.');
    }
    this.lastNudgeSent.set(to, now);
    ws.send(encodeMessage({ type: 'nudge', from: this.id, ts: now }));
    return { from: this.id, fromName: this._name, ts: now, self: true };
  }

  /** Envia um wink ao contato. Limitado a um a cada WINK_COOLDOWN_MS por contato. */
  sendWink(to: string, wink: WinkId, now = Date.now()): UiWink {
    if (!isWinkId(wink)) throw new Error('Wink desconhecido');
    const ws = this.socketFor(to);
    if (now - (this.lastWinkSent.get(to) ?? 0) < WINK_COOLDOWN_MS) {
      throw new Error('Aguarde a animação terminar para enviar outro wink.');
    }
    this.lastWinkSent.set(to, now);
    ws.send(encodeMessage({ type: 'wink', from: this.id, wink, ts: now }));
    return { from: this.id, fromName: this._name, wink, ts: now, self: true };
  }

  sendImage(to: string, image: OutgoingImage): UiImageMeta {
    const data = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
    if (data.length === 0) throw new Error('Imagem vazia');
    if (data.length > MAX_IMAGE_BYTES) throw new Error('Imagem maior que 10 MB');
    const mime = detectImageMime(data);
    if (!mime) throw new Error('Formato não suportado (use PNG, JPEG, WebP ou GIF)');
    const ws = this.socketFor(to);
    const name = (image.name || 'imagem').slice(0, 255);
    const ts = Date.now();
    ws.send(encodeMessage({ type: 'image', from: this.id, name, mime, size: data.length, ts }));
    ws.send(data, { binary: true });
    return { from: this.id, fromName: this._name, name, mime, size: data.length, ts, self: true };
  }
```

Logo abaixo da linha `// ---------------------------------------------------------------------------` que vem depois de `sendImage`, antes de `private *openSockets()`, adicione:

```ts
  /** Conexão aberta com o contato. Erro visível quando ele está offline. */
  private socketFor(to: string): WebSocket {
    const peer = this.peers.get(to);
    if (!peer) throw new Error('Contato desconhecido.');
    const ws = peer.conn?.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error(`${peer.name} está offline.`);
    return ws;
  }
```

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `npx vitest run src/main/peer-manager.test.ts`
Expected: PASS, todos (23 testes).

- [ ] **Step 6: Commit**

```bash
git add src/main/peer-manager.ts src/main/peer-manager.test.ts
git commit -m "Enviar mensagens só para o contato escolhido

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tipo do item de conversa e histórico da sessão

**Files:**
- Modify: `src/shared/api.ts`
- Create: `src/main/conversations.ts`
- Test: `src/main/conversations.test.ts`

- [ ] **Step 1: Adicionar os tipos em `src/shared/api.ts`**

Logo depois da interface `UiImageMessage`, adicione:

```ts
/**
 * Um item da conversa com um contato, guardado pelo main durante a sessão.
 * `seq` cresce sempre (evita repetir itens); `at` é a hora local em que o item entrou.
 */
export type ConversationItem =
  | { seq: number; at: number; kind: 'text'; message: UiChatMessage }
  | { seq: number; at: number; kind: 'image'; image: UiImageMessage }
  | { seq: number; at: number; kind: 'wink'; wink: UiWink }
  | { seq: number; at: number; kind: 'nudge'; nudge: UiNudge }
  | { seq: number; at: number; kind: 'system'; text: string };

/** Item antes de entrar no histórico (o main preenche `seq` e `at`). */
export type NewConversationItem = {
  [K in ConversationItem['kind']]: Omit<Extract<ConversationItem, { kind: K }>, 'seq' | 'at'>;
}[ConversationItem['kind']];

/** O que a janela de conversa recebe ao abrir. */
export interface ChatInit {
  /** null se o contato não é conhecido (ex.: sessão encerrada). */
  peer: PeerInfo | null;
  history: ConversationItem[];
}
```

- [ ] **Step 2: Escrever o teste**

Crie `src/main/conversations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Conversations } from './conversations';

const text = (t: string) => ({
  kind: 'text' as const,
  message: { from: 'bbb', fromName: 'Bia', text: t, ts: 1, self: false },
});

describe('Conversations', () => {
  it('guarda por contato com seq crescente e hora local', () => {
    let now = 100;
    const c = new Conversations(200, () => now);
    const a = c.add('bbb', text('oi'));
    now = 200;
    const b = c.add('ccc', text('olá'));
    const d = c.add('bbb', { kind: 'system', text: 'Bia saiu' });

    expect(a).toMatchObject({ seq: 1, at: 100, kind: 'text' });
    expect(b.seq).toBe(2);
    expect(d).toEqual({ seq: 3, at: 200, kind: 'system', text: 'Bia saiu' });
    expect(c.get('bbb').map((i) => i.seq)).toEqual([1, 3]);
    expect(c.get('ccc').map((i) => i.seq)).toEqual([2]);
  });

  it('sabe se há conversa e devolve lista vazia para contato sem histórico', () => {
    const c = new Conversations();
    expect(c.has('bbb')).toBe(false);
    expect(c.get('bbb')).toEqual([]);
    c.add('bbb', text('oi'));
    expect(c.has('bbb')).toBe(true);
  });

  it('descarta os mais antigos ao passar do teto', () => {
    const c = new Conversations(3);
    for (const t of ['1', '2', '3', '4', '5']) c.add('bbb', text(t));
    expect(c.get('bbb').map((i) => (i.kind === 'text' ? i.message.text : ''))).toEqual(['3', '4', '5']);
  });

  it('get devolve cópia', () => {
    const c = new Conversations();
    c.add('bbb', text('oi'));
    c.get('bbb').pop();
    expect(c.get('bbb')).toHaveLength(1);
  });

  it('clear apaga tudo', () => {
    const c = new Conversations();
    c.add('bbb', text('oi'));
    c.clear();
    expect(c.has('bbb')).toBe(false);
    expect(c.get('bbb')).toEqual([]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/main/conversations.test.ts`
Expected: FAIL com "Failed to resolve import './conversations'".

- [ ] **Step 4: Implementar**

Crie `src/main/conversations.ts`:

```ts
// Histórico da sessão por contato, só em memória (some ao sair, como no MSN).
// Serve para a janela que abre sozinha carregar o que já chegou e para reabrir uma conversa fechada.
import type { ConversationItem, NewConversationItem } from '../shared/api';

export const MAX_ITEMS_PER_CONTACT = 200;

export class Conversations {
  private readonly items = new Map<string, ConversationItem[]>();
  private seq = 0;

  constructor(
    private readonly max = MAX_ITEMS_PER_CONTACT,
    private readonly now: () => number = Date.now,
  ) {}

  add(peerId: string, item: NewConversationItem): ConversationItem {
    const saved = { ...item, seq: ++this.seq, at: this.now() } as ConversationItem;
    const list = this.items.get(peerId) ?? [];
    list.push(saved);
    if (list.length > this.max) list.splice(0, list.length - this.max);
    this.items.set(peerId, list);
    return saved;
  }

  has(peerId: string): boolean {
    return this.items.has(peerId);
  }

  get(peerId: string): ConversationItem[] {
    return [...(this.items.get(peerId) ?? [])];
  }

  clear() {
    this.items.clear();
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/main/conversations.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 6: Commit**

```bash
git add src/shared/api.ts src/main/conversations.ts src/main/conversations.test.ts
git commit -m "Histórico da sessão por contato

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Canais IPC e API compartilhada

Os canais precisam existir antes do `ChatWindows` (Task 4), que envia `IPC.chatItem` e `IPC.peer`.

**Files:**
- Modify: `src/shared/api.ts`
- Modify: `src/preload.ts`

- [ ] **Step 1: Atualizar a `ChatApi` em `src/shared/api.ts`**

No bloco `// GIFs do GIPHY` da interface `ChatApi`, troque:

```ts
  giphySend(id: string): Promise<{ meta: UiImageMeta; data: Uint8Array }>;
```

por:

```ts
  giphySend(to: string, id: string): Promise<{ meta: UiImageMeta; data: Uint8Array }>;
```

Substitua o bloco inteiro `// contatos e mensagens` (de `getPeers(): Promise<PeerInfo[]>;` até `onWink(cb: (wink: UiWink) => void): Unsubscribe;`) por:

```ts
  // contatos e mensagens (sempre para um contato)
  getPeers(): Promise<PeerInfo[]>;
  send(to: string, text: string): Promise<UiChatMessage>;
  sendImage(to: string, image: OutgoingImage): Promise<UiImageMeta>;
  /** Chamar atenção do contato (a janela dele treme). */
  nudge(to: string): Promise<UiNudge>;
  /** Envia um wink (animação) para o contato. */
  sendWink(to: string, wink: WinkId): Promise<UiWink>;
  connect(host: string, port: number): Promise<void>;
  getSaved(): Promise<SavedPeer[]>;
  forget(host: string, port: number): Promise<SavedPeer[]>;
  onPeer(cb: (peer: PeerInfo) => void): Unsubscribe;

  // janelas de conversa
  /** Abre (ou traz para frente) a janela de conversa com o contato. */
  openChat(peerId: string): void;
  /** Contato e histórico da sessão, pedidos pela janela de conversa ao abrir. */
  getChatInit(peerId: string): Promise<ChatInit>;
  /** Item novo na conversa desta janela (mensagem, imagem, wink, nudge ou aviso). */
  onChatItem(cb: (item: ConversationItem) => void): Unsubscribe;

  // mudanças feitas em outra janela
  onSelfChanged(cb: (self: SelfInfo) => void): Unsubscribe;
  onFontChanged(cb: (font: MessageFont) => void): Unsubscribe;
  onMyAvatarChanged(cb: (avatar: AvatarImage | null) => void): Unsubscribe;
```

No objeto `IPC`, remova as linhas `wink: 'chat:wink',`, `nudge: 'chat:nudge',`, `message: 'chat:message',` e `image: 'chat:image',`. Antes de `getUpdateStatus: 'update:status',`, adicione:

```ts
  openChat: 'chat:open',
  getChatInit: 'chat:init',
  chatItem: 'chat:item',
  selfChanged: 'session:self-changed',
  fontChanged: 'font:changed',
  myAvatarChanged: 'avatar:mine-changed',
```

Os tipos `UiImageMessage` e `UiWink`/`UiNudge` continuam exportados (usados por `ConversationItem`).

- [ ] **Step 2: Atualizar `src/preload.ts`**

Troque a linha do GIPHY:

```ts
  giphySend: (id) => call(IPC.giphySend, id),
```

por:

```ts
  giphySend: (to, id) => call(IPC.giphySend, to, id),
```

Substitua o bloco de `getPeers: () => call(IPC.getPeers),` até `onWink: (cb) => subscribe(IPC.wink, cb),` por:

```ts
  getPeers: () => call(IPC.getPeers),
  send: (to, text) => call(IPC.send, to, text),
  sendImage: (to, image) => call(IPC.sendImage, to, image),
  nudge: (to) => call(IPC.sendNudge, to),
  sendWink: (to, wink) => call(IPC.sendWink, to, wink),
  connect: (host, port) => call(IPC.connect, host, port),
  getSaved: () => call(IPC.getSaved),
  forget: (host, port) => call(IPC.forget, host, port),
  onPeer: (cb) => subscribe(IPC.peer, cb),

  openChat: (peerId) => ipcRenderer.send(IPC.openChat, peerId),
  getChatInit: (peerId) => call(IPC.getChatInit, peerId),
  onChatItem: (cb) => subscribe(IPC.chatItem, cb),

  onSelfChanged: (cb) => subscribe(IPC.selfChanged, cb),
  onFontChanged: (cb) => subscribe(IPC.fontChanged, cb),
  onMyAvatarChanged: (cb) => subscribe(IPC.myAvatarChanged, cb),
```

- [ ] **Step 3: Conferir que os testes do main continuam passando**

Run: `npx vitest run src/main`
Expected: PASS. (O typecheck ainda falha em `main.ts` e no renderer; é esperado até a Task 9.)

- [ ] **Step 4: Commit**

```bash
git add src/shared/api.ts src/preload.ts
git commit -m "API de conversas individuais entre main e janelas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Gerente de janelas de conversa

**Files:**
- Create: `src/main/chat-windows.ts`
- Test: `src/main/chat-windows.test.ts`

- [ ] **Step 1: Escrever o teste**

Crie `src/main/chat-windows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PeerInfo } from '../shared/api';
import { IPC } from '../shared/api';
import { ChatWindows, type ChatWindowHandle } from './chat-windows';
import { Conversations } from './conversations';

class FakeWindow implements ChatWindowHandle {
  destroyed = false;
  focused = false;
  shown: boolean[] = [];
  sent: Array<[string, unknown]> = [];
  shakes = 0;
  constructor(
    readonly peerId: string,
    private readonly onClosed: () => void,
  ) {}
  show(focus: boolean) {
    this.shown.push(focus);
  }
  send(channel: string, payload: unknown) {
    this.sent.push([channel, payload]);
  }
  close() {
    this.destroyed = true;
    this.onClosed();
  }
  shake() {
    this.shakes++;
  }
}

const KNOWN = new Set(['bbb', 'ccc']);

function setup() {
  const created: FakeWindow[] = [];
  const conversations = new Conversations();
  const chats = new ChatWindows(
    (peerId, onClosed) => {
      const w = new FakeWindow(peerId, onClosed);
      created.push(w);
      return w;
    },
    conversations,
    (id) => KNOWN.has(id),
  );
  return { chats, created, conversations };
}

const text = (t: string) => ({
  kind: 'text' as const,
  message: { from: 'bbb', fromName: 'Bia', text: t, ts: 1, self: false },
});

const peer = (online: boolean): PeerInfo => ({
  id: 'bbb',
  name: 'Bia',
  status: 'available',
  message: '',
  address: '10.0.0.2',
  online,
});

describe('ChatWindows', () => {
  it('item recebido sem janela grava no histórico e abre sem foco', () => {
    const { chats, created, conversations } = setup();
    chats.receive('bbb', text('oi'));
    expect(created).toHaveLength(1);
    expect(created[0].shown).toEqual([false]);
    expect(conversations.get('bbb')).toHaveLength(1);
  });

  it('rajada de mensagens abre uma janela só', () => {
    const { chats, created, conversations } = setup();
    chats.receive('bbb', text('1'));
    chats.receive('bbb', text('2'));
    chats.receive('bbb', text('3'));
    expect(created).toHaveLength(1);
    expect(conversations.get('bbb')).toHaveLength(3);
  });

  it('entrega o item à janela aberta', () => {
    const { chats, created } = setup();
    chats.open('bbb', true);
    chats.receive('bbb', text('oi'));
    expect(created).toHaveLength(1);
    expect(created[0].shown).toEqual([true, false]);
    expect(created[0].sent).toEqual([[IPC.chatItem, expect.objectContaining({ kind: 'text', seq: 1 })]]);
  });

  it('contato desconhecido não abre janela nem grava', () => {
    const { chats, created, conversations } = setup();
    expect(chats.open('zzz', true)).toBeNull();
    chats.receive('zzz', text('oi'));
    expect(created).toHaveLength(0);
    expect(conversations.has('zzz')).toBe(false);
  });

  it('chamar atenção sacode a janela do contato', () => {
    const { chats, created } = setup();
    chats.receive('bbb', { kind: 'nudge', nudge: { from: 'bbb', fromName: 'Bia', ts: 1, self: false } });
    expect(created[0].shakes).toBe(1);
  });

  it('depois de fechar, a próxima mensagem abre uma janela nova', () => {
    const { chats, created } = setup();
    chats.open('bbb', true);
    created[0].close();
    expect(chats.get('bbb')).toBeUndefined();
    chats.receive('bbb', text('voltei'));
    expect(created).toHaveLength(2);
  });

  it('record grava o que eu enviei sem abrir janela', () => {
    const { chats, created, conversations } = setup();
    chats.record('bbb', { kind: 'text', message: { from: 'aaa', fromName: 'Eu', text: 'oi', ts: 1, self: true } });
    expect(created).toHaveLength(0);
    expect(conversations.get('bbb')).toHaveLength(1);
  });

  it('presença vai para a janela do contato e avisa entrou/saiu só em conversa existente', () => {
    const { chats, created, conversations } = setup();
    chats.peerChanged(peer(true));
    chats.peerChanged(peer(false));
    expect(conversations.has('bbb')).toBe(false);

    chats.open('bbb', true);
    chats.peerChanged(peer(true));
    chats.peerChanged(peer(true));
    chats.peerChanged(peer(false));
    const texts = conversations.get('bbb').map((i) => (i.kind === 'system' ? i.text : ''));
    expect(texts).toEqual(['Bia entrou na conversa', 'Bia saiu da conversa']);
    const channels = created[0].sent.map(([c]) => c);
    expect(channels.filter((c) => c === IPC.peer)).toHaveLength(3);
    expect(channels.filter((c) => c === IPC.chatItem)).toHaveLength(2);
  });

  it('closeAll fecha todas as janelas', () => {
    const { chats, created } = setup();
    chats.open('bbb', true);
    chats.open('ccc', true);
    chats.closeAll();
    expect(created.every((w) => w.destroyed)).toBe(true);
    expect(chats.get('bbb')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/main/chat-windows.test.ts`
Expected: FAIL com "Failed to resolve import './chat-windows'".

- [ ] **Step 3: Implementar**

Crie `src/main/chat-windows.ts`:

```ts
// Janelas de conversa (uma por contato) e o roteamento dos eventos da rede até elas.
// Não depende do Electron: a janela real vem de uma fábrica injetada pelo main.ts.
import { IPC, type ConversationItem, type NewConversationItem, type PeerInfo } from '../shared/api';
import type { Conversations } from './conversations';

export interface ChatWindowHandle {
  readonly destroyed: boolean;
  readonly focused: boolean;
  /** `focus: false` mostra sem roubar o foco e pisca na barra de tarefas. */
  show(focus: boolean): void;
  send(channel: string, payload: unknown): void;
  close(): void;
  shake(): void;
}

export type CreateChatWindow = (peerId: string, onClosed: () => void) => ChatWindowHandle;

export class ChatWindows {
  private readonly windows = new Map<string, ChatWindowHandle>();
  private readonly lastOnline = new Map<string, boolean>();

  constructor(
    private readonly create: CreateChatWindow,
    private readonly conversations: Conversations,
    private readonly isKnownPeer: (peerId: string) => boolean,
  ) {}

  get(peerId: string): ChatWindowHandle | undefined {
    const w = this.windows.get(peerId);
    return w && !w.destroyed ? w : undefined;
  }

  /** Abre a conversa (ou reaproveita a janela existente). Contato desconhecido: null. */
  open(peerId: string, focus: boolean): ChatWindowHandle | null {
    if (!this.isKnownPeer(peerId)) return null;
    let w = this.get(peerId);
    if (!w) {
      const created: ChatWindowHandle = this.create(peerId, () => {
        if (this.windows.get(peerId) === created) this.windows.delete(peerId);
      });
      this.windows.set(peerId, created);
      w = created;
    }
    w.show(focus);
    return w;
  }

  /**
   * Item vindo do contato: grava no histórico, entrega à janela dele e, se não houver
   * janela, abre uma sem foco. Uma janela recém-criada lê o item do histórico ao carregar.
   */
  receive(peerId: string, item: NewConversationItem): void {
    if (!this.isKnownPeer(peerId)) return;
    const saved = this.conversations.add(peerId, item);
    const w = this.open(peerId, false);
    w?.send(IPC.chatItem, saved);
    if (item.kind === 'nudge') w?.shake();
  }

  /** Item que eu enviei: só histórico; a janela que enviou já mostrou. */
  record(peerId: string, item: NewConversationItem): ConversationItem {
    return this.conversations.add(peerId, item);
  }

  /** Presença do contato: vai para a janela dele e vira aviso "entrou/saiu" se a conversa existe. */
  peerChanged(peer: PeerInfo): void {
    const was = this.lastOnline.get(peer.id);
    this.lastOnline.set(peer.id, peer.online);
    const w = this.get(peer.id);
    w?.send(IPC.peer, peer);
    if (was === undefined || was === peer.online) return;
    if (!w && !this.conversations.has(peer.id)) return;
    const saved = this.conversations.add(peer.id, {
      kind: 'system',
      text: `${peer.name} ${peer.online ? 'entrou na conversa' : 'saiu da conversa'}`,
    });
    w?.send(IPC.chatItem, saved);
  }

  closeAll(): void {
    for (const w of this.windows.values()) if (!w.destroyed) w.close();
    this.windows.clear();
    this.lastOnline.clear();
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/main/chat-windows.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add src/main/chat-windows.ts src/main/chat-windows.test.ts
git commit -m "Gerente das janelas de conversa com roteamento por contato

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ícones e dica da bandeja

**Files:**
- Create: `scripts/make-tray-icons.mjs`
- Create (gerados): `public/tray/tray.png`, `public/tray/tray@2x.png`, `public/tray/trayTemplate.png`, `public/tray/trayTemplate@2x.png`
- Create: `src/main/tray-text.ts`
- Test: `src/main/tray-text.test.ts`
- Create: `src/main/tray.ts`

- [ ] **Step 1: Criar o gerador dos ícones**

Não há ferramenta de SVG instalada (sem `rsvg-convert`/ImageMagick). O script desenha as mesmas formas do símbolo `#i-butterfly` do `index.html` e grava PNG com `zlib`. Crie `scripts/make-tray-icons.mjs`:

```js
// Gera os ícones da bandeja em public/tray a partir das formas da borboleta (#i-butterfly no index.html).
// Uso: node scripts/make-tray-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const VIEWBOX = 56;
// Na ordem de pintura do SVG: a última forma fica por cima.
const SHAPES = [
  { type: 'ellipse', cx: 15.7, cy: 17.9, rx: 14, ry: 11.2, color: [0x2e, 0x7f, 0xe0] },
  { type: 'ellipse', cx: 40.3, cy: 17.9, rx: 14, ry: 11.2, color: [0x2e, 0x7f, 0xe0] },
  { type: 'ellipse', cx: 19, cy: 39.2, rx: 10, ry: 8.4, color: [0x6b, 0x3f, 0xa0] },
  { type: 'ellipse', cx: 37, cy: 39.2, rx: 10, ry: 8.4, color: [0x6b, 0x3f, 0xa0] },
  { type: 'rect', x: 25.8, y: 10.6, w: 4.4, h: 34.8, color: [0x1a, 0x2b, 0x45] },
];
const SAMPLES = 4; // 4×4 amostras por pixel (antisserrilhado)

const inside = (s, x, y) =>
  s.type === 'ellipse'
    ? ((x - s.cx) / s.rx) ** 2 + ((y - s.cy) / s.ry) ** 2 <= 1
    : x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;

function render(size, template) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = VIEWBOX / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) * scale;
          const y = (py + (sy + 0.5) / SAMPLES) * scale;
          const top = SHAPES.findLast((s) => inside(s, x, y));
          if (!top) continue;
          hits++;
          r += top.color[0];
          g += top.color[1];
          b += top.color[2];
        }
      }
      const i = (py * size + px) * 4;
      if (hits === 0) continue;
      // Template do macOS: só preto + transparência; o sistema pinta conforme o tema.
      rgba[i] = template ? 0 : Math.round(r / hits);
      rgba[i + 1] = template ? 0 : Math.round(g / hits);
      rgba[i + 2] = template ? 0 : Math.round(b / hits);
      rgba[i + 3] = Math.round((255 * hits) / (SAMPLES * SAMPLES));
    }
  }
  return encodePng(size, rgba);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/tray/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const [file, size, template] of [
  ['tray.png', 16, false],
  ['tray@2x.png', 32, false],
  ['trayTemplate.png', 16, true],
  ['trayTemplate@2x.png', 32, true],
]) {
  writeFileSync(new URL(file, out), render(size, template));
  console.log(`public/tray/${file}`);
}
```

- [ ] **Step 2: Gerar e conferir os ícones**

Run: `node scripts/make-tray-icons.mjs && file public/tray/*.png`
Expected: quatro linhas `public/tray/...` e o `file` dizendo `PNG image data, 16 x 16, 8-bit/color RGBA` (ou `32 x 32`) para cada um. Abra `public/tray/tray@2x.png` com a ferramenta Read para ver a borboleta azul e roxa.

- [ ] **Step 3: Escrever o teste da dica**

Crie `src/main/tray-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { trayTooltip } from './tray-text';

describe('trayTooltip', () => {
  it('fora de sessão mostra só o nome do app', () => {
    expect(trayTooltip(null, false)).toBe('Chat Live Messenger');
  });

  it('logado mostra nome e status', () => {
    expect(trayTooltip({ name: 'Claudio', status: 'busy' }, false)).toBe('Chat Live Messenger – Claudio (Ocupado)');
  });

  it('avisa quando há atualização pronta', () => {
    expect(trayTooltip({ name: 'Claudio', status: 'available' }, true)).toBe(
      'Chat Live Messenger – Claudio (Disponível) – Atualização disponível',
    );
    expect(trayTooltip(null, true)).toBe('Chat Live Messenger – Atualização disponível');
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run src/main/tray-text.test.ts`
Expected: FAIL com "Failed to resolve import './tray-text'".

- [ ] **Step 5: Implementar a dica**

Crie `src/main/tray-text.ts`:

```ts
// Texto da dica do ícone da bandeja (separado do tray.ts para testar sem Electron).
import type { PresenceStatus } from '../shared/protocol';

const STATUS: Record<PresenceStatus, string> = {
  available: 'Disponível',
  away: 'Ausente',
  busy: 'Ocupado',
};

export function trayTooltip(self: { name: string; status: PresenceStatus } | null, updateReady: boolean): string {
  const parts = ['Chat Live Messenger'];
  if (self) parts.push(`${self.name} (${STATUS[self.status]})`);
  if (updateReady) parts.push('Atualização disponível');
  return parts.join(' – ');
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/main/tray-text.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 7: Criar o módulo da bandeja**

Crie `src/main/tray.ts` (sem teste automatizado: é só a chamada às APIs do Electron; verificado à mão na Task 10):

```ts
// Ícone na bandeja (área de notificação no Windows, barra de menus no mac), como no MSN.
import { Menu, Tray, nativeImage } from 'electron';
import path from 'node:path';

export interface TrayActions {
  open(): void;
  quit(): void;
}

export function createTray(iconDir: string, actions: TrayActions): Tray {
  const mac = process.platform === 'darwin';
  // createFromPath carrega sozinho a versão @2x ao lado do arquivo.
  const image = nativeImage.createFromPath(path.join(iconDir, mac ? 'trayTemplate.png' : 'tray.png'));
  if (mac) image.setTemplateImage(true);
  const tray = new Tray(image);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Chat Live Messenger', click: actions.open },
      { type: 'separator' },
      { label: 'Sair', click: actions.quit },
    ]),
  );
  // No Windows o clique abre a lista de contatos; no mac o clique abre o menu (padrão do sistema).
  if (!mac) tray.on('click', actions.open);
  return tray;
}
```

- [ ] **Step 8: Commit**

```bash
git add scripts/make-tray-icons.mjs public/tray src/main/tray-text.ts src/main/tray-text.test.ts src/main/tray.ts
git commit -m "Ícone e dica da bandeja

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Processo principal (janelas, roteamento, bandeja)

**Files:**
- Modify: `src/main.ts`

Todas as mudanças são em `src/main.ts`. Leia o arquivo inteiro antes de começar.

- [ ] **Step 1: Imports e estado**

Troque a primeira linha:

```ts
import { app, autoUpdater, BrowserWindow, ipcMain, Notification, screen, shell, type IpcMainInvokeEvent } from 'electron';
```

por:

```ts
import { app, autoUpdater, BrowserWindow, ipcMain, Notification, screen, shell, type IpcMainInvokeEvent, type Tray } from 'electron';
```

Depois de `import { Updater, feedUrl } from './main/updater';`, adicione:

```ts
import { Conversations } from './main/conversations';
import { ChatWindows, type ChatWindowHandle } from './main/chat-windows';
import { createTray } from './main/tray';
import { trayTooltip } from './main/tray-text';
```

No import de `./shared/api`, adicione `type ChatInit,` à lista.

Depois de `let updater: Updater | null = null;`, adicione:

```ts
const conversations = new Conversations();
let chats: ChatWindows;
let tray: Tray | null = null;
/** Saindo de verdade: o "X" da home para de esconder na bandeja. */
let quitting = false;
let trayHintShown = false;
```

- [ ] **Step 2: Broadcast, notificação por conversa e tremer qualquer janela**

Logo depois da função `sendToRenderer`, adicione:

```ts
/** Para todas as janelas (home e conversas): mudanças de perfil, fonte e avatares. */
function broadcast(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
}

function refreshTray() {
  const self = session ? { name: session.peers.name, status: session.peers.status } : null;
  tray?.setToolTip(trayTooltip(self, updater?.getStatus().state === 'ready'));
}
```

Substitua a função `notifyIfUnfocused` inteira por:

```ts
/** Notificação do sistema quando a conversa do contato não está em foco; o clique traz a conversa. */
function notifyChat(peerId: string, title: string, body: string) {
  if (chats.get(peerId)?.focused || !Notification.isSupported()) return;
  const n = new Notification({ title, body: body.slice(0, 200), silent: false });
  n.on('click', () => chats.open(peerId, true));
  n.show();
}
```

Substitua o bloco de `let shaking = false;` até o fim da função `shakeWindow()` por:

```ts
const shaking = new WeakSet<BrowserWindow>();

/** Faz a janela tremer, como o "chamar atenção" do MSN. */
function shakeWindow(w: BrowserWindow) {
  if (w.isDestroyed() || shaking.has(w)) return;
  // Minimizada: reaparece sem roubar o foco, como a janela de conversa do MSN.
  if (w.isMinimized()) w.showInactive();
  if (w.isMaximized() || w.isFullScreen()) return;

  shaking.add(w);
  const [x, y] = w.getPosition();
  const steps = [
    [-10, -4], [10, 4], [-9, 3], [9, -3], [-7, -2], [7, 2], [-5, 2], [5, -2], [-3, -1], [3, 1], [0, 0],
  ];
  let i = 0;
  const timer = setInterval(() => {
    if (w.isDestroyed() || i >= steps.length) {
      clearInterval(timer);
      if (!w.isDestroyed()) w.setPosition(x, y);
      shaking.delete(w);
      return;
    }
    w.setPosition(x + steps[i][0], y + steps[i][1]);
    i++;
  }, 35);
}
```

- [ ] **Step 3: Eventos da rede no login**

Em `login()`, substitua o bloco de `peers.on('peer', ...)` até o fim de `peers.on('image', ...)` por:

```ts
  peers.on('peer', (peer) => {
    sendToRenderer(IPC.peer, peer);
    chats.peerChanged(peer);
  });
  peers.on('avatar', (avatar) => broadcast(IPC.peerAvatar, avatar));
  peers.on('message', (msg) => {
    chats.receive(msg.from, { kind: 'text', message: msg });
    notifyChat(msg.from, `${msg.fromName} diz:`, msg.text);
  });
  peers.on('wink', (wink) => {
    chats.receive(wink.from, { kind: 'wink', wink });
    notifyChat(wink.from, 'Chat Live Messenger', `${wink.fromName} enviou um wink`);
  });
  peers.on('nudge', (nudge) => {
    chats.receive(nudge.from, { kind: 'nudge', nudge });
    notifyChat(nudge.from, 'Chat Live Messenger', `${nudge.fromName} chamou a sua atenção!`);
  });
  peers.on('image', (img) => {
    chats.receive(img.from, { kind: 'image', image: img });
    notifyChat(img.from, `${img.fromName} enviou uma imagem`, img.name);
  });
```

No fim de `login()`, logo antes de `return selfInfo(session);`, adicione:

```ts
  refreshTray();
```

- [ ] **Step 4: Logout fecha as conversas**

Substitua a função `logout` inteira por:

```ts
async function logout() {
  chats?.closeAll();
  conversations.clear();
  const s = session;
  session = null;
  refreshTray();
  if (!s) return;
  await Promise.allSettled([s.discovery.stop(), s.peers.stop()]);
}
```

- [ ] **Step 5: Handlers de IPC**

Em `registerIpc()`:

1. No handler `IPC.setPresence`, logo antes de `return selfInfo(s);`, adicione:

```ts
    broadcast(IPC.selfChanged, selfInfo(s));
    refreshTray();
```

2. No handler `IPC.setAvatar`, depois de `session?.peers.setAvatar(image);`, adicione:

```ts
    broadcast(IPC.myAvatarChanged, avatars.getCurrent());
```

3. No handler `IPC.setFont`, troque `return valid;` por:

```ts
    broadcast(IPC.fontChanged, valid);
    return valid;
```

4. Substitua o handler `IPC.giphySend` inteiro por:

```ts
  handle(IPC.giphySend, async (to: unknown, id: unknown) => {
    const s = requireSession();
    const peerId = requirePeerId(to);
    const gif = await giphy.fetchForSending(String(id));
    const name = `${gif.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || 'giphy'}.gif`;
    const meta = s.peers.sendImage(peerId, { name, data: gif.data });
    chats.record(peerId, { kind: 'image', image: { ...meta, data: gif.data } });
    return { meta, data: gif.data };
  });
```

5. Substitua os handlers `IPC.send`, `IPC.sendImage`, `IPC.sendNudge` e `IPC.sendWink` (os quatro inteiros) por:

```ts
  handle(IPC.send, (to: unknown, text: unknown) => {
    if (typeof text !== 'string') throw new Error('Texto inválido');
    const peerId = requirePeerId(to);
    const message = requireSession().peers.sendText(peerId, text, settings.font ?? DEFAULT_FONT);
    chats.record(peerId, { kind: 'text', message });
    return message;
  });
  handle(IPC.sendImage, (to: unknown, image: OutgoingImage) => {
    if (!image || !(image.data instanceof Uint8Array)) throw new Error('Imagem inválida');
    const peerId = requirePeerId(to);
    const meta = requireSession().peers.sendImage(peerId, { name: String(image.name ?? ''), data: image.data });
    chats.record(peerId, { kind: 'image', image: { ...meta, data: image.data } });
    return meta;
  });
  handle(IPC.sendNudge, (to: unknown) => {
    const peerId = requirePeerId(to);
    const nudge = requireSession().peers.sendNudge(peerId);
    chats.record(peerId, { kind: 'nudge', nudge });
    // No MSN a janela de quem chama também treme.
    chats.get(peerId)?.shake();
    return nudge;
  });
  handle(IPC.sendWink, (to: unknown, wink: unknown) => {
    if (!isWinkId(wink)) throw new Error('Wink desconhecido');
    const peerId = requirePeerId(to);
    const sent = requireSession().peers.sendWink(peerId, wink);
    chats.record(peerId, { kind: 'wink', wink: sent });
    return sent;
  });
  ipcMain.on(IPC.openChat, (_e, peerId: unknown) => {
    if (typeof peerId === 'string') chats.open(peerId, true);
  });
  handle(IPC.getChatInit, (peerId: unknown): ChatInit => {
    const id = requirePeerId(peerId);
    return {
      peer: session?.peers.getPeers().find((p) => p.id === id) ?? null,
      history: conversations.get(id),
    };
  });
```

6. Logo antes de `function registerIpc() {`, adicione:

```ts
function requirePeerId(v: unknown): string {
  if (typeof v !== 'string' || !v) throw new Error('Contato inválido');
  return v;
}
```

- [ ] **Step 6: Criação das janelas e da bandeja**

Substitua a função `startUpdater` para atualizar a dica da bandeja junto com a barra:

```ts
function startUpdater() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  updater = new Updater(autoUpdater, (status) => {
    sendToRenderer(IPC.updateStatus, status);
    refreshTray();
  });
  // O quitAndInstall fecha as janelas antes do before-quit: sem isso, o "X" da home esconderia em vez de fechar.
  autoUpdater.on('before-quit-for-update', () => {
    quitting = true;
  });
  // Logo após instalar, o Squirrel ainda está mexendo nos arquivos: espera mais para a 1ª checagem.
  const firstRun = process.argv.includes('--squirrel-firstrun');
  updater.start(feedUrl(process.platform, process.arch, app.getVersion()), firstRun ? 60_000 : 10_000);
}
```

Substitua a função `createWindow` inteira (de `const createWindow = () => {` até o `};` que a fecha) por:

```ts
const WEB_PREFERENCES: Electron.WebPreferences = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
};

/** Mesmo index.html em todas as janelas; `query` (ex.: "chat=<id>") diz o papel da janela. */
function loadRenderer(w: BrowserWindow, query = '') {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    w.loadURL(query ? `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?${query}` : MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    w.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), query ? { search: query } : undefined);
  }
}

/** Nada de navegação ou janelas novas a partir do conteúdo. */
function harden(w: BrowserWindow) {
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  w.on('focus', () => w.flashFrame(false));
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Aviso único por execução: fechar a home não sai do app. */
function showTrayHintOnce() {
  if (trayHintShown || !Notification.isSupported()) return;
  trayHintShown = true;
  const where = process.platform === 'darwin' ? 'na barra de menus' : 'na bandeja';
  new Notification({ title: 'Chat Live Messenger', body: `O Chat continua rodando ${where}.`, silent: true }).show();
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: LAYOUTS.login.width,
    height: LAYOUTS.login.height,
    minWidth: LAYOUTS.login.minWidth,
    minHeight: LAYOUTS.login.minHeight,
    center: true,
    title: 'Chat Live Messenger',
    // Sem moldura nativa: a barra de título azul (estilo MSN) é desenhada pela interface.
    frame: false,
    backgroundColor: '#ffffff',
    webPreferences: WEB_PREFERENCES,
  });
  harden(mainWindow);
  currentLayout.set(mainWindow, 'login');
  loadRenderer(mainWindow);

  // Logado: o "X" esconde na bandeja e o app continua online. Na tela de login: fecha o app.
  mainWindow.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    if (session) {
      mainWindow?.hide();
      showTrayHintOnce();
    } else {
      app.quit();
    }
  });
  mainWindow.on('closed', () => (mainWindow = null));
};

function createChatWindow(peerId: string, onClosed: () => void): ChatWindowHandle {
  const l = LAYOUTS.chat;
  const w = new BrowserWindow({
    width: l.width,
    height: l.height,
    minWidth: l.minWidth,
    minHeight: l.minHeight,
    show: false,
    title: 'Conversa - Chat Live Messenger',
    frame: false,
    backgroundColor: '#ffffff',
    webPreferences: WEB_PREFERENCES,
  });
  harden(w);
  currentLayout.set(w, 'chat');
  w.on('closed', onClosed);
  loadRenderer(w, `chat=${encodeURIComponent(peerId)}`);
  return {
    get destroyed() {
      return w.isDestroyed();
    },
    get focused() {
      return !w.isDestroyed() && w.isFocused();
    },
    show(focus) {
      if (w.isDestroyed()) return;
      if (focus) {
        if (w.isMinimized()) w.restore();
        w.show();
        w.focus();
        return;
      }
      // Como no MSN: aparece atrás do que você está fazendo e pisca na barra de tarefas.
      if (!w.isVisible()) w.showInactive();
      if (!w.isFocused()) w.flashFrame(true);
    },
    send(channel, payload) {
      if (!w.isDestroyed()) w.webContents.send(channel, payload);
    },
    close() {
      if (!w.isDestroyed()) w.close();
    },
    shake() {
      shakeWindow(w);
    },
  };
}
```

- [ ] **Step 7: Ciclo de vida do app**

Em `app.on('ready', ...)`, depois de `registerIpc();`, adicione a criação do gerente e da bandeja; o bloco fica:

```ts
  registerIpc();
  chats = new ChatWindows(createChatWindow, conversations, (id) =>
    !!session?.peers.getPeers().some((p) => p.id === id),
  );
  createWindow();
  const trayIcons = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? path.join(app.getAppPath(), 'public', 'tray')
    : path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/tray`);
  tray = createTray(trayIcons, { open: showMainWindow, quit: () => app.quit() });
  refreshTray();
  startUpdater();
```

(Remova as linhas antigas `createWindow();` e `startUpdater();` que ficariam duplicadas.)

No handler `app.on('before-quit', ...)`, logo depois de `if (shuttingDown) return;`, adicione:

```ts
  quitting = true;
```

Substitua o handler `app.on('activate', ...)` por:

```ts
app.on('activate', () => showMainWindow());
```

- [ ] **Step 8: Conferir os testes do main**

Run: `npx vitest run src/main`
Expected: PASS. (Typecheck do renderer continua vermelho até a Task 9.)

Run: `npx tsc --noEmit 2>&1 | grep "src/main.ts"`
Expected: nenhuma linha. Se aparecer erro em `src/main.ts`, corrija antes de seguir; os erros restantes devem ser só em `src/renderer*`.

- [ ] **Step 9: Commit**

```bash
git add src/main.ts
git commit -m "Main: janela por conversa, bandeja e home que esconde ao fechar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Renderer: estado, fonte, avatar e GIPHY

**Files:**
- Modify: `src/renderer/state.ts`
- Modify: `src/renderer/font.ts`
- Modify: `src/renderer/avatar.ts`
- Modify: `src/renderer/giphy.ts`

- [ ] **Step 1: `state.ts`**

Substitua o objeto `TITLES` e o `state` por:

```ts
const TITLES: Record<ViewName, string> = {
  login: 'Chat Live Messenger',
  home: 'Chat Live Messenger',
  chat: 'Conversa - Chat Live Messenger',
};

export const state = {
  self: null as SelfInfo | null,
  peers: new Map<string, PeerInfo>(),
  view: 'login' as ViewName,
  /** Contato desta janela de conversa (null na janela principal). */
  peerId: null as string | null,
};
```

Na função `resetSession`, remova a linha `state.unread = 0;`.

- [ ] **Step 2: `font.ts`**

Logo depois da função `loadFont`, adicione:

```ts
/** Fonte trocada em outra janela: aplica aqui também. */
export function watchFontChanges() {
  chat().onFontChanged(setCurrent);
}
```

- [ ] **Step 3: `avatar.ts`**

Logo depois da função `loadMyAvatar`, adicione:

```ts
/** Imagem trocada em outra janela: atualiza aqui também. */
export function watchMyAvatar() {
  chat().onMyAvatarChanged((a) => setMine(a?.data ?? null, a?.mime));
}
```

- [ ] **Step 4: `giphy.ts`**

Adicione o import (junto dos outros imports do arquivo):

```ts
import { state } from './state';
```

Troque a linha:

```ts
    const { meta, data } = await chat().giphySend(id);
```

por:

```ts
    const { meta, data } = await chat().giphySend(state.peerId ?? '', id);
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/state.ts src/renderer/font.ts src/renderer/avatar.ts src/renderer/giphy.ts
git commit -m "Renderer: contato da janela e sincronia de fonte e avatar entre janelas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Renderer: conversa com um contato só

**Files:**
- Modify: `src/renderer/chat.ts`
- Modify: `index.html`

- [ ] **Step 1: HTML do cabeçalho e da barra de ferramentas**

Em `index.html`, substitua o bloco `<div class="chat-header"> ... </div>` (o da seção `view-chat`) por:

```html
        <div class="chat-header">
          <svg class="chat-header-icon" aria-hidden="true"><use href="#i-buddy" /></svg>
          <div class="chat-header-text">
            <div class="chat-title"><span id="chat-peer-name"></span> <span class="chat-count" id="chat-peer-status"></span></div>
            <div class="chat-to" id="chat-peer-message"></div>
          </div>
        </div>
```

No `<div class="chat-toolbar">`, remova os botões inteiros `id="chat-back"` (Contatos) e `id="chat-invite"` (Convidar). Troque o `title` do botão `chat-nudge` de `"Chamar a atenção de todos na conversa"` para `"Chamar a atenção do contato"`.

Em `<aside class="chat-pictures">`, troque o primeiro avatar:

```html
            <div class="avatar avatar-glass avatar-chat" id="chat-group-avatar" data-status="available">
              <div class="avatar-inner avatar-inner-group"><svg><use href="#i-group" /></svg></div>
            </div>
```

por:

```html
            <div class="avatar avatar-glass avatar-chat" id="chat-peer-avatar" data-status="available">
              <div class="avatar-inner"><svg><use href="#i-person-3d" /></svg></div>
            </div>
```

- [ ] **Step 2: Imports e elementos em `chat.ts`**

Troque o comentário da primeira linha por:

```ts
// Janela de conversa com um contato, no formato do MSN: "Fulano diz:" e a mensagem recuada embaixo.
```

Troque o import de tipos:

```ts
import type { UiChatMessage, UiImageMeta, UiNudge, UiWink } from '../shared/api';
```

por:

```ts
import type { PeerInfo, UiChatMessage, UiImageMeta, UiNudge, UiWink } from '../shared/api';
```

Troque `import { onPeersChange, onlinePeers, state } from './state';` por:

```ts
import { state } from './state';
import { STATUS_LABEL } from './status';
```

No objeto `els`, remova as linhas `back`, `invite`, `to`, `count` e `groupAvatar`, e adicione:

```ts
  peerName: $('chat-peer-name'),
  peerStatus: $('chat-peer-status'),
  peerMessage: $('chat-peer-message'),
  peerAvatar: $('chat-peer-avatar'),
  sendBtn: $<HTMLButtonElement>('send-btn'),
```

Troque `let handlers = { back: (): void => undefined, invite: (): void => undefined };` por:

```ts
let peer: PeerInfo | null = null;
```

Logo depois do objeto `els`, adicione:

```ts
const TEXT_PLACEHOLDER = els.text.placeholder;

/** Contato desta janela; erro se a janela não é de conversa. */
function to(): string {
  if (!state.peerId) throw new Error('Conversa sem contato');
  return state.peerId;
}
```

- [ ] **Step 3: Cabeçalho do contato no lugar do grupo**

Remova as funções `renderTo` e `renderGroupPicture` e as linhas `onPeerAvatarsChange(renderGroupPicture);` e `onPeersChange(renderTo);`. No lugar, adicione:

```ts
/** Cabeçalho, título da janela (aparece na barra de tarefas) e caixa de texto conforme o contato. */
export function setPeer(p: PeerInfo) {
  peer = p;
  els.peerName.textContent = p.name;
  els.peerStatus.textContent = `(${p.online ? STATUS_LABEL[p.status] : 'Offline'})`;
  els.peerMessage.replaceChildren();
  renderRichText(els.peerMessage, p.message);
  els.peerAvatar.dataset.status = p.online ? p.status : 'offline';
  paintAvatar(els.peerAvatar, peerAvatarUrl(p.id));
  const title = `${p.name} – Conversa`;
  document.title = title;
  $('titlebar-title').textContent = title;

  // Offline: dá para ler a conversa, mas não enviar.
  els.text.disabled = !p.online;
  els.sendBtn.disabled = !p.online;
  els.nudge.disabled = !p.online;
  els.fmtNudge.disabled = !p.online;
  els.text.placeholder = p.online ? TEXT_PLACEHOLDER : `${p.name} está offline.`;
}

onPeerAvatarsChange(() => {
  if (peer) paintAvatar(els.peerAvatar, peerAvatarUrl(peer.id));
});
```

- [ ] **Step 4: Envio para o contato**

Nas funções de envio, passe o contato:

- em `sendText`: `const msg = await chat().send(text);` → `const msg = await chat().send(to(), text);`
- em `sendFile`: `const meta = await chat().sendImage({ name: file.name, data });` → `const meta = await chat().sendImage(to(), { name: file.name, data });`
- em `sendNudge`: `addNudge(await chat().nudge());` → `addNudge(await chat().nudge(to()));`
- em `sendWink`: `addWink(await chat().sendWink(id), true);` → `addWink(await chat().sendWink(to(), id), true);`

Remova as linhas:

```ts
els.back.addEventListener('click', () => handlers.back());
els.invite.addEventListener('click', () => handlers.invite());
```

- [ ] **Step 5: Nudge sem tremer ao reler o histórico e wink sem fila**

Troque a função `addNudge` por:

```ts
/** `shakeNow: false` ao reler o histórico: só registra, sem tremer nem tocar o som. */
export function addNudge(n: UiNudge, shakeNow = true) {
  if (!n.self) noteReceived(n.ts);
  last = null;
  const li = el('li', 'nudge-line', n.self ? 'Você chamou a atenção.' : `${n.fromName} chamou a sua atenção!`);
  li.title = timeFmt.format(n.ts);
  append(li, true);
  if (shakeNow) shake();
}
```

Remova a declaração `let pendingWink: WinkId | null = null;` e o comentário acima dela. Em `addWink`, troque as duas últimas linhas:

```ts
  if (play) playWink(w.wink, els.main);
  else pendingWink = w.wink;
```

por:

```ts
  if (play) playWink(w.wink, els.main);
```

Em `clearChat`, remova a linha `pendingWink = null;`.

- [ ] **Step 6: Init da conversa**

Substitua `initChat` e `enterChat` (do comentário `// ---------------------------------------------------------------- init` até o fim do arquivo) por:

```ts
// ---------------------------------------------------------------- init

export function enterChat() {
  restoreComposeHeight();
  els.meAvatar.dataset.status = state.self?.status ?? 'available';
  els.messages.scrollTop = els.messages.scrollHeight;
  if (!els.text.disabled) els.text.focus();
}
```

- [ ] **Step 7: Conferir que `chat.ts` compila**

Run: `npx tsc --noEmit 2>&1 | grep "src/renderer/chat.ts"`
Expected: nenhuma linha. (Os erros restantes são em `src/renderer.ts` e `src/renderer/home.ts`, resolvidos na Task 9.) Se aparecer `'WinkId' is declared but never used`, mantenha: `WinkId` ainda é usado por `sendWink(id: WinkId)`.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/chat.ts index.html
git commit -m "Conversa com um contato só: cabeçalho, envio e contato offline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Renderer: home, janela principal e janela de conversa

**Files:**
- Modify: `src/renderer/home.ts`
- Modify: `index.html`
- Create: `src/renderer/main-window.ts`
- Create: `src/renderer/chat-window.ts`
- Modify: `src/renderer.ts`

- [ ] **Step 1: Tirar a "Conversa em grupo" do HTML da home**

Em `index.html`, dentro de `<div class="contact-list" id="contact-list">`, remova o primeiro `<div class="contact-group"> ... </div>` inteiro (o que tem o cabeçalho "Conversas" e o botão `id="open-group"`).

- [ ] **Step 2: `home.ts`**

No objeto `els`, remova as linhas `openGroup`, `groupSub` e `unread`.

Troque a interface `HomeHandlers` e o valor inicial:

```ts
interface HomeHandlers {
  openChat(): void;
  logout(): void;
  help(): void;
}

let handlers: HomeHandlers = { openChat: () => undefined, logout: () => undefined, help: () => undefined };
```

por:

```ts
interface HomeHandlers {
  openChat(peerId: string): void;
  logout(): void;
  help(): void;
}

let handlers: HomeHandlers = { openChat: () => undefined, logout: () => undefined, help: () => undefined };
```

Em `contactRow`, troque o `title` por:

```ts
  li.title = `${p.name} — ${p.online ? STATUS_LABEL[p.status] : 'Offline'}\n${p.address}\nClique duas vezes para abrir a conversa`;
```

Em `renderContacts`, remova as quatro últimas linhas (de `const names = onlinePeers()...` até o `: '- Ninguém online ainda';`). Remova `onlinePeers` do import de `./state` se ficar sem uso.

Substitua os handlers de `dblclick` e `keydown` das listas por:

```ts
  list.addEventListener('dblclick', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('.contact')?.dataset.id;
    if (id) handlers.openChat(id);
  });
  list.addEventListener('keydown', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('.contact')?.dataset.id;
    if (e.key === 'Enter' && id) handlers.openChat(id);
  });
```

Remova a linha `els.openGroup.addEventListener('click', () => handlers.openChat());` e, no menu, a linha `{ label: 'Abrir conversa em grupo', onSelect: () => handlers.openChat() },`.

Remova a função `setUnread` inteira.

- [ ] **Step 3: Criar `src/renderer/main-window.ts`**

```ts
// Janela principal: login e lista de contatos. As conversas abrem em janelas próprias (chat-window.ts).
import type { SelfInfo } from '../shared/api';
import { $, chat } from './dom';
import { applyPeerAvatar, clearPeerAvatars, initAvatars, loadMyAvatar, loadPeerAvatars, watchMyAvatar } from './avatar';
import { loadFont, watchFontChanges } from './font';
import { enterHome, initHome, renderSelf } from './home';
import { initLogin, prepareLogin } from './login';
import { closeMenu } from './status';
import { resetSession, setPeers, showView, state, upsertPeer } from './state';
import { initUpdate } from './update';

async function afterLogin(self: SelfInfo) {
  state.self = self;
  setPeers(await chat().getPeers());
  await loadPeerAvatars();
  enterHome(self);
  showView('home');
}

async function logout() {
  closeMenu();
  await chat().logout();
  resetSession();
  clearPeerAvatars();
  showView('login');
  await prepareLogin(false);
}

export async function startMainWindow(help: () => void) {
  initLogin((self) => void afterLogin(self));
  initHome({ openChat: (id) => chat().openChat(id), logout: () => void logout(), help });
  initUpdate();
  initAvatars(() => state.self?.status ?? $('login-avatar').dataset.status ?? 'available');
  watchFontChanges();
  watchMyAvatar();

  chat().onPeer((peer) => {
    if (state.self) upsertPeer(peer);
  });
  chat().onPeerAvatar((avatar) => {
    if (state.self) applyPeerAvatar(avatar);
  });
  chat().onSelfChanged((self) => {
    if (!state.self) return;
    state.self = self;
    renderSelf(self);
  });

  await Promise.all([loadMyAvatar(), loadFont()]);
  // Janela recarregada com a sessão ainda ativa: volta direto para os contatos.
  const session = await chat().getSession();
  if (session) {
    await afterLogin(session);
    return;
  }
  showView('login');
  // "Entrar automaticamente" vale só na abertura do app, não depois de sair.
  let firstBoot = true;
  try {
    firstBoot = !sessionStorage.getItem('chatlan:booted');
    sessionStorage.setItem('chatlan:booted', '1');
  } catch {
    // sem sessionStorage: trata como primeira abertura
  }
  await prepareLogin(firstBoot);
}
```

Antes de criar, confira em `src/renderer.ts` atual o bloco de início (`(async () => { ... })();`) e copie qualquer linha que exista nele e não esteja acima; o trecho acima reproduz o que existe hoje.

- [ ] **Step 4: Criar `src/renderer/chat-window.ts`**

```ts
// Janela de conversa com um contato: carrega o histórico da sessão e recebe os itens novos do main.
import type { ConversationItem, PeerInfo } from '../shared/api';
import { chat } from './dom';
import { applyPeerAvatar, initAvatars, loadMyAvatar, loadPeerAvatars, watchMyAvatar } from './avatar';
import { loadFont, watchFontChanges } from './font';
import { addImage, addNudge, addSystem, addText, addWink, enterChat, setPeer } from './chat';
import { showView, state } from './state';

/** Wink ou nudge que chegou há menos disso toca ao abrir: foi ele que abriu a janela. */
const REPLAY_MS = 10_000;

function render(item: ConversationItem, live: boolean) {
  const fresh = live || Date.now() - item.at < REPLAY_MS;
  switch (item.kind) {
    case 'text':
      addText(item.message);
      break;
    case 'image':
      addImage(item.image, new Blob([item.image.data as Uint8Array<ArrayBuffer>], { type: item.image.mime }));
      break;
    case 'wink':
      addWink(item.wink, fresh);
      break;
    case 'nudge':
      addNudge(item.nudge, fresh);
      break;
    case 'system':
      addSystem(item.text);
      break;
  }
}

const unknownPeer = (id: string): PeerInfo => ({
  id,
  name: id,
  status: 'available',
  message: '',
  address: '',
  online: false,
});

export async function startChatWindow(peerId: string) {
  state.peerId = peerId;
  showView('chat');
  initAvatars(() => state.self?.status ?? 'available');
  watchFontChanges();
  watchMyAvatar();

  state.self = await chat().getSession();
  if (!state.self) {
    // Sessão encerrada: conversa sem sentido.
    chat().close();
    return;
  }
  await Promise.all([loadMyAvatar(), loadFont(), loadPeerAvatars()]);

  // Assina antes de pedir o histórico; o que chegar no meio espera na fila e o seq evita repetidos.
  let lastSeq = 0;
  let queue: ConversationItem[] | null = [];
  chat().onChatItem((item) => {
    if (queue) {
      queue.push(item);
    } else if (item.seq > lastSeq) {
      lastSeq = item.seq;
      render(item, true);
    }
  });
  chat().onPeer((p) => {
    if (p.id === peerId) setPeer(p);
  });
  chat().onPeerAvatar((a) => applyPeerAvatar(a));
  chat().onSelfChanged((self) => {
    state.self = self;
  });

  const init = await chat().getChatInit(peerId);
  setPeer(init.peer ?? unknownPeer(peerId));
  for (const item of init.history) {
    lastSeq = item.seq;
    render(item, false);
  }
  const pending = queue;
  queue = null;
  for (const item of pending) {
    if (item.seq <= lastSeq) continue;
    lastSeq = item.seq;
    render(item, true);
  }
  enterChat();
}
```

- [ ] **Step 5: Reescrever `src/renderer.ts`**

Substitua o arquivo inteiro por:

```ts
// Entrada do renderer. O mesmo index.html serve a janela principal (login e contatos)
// e as janelas de conversa (?chat=<id do contato>). Sem acesso ao Node: tudo passa por window.chat.
import { $, chat } from './renderer/dom';
import { startChatWindow } from './renderer/chat-window';
import { startMainWindow } from './renderer/main-window';

// ---------------------------------------------------------------- barra de título (janela sem moldura)

$('win-min').addEventListener('click', () => chat().minimize());
$('win-max').addEventListener('click', () => chat().toggleMaximize());
$('win-close').addEventListener('click', () => chat().close());
$('titlebar').addEventListener('dblclick', (e) => {
  if (!(e.target as HTMLElement).closest('.titlebar-buttons')) chat().toggleMaximize();
});

// ---------------------------------------------------------------- ajuda

const help = $<HTMLDialogElement>('help-dialog');
const openHelp = () => help.showModal();
for (const id of ['login-help', 'login-footer-help']) {
  $(id).addEventListener('click', openHelp);
}
$('help-close').addEventListener('click', () => help.close());

// ---------------------------------------------------------------- papel da janela

const chatWith = new URLSearchParams(location.search).get('chat');
if (chatWith) void startChatWindow(chatWith);
else void startMainWindow(openHelp);
```

- [ ] **Step 6: Typecheck, lint e testes**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tudo passa. Erros comuns e correção:
- `'onlinePeers' is declared but its value is never read` em `home.ts`: remova do import.
- import não usado de `WinkId` em `chat.ts`: só remova se o compilador apontar.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/home.ts src/renderer/main-window.ts src/renderer/chat-window.ts src/renderer.ts index.html
git commit -m "Janela principal e janelas de conversa separadas

Closes #1, closes #2, closes #3, closes #4, closes #5

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Verificação manual e README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rodar o app**

Run: `npm start`
Expected: log `[chat-lan] ... ouvindo na porta 47800` e a janela de login. Um ícone de borboleta aparece na barra de menus do mac.

- [ ] **Step 2: Roteiro manual (Mac + outro computador na rede)**

Faça e anote o resultado de cada um:

1. Entrar. Duplo clique num contato abre uma janela "Nome – Conversa", com botão próprio no Dock (Cmd+Tab/Mission Control mostra janelas separadas).
2. Com dois contatos online, abrir as duas conversas. Mensagem enviada numa **não** aparece na outra nem chega ao outro contato.
3. Minimizar uma conversa: só ela vai para o Dock; a home e a outra conversa ficam.
4. Fechar uma conversa: a home segue funcionando; reabrir pelo duplo clique mostra o histórico da sessão.
5. Com a conversa fechada, o contato manda mensagem: a janela abre **sem roubar o foco** e o ícone pula no Dock.
6. Fechar a home (X) logado: aparece a notificação "O Chat continua rodando na barra de menus."; mensagens continuam chegando. Menu da borboleta → "Abrir Chat Live Messenger" traz a home.
7. Contato sai do app: a conversa aberta mostra "Nome saiu da conversa", o campo fica desativado com "Nome está offline."; quando volta, "entrou" e o campo reativa.
8. Trocar a fonte numa conversa: a outra conversa aberta passa a usar a mesma fonte.
9. "Chamar atenção" treme só a conversa daquele contato, dos dois lados.
10. Menu de status → "Sair": todas as conversas fecham e a home volta ao login.
11. Na tela de login, fechar a janela: o app encerra (a borboleta some da barra de menus).
12. Com o app logado, borboleta → "Sair": o app encerra.

Se algum item falhar, pare e corrija antes do commit (use superpowers:systematic-debugging).

- [ ] **Step 3: Atualizar o README**

Em `README.md`, na seção `## Como usar`, adicione ao fim da seção (antes do próximo `###` ou `##`):

```markdown
### Conversas e bandeja

- Clique duas vezes num contato para abrir a conversa com ele. Cada conversa tem a própria janela e o
  próprio botão na barra de tarefas (Windows) ou no Dock (mac).
- As mensagens vão só para aquele contato. Não existe mais a conversa em grupo.
- Chegou mensagem de alguém cuja conversa está fechada? A janela abre sem roubar o foco e pisca na
  barra de tarefas.
- Fechar a lista de contatos não sai do app: ele continua online na bandeja (ou na barra de menus do
  mac). Para sair, use **Sair** no menu do ícone da borboleta.
- O histórico da conversa vale enquanto o app estiver aberto; ao sair, ele some (como no MSN).
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "README: conversas em janelas próprias e bandeja

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Publicar

- [ ] **Step 1: Pedir autorização ao usuário para o push**

O push na `main` dispara o workflow Release e publica uma versão nova para os apps instalados no Windows. Pergunte antes.

- [ ] **Step 2: Push e acompanhar o CI**

```bash
git push origin main
gh run list --limit 1
```

Acompanhe com `gh run watch <id> --exit-status` em segundo plano e confira que o release novo tem `RELEASES`, `.nupkg` e `ChatLAN-Setup.exe` (`gh release view --json assets`).

- [ ] **Step 3: Validação no Windows (usuário)**

Repetir no Windows os itens 1, 3, 5, 6 e 12 do roteiro da Task 10. No Windows, o item 5 pisca o botão laranja na barra de tarefas e o item 6 fala "na bandeja"; o clique esquerdo no ícone da bandeja abre a home.
