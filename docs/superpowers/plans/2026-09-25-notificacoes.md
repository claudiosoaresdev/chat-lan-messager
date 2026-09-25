# Notificações de nova mensagem (#6, #7): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Destaque laranja na barra e na lista de contatos, som a cada mensagem recebida fora de foco (com opção de silenciar) e conversa com padding horizontal.

**Architecture:** O main (`ChatWindows`) marca contatos com item não visto e avisa a home; a janela de conversa decide tocar o som com uma regra pura; a opção de som fica em `settings.json` e é sincronizada entre janelas.

**Tech Stack:** Electron 44 + Forge (Vite), TypeScript, vitest, Web Audio.

**Spec:** [docs/superpowers/specs/2026-09-25-notificacoes-design.md](../specs/2026-09-25-notificacoes-design.md)

**Comandos:** `npm test`, `npm run typecheck`, `npm run lint`. Um arquivo: `npx vitest run <arquivo>`.

**Tipos:** a Task 4 muda a assinatura da fábrica de janelas e a API; o typecheck pode ficar vermelho entre a Task 2 e o fim da Task 5. Cada task roda só os testes indicados.

Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Opção de som nas configurações

**Files:** Modify `src/main/config.ts`, `src/main/config.test.ts`

- [ ] **Step 1: Teste.** Em `src/main/config.test.ts`, no teste `'salva e carrega; arquivo ausente ou corrompido vira padrão'`, acrescente `sounds: true` a todo objeto esperado em `toEqual(...)` e ao objeto passado para `store.save(...)` troque para `sounds: false` e espere `sounds: false` no `load()` logo em seguida. Depois do teste existente, adicione:

```ts
  it('sons ficam ligados por padrão em arquivo antigo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatlan-'));
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ manualPeers: [] }));
    expect(new SettingsStore(dir).load().sounds).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
```

- [ ] **Step 2:** `npx vitest run src/main/config.test.ts` → FAIL (falta `sounds`).

- [ ] **Step 3: Implementar.** Em `src/main/config.ts`, na interface `Settings`, depois de `giphyKey`:

```ts
  /** Som de nova mensagem (menu ☰ da home). Padrão: ligado. */
  sounds: boolean;
```

Em `load()`, o retorno de sucesso passa a ser:

```ts
      return {
        manualPeers,
        profile: parseProfile(raw?.profile),
        font: validateFont(raw?.font),
        giphyKey,
        sounds: raw?.sounds !== false,
      };
```

e o retorno do `catch`: `return { manualPeers: [], profile: null, font: null, giphyKey: null, sounds: true };`

- [ ] **Step 4:** `npx vitest run src/main/config.test.ts` → PASS.
- [ ] **Step 5: Commit** `git add src/main/config.ts src/main/config.test.ts && git commit` com a mensagem `Configuração: opção de som de mensagem` + linha Co-Authored-By.

---

### Task 2: Contatos com mensagem não vista no ChatWindows

**Files:** Modify `src/main/chat-windows.ts`, `src/main/chat-windows.test.ts`

- [ ] **Step 1: Adaptar o teste à nova fábrica.** Em `src/main/chat-windows.test.ts`:

Troque o import por:

```ts
import { ChatWindows, type ChatWindowEvents, type ChatWindowHandle } from './chat-windows';
```

Substitua a classe `FakeWindow` por:

```ts
class FakeWindow implements ChatWindowHandle {
  destroyed = false;
  focused = false;
  shown: boolean[] = [];
  sent: Array<[string, unknown]> = [];
  shakes = 0;
  constructor(
    readonly peerId: string,
    private readonly events: ChatWindowEvents,
  ) {}
  show(focus: boolean) {
    this.shown.push(focus);
    if (focus) this.focus();
  }
  send(channel: string, payload: unknown) {
    this.sent.push([channel, payload]);
  }
  close() {
    this.destroyed = true;
    this.focused = false;
    this.events.onClosed();
  }
  shake() {
    this.shakes++;
  }
  /** Simula o usuário clicando na janela. */
  focus() {
    this.focused = true;
    this.events.onFocused();
  }
  blur() {
    this.focused = false;
  }
}
```

Substitua a função `setup` por:

