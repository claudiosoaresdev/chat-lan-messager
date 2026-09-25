// Janela de conversa com um contato, no formato do MSN: "Fulano diz:" e a mensagem recuada embaixo.
import type { PeerInfo, UiChatMessage, UiImageMeta, UiNudge, UiWink } from '../shared/api';
import type { PresenceStatus, WinkId } from '../shared/protocol';
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '../shared/protocol';
import { $, chat, el, errorMessage, timeFmt } from './dom';
import { onPeerAvatarsChange, paintAvatar, peerAvatarUrl } from './avatar';
import { buildEmoticonGrid, emoticonIcon, renderRichText } from './emoticons';
import { buildWinkGrid, playWink, winkInfo } from './winks';
import { initGiphy, onGifPickerOpened } from './giphy';
import { applyFont, onFontChange, openFontDialog } from './font';
import { playNudgeSound } from './sound';
import { state } from './state';
import { STATUS_LABEL } from './status';

const MAX_RENDERED_ITEMS = 300;
/** Mensagens seguidas do mesmo remetente dentro deste intervalo não repetem o "diz:". */
const GROUP_WINDOW_MS = 2 * 60 * 1000;

const els = {
  peerName: $('chat-peer-name'),
  peerStatus: $('chat-peer-status'),
  peerMessage: $('chat-peer-message'),
  peerAvatar: $('chat-peer-avatar'),
  sendBtn: $<HTMLButtonElement>('send-btn'),
  meAvatar: $('chat-me-avatar'),
  statusbar: $('chat-statusbar'),
  fmtImage: $<HTMLButtonElement>('fmt-image'),
  nudge: $<HTMLButtonElement>('chat-nudge'),
  fmtNudge: $<HTMLButtonElement>('fmt-nudge'),
  fmtFont: $<HTMLButtonElement>('fmt-font'),
  fmtEmoticon: $<HTMLButtonElement>('fmt-emoticon'),
  emoticonPicker: $('emoticon-picker'),
  emoticonGrid: $('emoticon-grid'),
  splitter: $('chat-splitter'),
  fmtWink: $<HTMLButtonElement>('fmt-wink'),
  fmtGif: $<HTMLButtonElement>('fmt-gif'),
  gifPicker: $('gif-picker'),
  winkPicker: $('wink-picker'),
  winkGrid: $('wink-grid'),
  main: document.querySelector<HTMLElement>('.chat-main') as HTMLElement,
  panel: document.querySelector<HTMLElement>('.chat-panel') as HTMLElement,
  fmtFontBar: $('fmt-font-bar'),
  window: document.querySelector<HTMLElement>('.window') as HTMLElement,
  messages: $<HTMLOListElement>('messages'),
  composer: $<HTMLFormElement>('composer'),
  text: $<HTMLTextAreaElement>('text-input'),
  file: $<HTMLInputElement>('file-input'),
  error: $('composer-error'),
  dropOverlay: $('drop-overlay'),
};

const TEXT_PLACEHOLDER = els.text.placeholder;

/** Contato desta janela; erro se a janela não é de conversa. */
function to(): string {
  if (!state.peerId) throw new Error('Conversa sem contato');
  return state.peerId;
}

let last: { from: string; ts: number } | null = null;
let peer: PeerInfo | null = null;

const dateFmt = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Barra de status embaixo, como no Messenger: "Última mensagem recebida em … às …". */
function noteReceived(ts: number) {
  els.statusbar.textContent = `Última mensagem recebida em ${dateFmt.format(ts)} às ${timeFmt.format(ts)}.`;
}

// ---------------------------------------------------------------- render

function isNearBottom() {
  const m = els.messages;
  return m.scrollHeight - m.scrollTop - m.clientHeight < 80;
}

function append(li: HTMLLIElement, forceScroll = false) {
  const stick = forceScroll || isNearBottom();
  els.messages.append(li);
  // Limite de itens na tela; libera os blob: URLs das imagens removidas.
  while (els.messages.children.length > MAX_RENDERED_ITEMS) {
    const first = els.messages.firstElementChild as HTMLElement;
    first.querySelectorAll('img').forEach((img) => URL.revokeObjectURL(img.src));
    first.remove();
  }
  if (stick) els.messages.scrollTop = els.messages.scrollHeight;
}

