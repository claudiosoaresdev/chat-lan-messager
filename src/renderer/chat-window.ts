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