```ts
function setup() {
  const created: FakeWindow[] = [];
  const unreadEvents: Array<[string, boolean]> = [];
  const conversations = new Conversations();
  const chats = new ChatWindows(
    (peerId, events) => {
      const w = new FakeWindow(peerId, events);
      created.push(w);
      return w;
    },
    conversations,
    (id) => KNOWN.has(id),
    (peerId, unread) => unreadEvents.push([peerId, unread]),
  );
  return { chats, created, conversations, unreadEvents };
}
```

Atenção: com `show(true)` agora focando a janela falsa, o teste `'entrega o item à janela aberta'` continua válido (a janela aberta com foco recebe o item). Rode `npx vitest run src/main/chat-windows.test.ts` e confirme que os 9 testes antigos ainda passam antes de seguir; se algum quebrar só por causa do foco, ajuste o teste chamando `created[0].blur()` onde o cenário exige janela fora de foco, sem mudar a intenção.

- [ ] **Step 2: Testes novos.** No fim do `describe('ChatWindows', ...)`:

```ts
  it('item recebido fora de foco marca o contato como não visto', () => {
    const { chats, unreadEvents } = setup();
    chats.receive('bbb', text('oi'));
    expect(chats.unreadIds()).toEqual(['bbb']);
    expect(unreadEvents).toEqual([['bbb', true]]);
  });

  it('item recebido com a conversa em foco não marca', () => {
    const { chats, unreadEvents } = setup();
    chats.open('bbb', true);
    chats.receive('bbb', text('oi'));
    expect(chats.unreadIds()).toEqual([]);
    expect(unreadEvents).toEqual([]);
  });

  it('focar a conversa limpa a marca; avisa só quando muda', () => {
    const { chats, created, unreadEvents } = setup();
    chats.receive('bbb', text('1'));
    chats.receive('bbb', text('2'));
    created[0].focus();
    created[0].focus();
    expect(chats.unreadIds()).toEqual([]);
    expect(unreadEvents).toEqual([
      ['bbb', true],
      ['bbb', false],
    ]);
  });

  it('fechar a conversa limpa a marca', () => {
    const { chats, created } = setup();
    chats.receive('bbb', text('oi'));
    created[0].close();
    expect(chats.unreadIds()).toEqual([]);
  });

  it('closeAll limpa as marcas sem avisar', () => {
    const { chats, unreadEvents } = setup();
    chats.receive('bbb', text('oi'));
    unreadEvents.length = 0;
    chats.closeAll();
    expect(chats.unreadIds()).toEqual([]);
    expect(unreadEvents).toEqual([]);
  });
```

- [ ] **Step 3:** `npx vitest run src/main/chat-windows.test.ts` → FAIL (`ChatWindowEvents`/`unreadIds` não existem).

- [ ] **Step 4: Implementar** em `src/main/chat-windows.ts`.

Troque o tipo da fábrica:

```ts
export interface ChatWindowEvents {
  onClosed(): void;
  /** A janela ganhou o foco (o usuário viu a conversa). */
  onFocused(): void;
}

export type CreateChatWindow = (peerId: string, events: ChatWindowEvents) => ChatWindowHandle;
```

Na classe, adicione o campo e o 4º parâmetro do construtor:

```ts
  private readonly unread = new Set<string>();

  constructor(
    private readonly create: CreateChatWindow,
    private readonly conversations: Conversations,
    private readonly isKnownPeer: (peerId: string) => boolean,
    /** Avisa a home para piscar (true) ou parar (false) o contato na lista. */
    private readonly onUnreadChanged: (peerId: string, unread: boolean) => void = () => undefined,
  ) {}
```

Em `open()`, a criação passa a ser:

```ts
      const created: ChatWindowHandle = this.create(peerId, {
        onClosed: () => {
          if (this.windows.get(peerId) === created) this.windows.delete(peerId);
          this.setUnread(peerId, false);
        },
        onFocused: () => this.setUnread(peerId, false),
      });
```

Em `receive()`, depois de `w?.send(IPC.chatItem, saved);`:

```ts
    // Fora de foco: pisca o contato na lista até a conversa ser vista.
    if (!w?.focused) this.setUnread(peerId, true);
```

Adicione os métodos:

```ts
  /** Contatos com item não visto (estado inicial da home). */
  unreadIds(): string[] {
    return [...this.unread];
  }

  private setUnread(peerId: string, unread: boolean) {
    if (this.unread.has(peerId) === unread) return;
    if (unread) this.unread.add(peerId);
    else this.unread.delete(peerId);
    this.onUnreadChanged(peerId, unread);
  }
```