/** Bloco "Fulano diz:" — reaproveita o anterior se for a mesma pessoa logo em seguida. */
function saidBlock(from: string, fromName: string, ts: number, self: boolean): HTMLLIElement {
  const prev = els.messages.lastElementChild as HTMLLIElement | null;
  if (last && last.from === from && ts - last.ts < GROUP_WINDOW_MS && prev?.classList.contains('said')) {
    last.ts = ts;
    return prev;
  }
  last = { from, ts };
  const li = el('li', `said ${self ? 'mine' : 'theirs'}`);
  const by = el('div', 'said-by', `${self ? state.self?.name ?? 'Você' : fromName} diz:`);
  by.title = timeFmt.format(ts);
  li.append(by);
  return li;
}

export function addText(msg: UiChatMessage) {
  if (!msg.self) noteReceived(msg.ts);
  const li = saidBlock(msg.from, msg.fromName, msg.ts, msg.self);
  const line = el('div', 'said-line');
  // Atalhos como :) e (Y) viram emoticons (só nós de texto e ícones, nunca HTML).
  renderRichText(line, msg.text);
  line.title = timeFmt.format(msg.ts);
  // Cada um vê a mensagem na fonte de quem enviou, como no MSN.
  applyFont(line, msg.font);
  li.append(line);
  append(li, msg.self);
}

export function addImage(meta: Pick<UiImageMeta, 'from' | 'fromName' | 'ts' | 'self' | 'name' | 'mime'>, blob: Blob) {
  if (!meta.self) noteReceived(meta.ts);
  const li = saidBlock(meta.from, meta.fromName, meta.ts, meta.self);
  const url = URL.createObjectURL(blob);
  // GIFs (inclusive os do GIPHY) aparecem menores que fotos, como figurinhas na conversa.
  const img = el('img', meta.mime === 'image/gif' ? 'said-image is-gif' : 'said-image');
  img.alt = meta.name;
  img.title = `${meta.name} · ${timeFmt.format(meta.ts)}`;
  img.src = url;
  img.addEventListener('load', () => {
    if (meta.self || isNearBottom()) els.messages.scrollTop = els.messages.scrollHeight;
  });
  img.addEventListener('error', () => {
    URL.revokeObjectURL(url);
    img.replaceWith(el('div', 'said-line image-error', `Não foi possível exibir “${meta.name}”`));
  });
  li.append(img);
  append(li, meta.self);
}

/** Treme o conteúdo da janela (vale também com a janela maximizada) e toca o som. */
function shake() {
  void playNudgeSound();
  els.window.classList.remove('is-shaking');
  void els.window.offsetWidth; // reinicia a animação
  els.window.classList.add('is-shaking');
}

els.window.addEventListener('animationend', () => els.window.classList.remove('is-shaking'));

/** `shakeNow: false` ao reler o histórico: só registra, sem tremer nem tocar o som. */
export function addNudge(n: UiNudge, shakeNow = true) {
  if (!n.self) noteReceived(n.ts);
  last = null;
  const li = el('li', 'nudge-line', n.self ? 'Você chamou a atenção.' : `${n.fromName} chamou a sua atenção!`);
  li.title = timeFmt.format(n.ts);
  append(li, true);
  if (shakeNow) shake();
}

async function sendNudge() {
  try {
    addNudge(await chat().nudge(to()));
  } catch (err) {
    showError(errorMessage(err));
  }
}

export function addSystem(text: string) {
  last = null;
  append(el('li', 'system', text));
}

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
  els.fmtImage.disabled = !p.online;
  els.fmtWink.disabled = !p.online;
  els.fmtGif.disabled = !p.online;
  els.file.disabled = !p.online;
  els.text.placeholder = p.online ? TEXT_PLACEHOLDER : `${p.name} está offline.`;
}

onPeerAvatarsChange(() => {
  if (peer) paintAvatar(els.peerAvatar, peerAvatarUrl(peer.id));
});

// ---------------------------------------------------------------- envio

function showError(msg: string) {
  els.error.textContent = msg;
  window.setTimeout(() => {
    if (els.error.textContent === msg) els.error.textContent = '';
  }, 4000);
}

async function sendText() {
  const text = els.text.value.trim();
  if (!text) return;
  try {
    const msg = await chat().send(to(), text);
    els.text.value = '';
    addText(msg);
  } catch (err) {
    showError(errorMessage(err));
  }
}

