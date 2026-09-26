// Janela principal: login e lista de contatos. As conversas abrem em janelas próprias (chat-window.ts).
import type { SelfInfo } from '../shared/api';
import { $, chat } from './dom';
import { applyPeerAvatar, clearPeerAvatars, initAvatars, loadMyAvatar, loadPeerAvatars, watchMyAvatar } from './avatar';
import { loadFont, watchFontChanges } from './font';
import { enterHome, initHome, renderSelf, resetUnread, setLinkPreviews, setShareListening, setSoundsOn, setUnread } from './home';
import { initLogin, prepareLogin } from './login';
import { closeMenu } from './status';
import { resetSession, setPeers, showView, state, upsertPeer } from './state';
import { initUpdate } from './update';

async function afterLogin(self: SelfInfo) {
  state.self = self;
  setPeers(await chat().getPeers());
  await loadPeerAvatars();
  resetUnread(await chat().getUnread());
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
  chat().onUnreadChanged(({ peerId, unread }) => setUnread(peerId, unread));
  chat().onSoundsChanged(setSoundsOn);
  setSoundsOn(await chat().getSounds());
  chat().onShareListeningChanged(setShareListening);
  setShareListening(await chat().getShareListening());
  chat().onLinkPreviewsChanged(setLinkPreviews);
  setLinkPreviews(await chat().getLinkPreviews());

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