Em `closeAll()`, antes do loop, adicione `this.unread.clear();` (limpa sem avisar: a home volta ao login).

- [ ] **Step 5:** `npx vitest run src/main/chat-windows.test.ts` → PASS (14 testes).
- [ ] **Step 6: Commit** `src/main/chat-windows.ts src/main/chat-windows.test.ts`, mensagem `Janelas: marca contato com mensagem não vista`.

---

### Task 3: Regra e som de nova mensagem

**Files:** Create `src/renderer/message-alert.ts`, `src/renderer/message-alert.test.ts`; Modify `src/renderer/sound.ts`

- [ ] **Step 1: Teste.** Crie `src/renderer/message-alert.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ConversationItem } from '../shared/api';
import { MIN_SOUND_GAP_MS, shouldPlayMessageSound } from './message-alert';

const text = (self: boolean): ConversationItem => ({
  seq: 1,
  at: 1000,
  kind: 'text',
  message: { from: self ? 'aaa' : 'bbb', fromName: 'X', text: 'oi', ts: 1, self },
});

const base = { item: text(false), fresh: true, focused: false, enabled: true, now: 10_000, lastPlayed: 0 };

describe('shouldPlayMessageSound', () => {
  it('toca para mensagem recebida nova com a conversa fora de foco', () => {
    expect(shouldPlayMessageSound(base)).toBe(true);
  });

  it('não toca com a conversa em foco, silenciado, item velho ou mensagem minha', () => {
    expect(shouldPlayMessageSound({ ...base, focused: true })).toBe(false);
    expect(shouldPlayMessageSound({ ...base, enabled: false })).toBe(false);
    expect(shouldPlayMessageSound({ ...base, fresh: false })).toBe(false);
    expect(shouldPlayMessageSound({ ...base, item: text(true) })).toBe(false);
  });

  it('toca para imagem e wink; não para nudge (tem som próprio) nem aviso do sistema', () => {
    const image: ConversationItem = {
      seq: 2,
      at: 1,
      kind: 'image',
      image: { from: 'bbb', fromName: 'X', name: 'a.png', mime: 'image/png', size: 1, ts: 1, self: false, data: new Uint8Array(1) },
    };
    const wink: ConversationItem = { seq: 3, at: 1, kind: 'wink', wink: { from: 'bbb', fromName: 'X', wink: 'fogos', ts: 1, self: false } };
    const nudge: ConversationItem = { seq: 4, at: 1, kind: 'nudge', nudge: { from: 'bbb', fromName: 'X', ts: 1, self: false } };
    const system: ConversationItem = { seq: 5, at: 1, kind: 'system', text: 'X saiu' };
    expect(shouldPlayMessageSound({ ...base, item: image })).toBe(true);
    expect(shouldPlayMessageSound({ ...base, item: wink })).toBe(true);
    expect(shouldPlayMessageSound({ ...base, item: nudge })).toBe(false);
    expect(shouldPlayMessageSound({ ...base, item: system })).toBe(false);
  });

  it('no máximo um som por intervalo', () => {
    expect(shouldPlayMessageSound({ ...base, lastPlayed: base.now - MIN_SOUND_GAP_MS + 1 })).toBe(false);
    expect(shouldPlayMessageSound({ ...base, lastPlayed: base.now - MIN_SOUND_GAP_MS })).toBe(true);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/renderer/message-alert.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Regra.** Crie `src/renderer/message-alert.ts`:

```ts
// Quando tocar o som de nova mensagem (issue #7): regra pura, testável sem navegador.
import type { ConversationItem } from '../shared/api';

/** Rajada de mensagens toca um som só. */
export const MIN_SOUND_GAP_MS = 1000;

export interface MessageSoundInput {
  item: ConversationItem;
  /** Item ao vivo, ou do histórico recente (foi ele que abriu a janela). */
  fresh: boolean;
  /** A janela da conversa está em foco. */
  focused: boolean;
  /** Opção "Sons de mensagem" ligada. */
  enabled: boolean;
  now: number;
  /** Quando tocou o último som (0 = nunca). */
  lastPlayed: number;
}