async function sendFile(file: File) {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    showError('Formato não suportado (use PNG, JPEG, WebP ou GIF)');
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    showError('Imagem maior que 10 MB');
    return;
  }
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const meta = await chat().sendImage(to(), { name: file.name, data });
    addImage(meta, new Blob([data], { type: meta.mime }));
  } catch (err) {
    showError(errorMessage(err));
  }
}

els.composer.addEventListener('submit', (e) => {
  e.preventDefault();
  void sendText();
});

// Enter envia; Shift+Enter quebra linha.
els.text.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    void sendText();
  }
});

els.text.addEventListener('paste', (e) => {
  const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
  if (file) {
    e.preventDefault();
    void sendFile(file);
  }
});

els.file.addEventListener('change', () => {
  const file = els.file.files?.[0];
  els.file.value = '';
  if (file) void sendFile(file);
});

// Arrastar e soltar imagens (só na tela da conversa).
let dragDepth = 0;
const acceptsDrop = (e: DragEvent) => state.view === 'chat' && !!e.dataTransfer?.types.includes('Files');

window.addEventListener('dragenter', (e) => {
  if (!acceptsDrop(e)) return;
  dragDepth++;
  els.dropOverlay.hidden = false;
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) els.dropOverlay.hidden = true;
});
// Sempre impede o comportamento padrão para o arquivo não "abrir" na janela.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  els.dropOverlay.hidden = true;
  if (state.view !== 'chat') return;
  [...(e.dataTransfer?.files ?? [])].forEach((f) => void sendFile(f));
});

els.fmtImage.addEventListener('click', () => els.file.click());
els.nudge.addEventListener('click', () => void sendNudge());
els.fmtNudge.addEventListener('click', () => void sendNudge());
els.fmtFont.addEventListener('click', () => openFontDialog());

// A caixa de escrever mostra a fonte escolhida; a barrinha do "A" mostra a cor.
onFontChange((font) => {
  applyFont(els.text, font);
  els.fmtFontBar.style.backgroundColor = font.color;
});

// ---------------------------------------------------------------- winks

export function addWink(w: UiWink, play: boolean) {
  if (!w.self) noteReceived(w.ts);
  last = null;
  const info = winkInfo(w.wink);
  const li = el('li', 'wink-line');
  li.title = timeFmt.format(w.ts);
  li.append(emoticonIcon(info.icon, info.name), el('span', '', w.self ? `Você enviou um wink: ${info.name}` : `${w.fromName} enviou um wink: ${info.name}`));
  const replay = el('button', 'link wink-replay', 'Ver de novo');
  replay.type = 'button';
  replay.addEventListener('click', () => playWink(w.wink, els.main));
  li.append(replay);
  append(li, true);
  if (play) playWink(w.wink, els.main);
}

async function sendWink(id: WinkId) {
  closePickers();
  try {
    addWink(await chat().sendWink(to(), id), true);
  } catch (err) {
    showError(errorMessage(err));
  }
}

buildWinkGrid(els.winkGrid, (id) => void sendWink(id));

// GIF escolhido no GIPHY: já foi enviado pelo processo principal; aqui só aparece na conversa.
initGiphy({
  sent: (meta, data) => addImage(meta, new Blob([data as Uint8Array<ArrayBuffer>], { type: meta.mime })),
  close: () => closePickers(),
  to,
});

// ---------------------------------------------------------------- emoticons e grades suspensas

const pickers: Array<[HTMLButtonElement, HTMLElement, (() => void)?]> = [
  [els.fmtEmoticon, els.emoticonPicker],
  [els.fmtWink, els.winkPicker],
  [els.fmtGif, els.gifPicker, () => void onGifPickerOpened()],
];

function closePickers() {
  for (const [button, popup] of pickers) {
    popup.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }
}

for (const [button, popup, onOpen] of pickers) {
  button.addEventListener('click', () => {
    const open = popup.hidden;
    closePickers();
    popup.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (!open) return;
    if (onOpen) onOpen();
    else popup.querySelector('button')?.focus();
  });
  popup.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePickers();
      els.text.focus();
    }
  });
}

