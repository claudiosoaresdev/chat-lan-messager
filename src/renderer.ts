// Entrada do renderer: barra de título, navegação entre login → contatos → conversa
// e os eventos que chegam da rede. Sem acesso ao Node: tudo passa por window.chat.
import type { SelfInfo, UiImageMessage } from './shared/api';
import { $, chat } from './renderer/dom';
import { applyPeerAvatar, clearPeerAvatars, initAvatars, loadMyAvatar, loadPeerAvatars } from './renderer/avatar';
import { loadFont } from './renderer/font';
import { addImage, addNudge, addSystem, addText, addWink, clearChat, enterChat, initChat } from './renderer/chat';
import { winkInfo } from './renderer/winks';
import { enterHome, initHome, openAddDialog, setUnread } from './renderer/home';
import { initLogin, prepareLogin } from './renderer/login';
import { closeMenu } from './renderer/status';
import { resetSession, setPeers, showView, state, upsertPeer } from './renderer/state';
import { clearToasts, showToast } from './renderer/toast';
import { initUpdate } from './renderer/update';

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

// ---------------------------------------------------------------- navegação

function setUnreadCount(n: number) {
  state.unread = n;
  setUnread(n);
}

function openChat() {
  closeMenu();
  clearToasts();
  setUnreadCount(0);
  showView('chat');
  enterChat();
}

function openHome() {
  showView('home');
}

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
  clearChat();
  clearToasts();
  setUnreadCount(0);
  showView('login');
  await prepareLogin(false);
}

initLogin((self) => void afterLogin(self));
initHome({ openChat, logout: () => void logout(), help: openHelp });
initChat({ back: openHome, invite: () => void openAddDialog() });
initUpdate();

// ---------------------------------------------------------------- eventos da rede

chat().onPeer((peer) => {
  if (!state.self) return;
  const prev = upsertPeer(peer);
  if (!prev || prev.online !== peer.online) {
    addSystem(`${peer.name} ${peer.online ? 'entrou na conversa' : 'saiu'}`);
  }
});

chat().onMessage((msg) => {
  addText(msg);
  if (state.view !== 'chat') {
    setUnreadCount(state.unread + 1);
    showToast(msg.fromName, msg.text, openChat);
  }
});

chat().onPeerAvatar((avatar) => {
  if (state.self) applyPeerAvatar(avatar);
});

chat().onWink((wink) => {
  const inChat = state.view === 'chat';
  addWink(wink, inChat);
  if (!inChat) {
    setUnreadCount(state.unread + 1);
    showToast(wink.fromName, '', openChat, `${wink.fromName} enviou um wink: ${winkInfo(wink.wink).name}`);
  }
});

chat().onNudge((nudge) => {
  addNudge(nudge);
  if (state.view !== 'chat') {
    setUnreadCount(state.unread + 1);
    showToast(nudge.fromName, '', openChat, `${nudge.fromName} chamou a sua atenção!`);
  }
});

chat().onImage((img: UiImageMessage) => {
  addImage(img, new Blob([img.data as Uint8Array<ArrayBuffer>], { type: img.mime }));
  if (state.view !== 'chat') {
    setUnreadCount(state.unread + 1);
    showToast(img.fromName, `enviou uma imagem: ${img.name}`, openChat);
  }
});

// ---------------------------------------------------------------- início

initAvatars(() => state.self?.status ?? $('login-avatar').dataset.status ?? 'available');

(async () => {
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
})();