export function shouldPlayMessageSound(i: MessageSoundInput): boolean {
  if (!i.enabled || i.focused || !i.fresh) return false;
  if (i.now - i.lastPlayed < MIN_SOUND_GAP_MS) return false;
  const { item } = i;
  if (item.kind === 'text') return !item.message.self;
  if (item.kind === 'image') return !item.image.self;
  if (item.kind === 'wink') return !item.wink.self;
  return false; // nudge tem som próprio; aviso do sistema não toca
}
```

- [ ] **Step 4:** `npx vitest run src/renderer/message-alert.test.ts` → PASS.

- [ ] **Step 5: Som.** Em `src/renderer/sound.ts`:

1. Troque o comentário do topo por:

```ts
// Sons: "chamar atenção" e nova mensagem.
// Se existir um arquivo em public/sounds/ (nudge.* / message.*, em .wav, .mp3 ou .ogg), ele é tocado —
// é onde entram os sons originais do MSN, que não vêm com o projeto por serem da Microsoft.
// Sem arquivo, o som é sintetizado com Web Audio.
```

2. Substitua `CANDIDATES`, `fileUrl` e `findSoundFile` por uma busca por nome:

```ts
type SoundName = 'nudge' | 'message';

/** Por nome: undefined = ainda não procurou; null = nenhum arquivo encontrado. */
const fileUrls = new Map<SoundName, string | null>();
```

```ts
async function findSoundFile(name: SoundName): Promise<string | null> {
  const known = fileUrls.get(name);
  if (known !== undefined) return known;
  for (const ext of ['wav', 'mp3', 'ogg']) {
    const url = `sounds/${name}.${ext}`;
    if (await canLoad(url)) {
      fileUrls.set(name, url);
      return url;
    }
  }
  fileUrls.set(name, null);
  return null;
}

// Procura já na carga da página, para o primeiro som não atrasar.
void findSoundFile('nudge');
void findSoundFile('message');
```

(Remova a linha antiga `void findSoundFile();`.) Renomeie `playSynth` para `playNudgeSynth`.

3. Adicione a síntese do "plim" logo depois de `playNudgeSynth`:

```ts
/** "Plim" de nova mensagem: duas notas curtas subindo, com um brilho de harmônico. */
function playMessageSynth() {
  ctx ??= new AudioContext();
  const t = ctx.currentTime;
  const notes: Array<[number, number]> = [
    [880, 0], // lá
    [1318.5, 0.11], // mi, uma quinta acima
  ];
  for (const [freq, start] of notes) {
    for (const [mult, level] of [
      [1, 0.28],
      [2, 0.06],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t + start);
      env.gain.exponentialRampToValueAtTime(level, t + start + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t + start + 0.45);
      osc.connect(env).connect(ctx.destination);
      osc.start(t + start);
      osc.stop(t + start + 0.5);
    }
  }
}
```

4. Troque `playNudgeSound` por uma função comum e dois exports:

```ts
async function play(name: SoundName, synth: () => void) {
  try {
    const url = await findSoundFile(name);
    if (url) {
      const audio = new Audio(url);
      audio.volume = 0.9;
      await audio.play();
      return;
    }
  } catch {
    // arquivo não tocou: cai no som sintetizado
  }
  try {
    synth();
  } catch {
    // sem áudio disponível: segue em silêncio
  }
}

export const playNudgeSound = () => play('nudge', playNudgeSynth);
export const playMessageSound = () => play('message', playMessageSynth);
```

- [ ] **Step 6:** `npx vitest run src/renderer` → PASS; `npx tsc --noEmit 2>&1 | grep -E "sound.ts|message-alert"` → nada.
- [ ] **Step 7: Commit** `src/renderer/message-alert.ts src/renderer/message-alert.test.ts src/renderer/sound.ts`, mensagem `Som de nova mensagem e regra de quando tocar`.

---

### Task 4: API e processo principal

**Files:** Modify `src/shared/api.ts`, `src/preload.ts`, `src/main.ts`

- [ ] **Step 1: API.** Em `src/shared/api.ts`, na `ChatApi`, depois do bloco `// janelas de conversa` (depois de `onChatItem`), adicione:

```ts
  /** Contatos com mensagem não vista (piscam na lista). */
  getUnread(): Promise<string[]>;
  onUnreadChanged(cb: (change: { peerId: string; unread: boolean }) => void): Unsubscribe;

  // som de nova mensagem (menu ☰ da home)
  getSounds(): Promise<boolean>;
  setSounds(on: boolean): Promise<boolean>;
  onSoundsChanged(cb: (on: boolean) => void): Unsubscribe;
```

No objeto `IPC`, depois de `chatItem: 'chat:item',`:

```ts
  getUnread: 'chat:unread',
  unreadChanged: 'chat:unread-changed',
  getSounds: 'sound:get',
  setSounds: 'sound:set',
  soundsChanged: 'sound:changed',
```

- [ ] **Step 2: Preload.** Em `src/preload.ts`, depois de `onChatItem: ...`:

```ts
  getUnread: () => call(IPC.getUnread),
  onUnreadChanged: (cb) => subscribe(IPC.unreadChanged, cb),

  getSounds: () => call(IPC.getSounds),
  setSounds: (on) => call(IPC.setSounds, on),
  onSoundsChanged: (cb) => subscribe(IPC.soundsChanged, cb),
```

- [ ] **Step 3: Main.** Em `src/main.ts`:

1. `import { ChatWindows, type ChatWindowHandle } from './main/chat-windows';` → `import { ChatWindows, type ChatWindowEvents, type ChatWindowHandle } from './main/chat-windows';`
2. O valor inicial `let settings: Settings = { manualPeers: [], profile: null, font: null, giphyKey: null };` ganha `sounds: true`.
3. Em `registerIpc()`, logo depois do handler `IPC.getChatInit`:

```ts
  handle(IPC.getUnread, () => chats.unreadIds());
  handle(IPC.getSounds, () => settings.sounds);
  handle(IPC.setSounds, (on: unknown) => {
    if (typeof on !== 'boolean') throw new Error('Valor inválido');
    saveSettings({ ...settings, sounds: on });
    broadcast(IPC.soundsChanged, on);
    return on;
  });
```

4. `createChatWindow(peerId: string, onClosed: () => void)` → `createChatWindow(peerId: string, events: ChatWindowEvents)`; troque `w.on('closed', onClosed);` por:

```ts
  w.on('closed', events.onClosed);
  w.on('focus', events.onFocused);
```

5. Na criação do gerente em `app.on('ready')`, passe o 4º argumento:

```ts
  chats = new ChatWindows(
    createChatWindow,
    conversations,
    (id) => !!session?.peers.getPeers().some((p) => p.id === id),
    (peerId, unread) => sendToRenderer(IPC.unreadChanged, { peerId, unread }),
  );
```

- [ ] **Step 4:** `npx tsc --noEmit 2>&1 | grep -E "src/main.ts|src/preload.ts|src/shared"` → nada. `npx vitest run src/main` → PASS.
- [ ] **Step 5: Commit** `src/shared/api.ts src/preload.ts src/main.ts`, mensagem `Main: não vistas para a home e opção de som`.

---

### Task 5: Renderer — som na conversa, contato piscando, menu e padding

**Files:** Modify `src/renderer/chat-window.ts`, `src/renderer/home.ts`, `src/renderer/main-window.ts`, `src/index.css`

- [ ] **Step 1: Som na janela de conversa** (`src/renderer/chat-window.ts`).

Imports novos:

```ts
import { shouldPlayMessageSound } from './message-alert';
import { playMessageSound } from './sound';
```

Depois de `const REPLAY_MS = 10_000;`:

```ts
let soundsOn = true;
let lastSound = 0;

function maybePlaySound(item: ConversationItem, fresh: boolean) {
  const now = Date.now();
  if (!shouldPlayMessageSound({ item, fresh, focused: document.hasFocus(), enabled: soundsOn, now, lastPlayed: lastSound })) return;
  lastSound = now;
  void playMessageSound();
}
```

No fim de `render(item, live)` (depois do `switch`), adicione `maybePlaySound(item, fresh);`.

Em `startChatWindow`, logo depois de `chat().onPeerAvatar((a) => applyPeerAvatar(a));`:

```ts
  chat().onSoundsChanged((on) => {
    soundsOn = on;
  });
  soundsOn = await chat().getSounds();
```

- [ ] **Step 2: Contato piscando e menu** (`src/renderer/home.ts`).

Depois de `let selectedId: string | null = null;`:

```ts
/** Contatos com mensagem não vista: piscam em laranja, como no MSN. */
const unread = new Set<string>();
let soundsOn = true;

export function setUnread(peerId: string, isUnread: boolean) {
  if (isUnread) unread.add(peerId);
  else unread.delete(peerId);
  renderContacts();
}

export function setSoundsOn(on: boolean) {
  soundsOn = on;
}
```

Em `contactRow`, depois de `if (p.id === selectedId) li.classList.add('is-selected');`:

```ts
  if (unread.has(p.id)) li.classList.add('is-unread');
```

