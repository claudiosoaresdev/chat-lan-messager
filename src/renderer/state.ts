// Estado da sessão no renderer: eu, contatos e em qual tela estamos.
import type { PeerInfo, SelfInfo } from '../shared/api';
import { $, chat } from './dom';

export type ViewName = 'login' | 'home' | 'chat';

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

type Listener = () => void;
const viewListeners: Array<(v: ViewName) => void> = [];
const peerListeners: Listener[] = [];

export function onViewChange(fn: (v: ViewName) => void) {
  viewListeners.push(fn);
}

export function onPeersChange(fn: Listener) {
  peerListeners.push(fn);
}

export function showView(view: ViewName) {
  state.view = view;
  for (const name of ['login', 'home', 'chat'] as const) $(`view-${name}`).hidden = name !== view;
  $('titlebar-title').textContent = TITLES[view];
  // Como no Messenger: login e conversa em paisagem, lista de contatos em pé.
  chat().setLayout(view === 'home' ? 'app' : view);
  viewListeners.forEach((fn) => fn(view));
}

export function setPeers(list: PeerInfo[]) {
  state.peers = new Map(list.map((p) => [p.id, p]));
  peerListeners.forEach((fn) => fn());
}

/** Atualiza um contato; devolve a versão anterior (para detectar entrou/saiu). */
export function upsertPeer(peer: PeerInfo): PeerInfo | undefined {
  const prev = state.peers.get(peer.id);
  state.peers.set(peer.id, peer);
  peerListeners.forEach((fn) => fn());
  return prev;
}

export const onlinePeers = () =>
  [...state.peers.values()].filter((p) => p.online).sort((a, b) => a.name.localeCompare(b.name));

export function resetSession() {
  state.self = null;
  state.peers.clear();
  peerListeners.forEach((fn) => fn());
}