document.addEventListener('mousedown', (e) => {
  const target = e.target as Node;
  if (pickers.some(([button, popup]) => !popup.hidden && (popup.contains(target) || button.contains(target)))) return;
  closePickers();
});

/** Insere o atalho na posição do cursor, com espaços em volta quando precisa. */
function insertAtCursor(code: string) {
  const t = els.text;
  const start = t.selectionStart ?? t.value.length;
  const end = t.selectionEnd ?? t.value.length;
  const before = t.value.slice(0, start);
  const after = t.value.slice(end);
  const insert = `${before && !/\s$/.test(before) ? ' ' : ''}${code}${after.startsWith(' ') ? '' : ' '}`;
  t.value = before + insert + after;
  const pos = before.length + insert.length;
  t.setSelectionRange(pos, pos);
  t.focus();
}

buildEmoticonGrid(els.emoticonGrid, (code) => {
  insertAtCursor(code);
  closePickers();
});


// ---------------------------------------------------------------- divisor conversa × caixa de texto

const COMPOSE_DEFAULT = 58;
const COMPOSE_MIN = 36;
/** Espaço mínimo que a conversa mantém acima do divisor. */
const CHAT_MIN = 90;
const COMPOSE_KEY = 'chatlan:compose-height';

function maxComposeHeight() {
  // Altura do painel menos a conversa mínima, o divisor, a barra de formatação e margens.
  return Math.max(COMPOSE_MIN, els.panel.clientHeight - CHAT_MIN - 60);
}

function setComposeHeight(px: number, save = true) {
  const h = Math.round(Math.min(maxComposeHeight(), Math.max(COMPOSE_MIN, px)));
  els.text.style.height = `${h}px`;
  els.splitter.setAttribute('aria-valuenow', String(h));
  if (save) {
    try {
      localStorage.setItem(COMPOSE_KEY, String(h));
    } catch {
      // sem armazenamento: vale só nesta sessão
    }
  }
}

function restoreComposeHeight() {
  let saved = COMPOSE_DEFAULT;
  try {
    saved = Number(localStorage.getItem(COMPOSE_KEY)) || COMPOSE_DEFAULT;
  } catch {
    // usa o padrão
  }
  setComposeHeight(saved, false);
}

els.splitter.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  els.splitter.setPointerCapture(e.pointerId);
  const startY = e.clientY;
  const startH = els.text.getBoundingClientRect().height;
  const stick = isNearBottom();
  document.body.classList.add('is-resizing');

  const onMove = (ev: PointerEvent) => {
    // Arrastar para cima aumenta a caixa de texto; para baixo, a conversa.
    setComposeHeight(startH + (startY - ev.clientY), false);
    if (stick) els.messages.scrollTop = els.messages.scrollHeight;
  };
  const onUp = () => {
    els.splitter.removeEventListener('pointermove', onMove);
    els.splitter.removeEventListener('pointerup', onUp);
    els.splitter.removeEventListener('pointercancel', onUp);
    document.body.classList.remove('is-resizing');
    setComposeHeight(els.text.getBoundingClientRect().height);
  };
  els.splitter.addEventListener('pointermove', onMove);
  els.splitter.addEventListener('pointerup', onUp);
  els.splitter.addEventListener('pointercancel', onUp);
});

els.splitter.addEventListener('dblclick', () => setComposeHeight(COMPOSE_DEFAULT));
els.splitter.addEventListener('keydown', (e) => {
  const h = els.text.getBoundingClientRect().height;
  if (e.key === 'ArrowUp') setComposeHeight(h + 12);
  else if (e.key === 'ArrowDown') setComposeHeight(h - 12);
  else return;
  e.preventDefault();
});

// Janela menor: não deixa a caixa de texto engolir a conversa.
window.addEventListener('resize', () => {
  if (els.text.getBoundingClientRect().height > maxComposeHeight()) setComposeHeight(maxComposeHeight(), false);
});

// ---------------------------------------------------------------- init

/** Cor do status na minha imagem de exibição (muda quando troco o status na janela principal). */
export function setSelfStatus(status: PresenceStatus) {
  els.meAvatar.dataset.status = status;
}

export function enterChat() {
  restoreComposeHeight();
  setSelfStatus(state.self?.status ?? 'available');
  els.messages.scrollTop = els.messages.scrollHeight;
  if (!els.text.disabled) els.text.focus();
}