No menu ☰ (`els.menuBtn.addEventListener('click', ...)`), a lista de entradas passa a ser:

```ts
  openMenu(els.menuBtn, [
    { label: 'Adicionar contato por IP...', onSelect: () => void openAddDialog() },
    {
      label: `${soundsOn ? '✓ ' : ''}Sons de mensagem`,
      onSelect: () => void chat().setSounds(!soundsOn).then(setSoundsOn),
    },
    { label: 'Ajuda de rede', onSelect: () => handlers.help() },
    'separator',
    { label: 'Sair', onSelect: () => handlers.logout() },
  ]),
```

- [ ] **Step 3: Ligar na janela principal** (`src/renderer/main-window.ts`).

Troque `import { enterHome, initHome, renderSelf } from './home';` por `import { enterHome, initHome, renderSelf, setSoundsOn, setUnread } from './home';`.

Em `startMainWindow`, depois do `chat().onSelfChanged(...)`:

```ts
  chat().onUnreadChanged(({ peerId, unread }) => setUnread(peerId, unread));
  chat().onSoundsChanged(setSoundsOn);
  setSoundsOn(await chat().getSounds());
```

Em `afterLogin`, antes de `enterHome(self);`:

```ts
  for (const id of await chat().getUnread()) setUnread(id, true);
```

- [ ] **Step 4: CSS** (`src/index.css`).

Na regra `.conversation`, troque `padding: 8px 10px;` por:

```css
  /* Margem lateral que cresce com a janela: o conteúdo fica mais centralizado. */
  padding: 10px clamp(16px, 6vw, 56px);
```

Depois das regras de `.contact` (procure a última regra `.contact...`), adicione:

```css
/* Mensagem não vista: pisca em laranja, como a janela do MSN na barra de tarefas. */
.contact.is-unread {
  border-color: #e8a13a;
  animation: contact-unread 1s ease-in-out infinite alternate;
}

.contact.is-unread .contact-name {
  font-weight: 700;
}

@keyframes contact-unread {
  from {
    background: #fff4e0;
  }
  to {
    background: #ffc76b;
  }
}

@media (prefers-reduced-motion: reduce) {
  .contact.is-unread {
    animation: none;
    background: #ffd999;
  }
}
```

- [ ] **Step 5:** `npm run typecheck && npm run lint && npm test` → tudo passa.
- [ ] **Step 6: Commit** `src/renderer/chat-window.ts src/renderer/home.ts src/renderer/main-window.ts src/index.css`, mensagem `Som de nova mensagem, contato piscando e conversa centralizada` com as linhas `Refs #6, refs #7` antes do Co-Authored-By (as issues são fechadas à mão depois do teste).

---

### Task 6: Verificação manual e README

- [ ] **Step 1:** `npm run package`; abrir duas instâncias isoladas (`--user-data-dir` separados, `--port` 47811/47812, `--remote-debugging-port` 9231/9232) e logar como "Teste A" e "Teste B".
- [ ] **Step 2: Roteiro.**
  1. B com a conversa de A **minimizada**: A manda mensagem → contato "Teste A" pisca laranja na home de B; `flashFrame` chamado (Windows: botão laranja).
  2. B foca a conversa → contato para de piscar.
  3. Com a conversa em foco, nova mensagem não pisca o contato.
  4. B fecha a conversa com item não visto → contato para de piscar.
  5. Som: com a janela fora de foco, `playMessageSound` é chamado a cada mensagem (verificar por instrumentação/log via DevTools); com foco não; com "Sons de mensagem" desmarcado não; rajada de 3 mensagens seguidas toca uma vez.
  6. Menu ☰ mostra "✓ Sons de mensagem"; desmarcar reflete nas conversas abertas e sobrevive a reiniciar o app.
  7. Conversa com padding lateral maior (captura de tela).
- [ ] **Step 3: README.** Em "Conversas e bandeja", acrescente:

```markdown
- Mensagem nova com a conversa fora de foco: o botão da conversa pisca e fica laranja na barra de tarefas,
  o contato pisca na lista e toca um som. Para desligar o som, use **Sons de mensagem** no menu ☰.
- Para usar os sons originais do MSN, coloque `message.wav` (nova mensagem) e `nudge.wav` (chamar atenção)
  em `public/sounds/` antes de gerar o app.
```

- [ ] **Step 4: Commit** `README.md`, mensagem `README: notificações de nova mensagem`.
