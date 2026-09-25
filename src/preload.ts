// Expõe a API mínima `window.chat` para o renderer via contextBridge.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type ChatApi, type Unsubscribe } from './shared/api';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** O main responde { ok, value | error }; aqui vira promise normal que rejeita com a mensagem. */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res: Result<T> = await ipcRenderer.invoke(channel, ...args);
  // (sem strictNullChecks o TS não estreita pelo `ok`; `in` resolve)
  if ('error' in res) throw new Error(res.error);
  return res.value;
}

function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: ChatApi = {
  minimize: () => ipcRenderer.send(IPC.minimize),
  toggleMaximize: () => ipcRenderer.send(IPC.toggleMaximize),
  close: () => ipcRenderer.send(IPC.close),
  setLayout: (layout) => ipcRenderer.send(IPC.setLayout, layout),

  getLocalInfo: () => call(IPC.getLocalInfo),
  getSavedProfile: () => call(IPC.getSavedProfile),
  getSession: () => call(IPC.getSession),
  login: (req) => call(IPC.login, req),
  logout: () => call(IPC.logout),
  setPresence: (update) => call(IPC.setPresence, update),

  getAvatar: () => call(IPC.getAvatar),
  setAvatar: (data) => call(IPC.setAvatar, data),
  getAvatarLibrary: () => call(IPC.getAvatarLibrary),
  addAvatarUpload: (data) => call(IPC.addAvatarUpload, data),
  removeAvatarUpload: (id) => call(IPC.removeAvatarUpload, id),
  getPeerAvatars: () => call(IPC.getPeerAvatars),
  onPeerAvatar: (cb) => subscribe(IPC.peerAvatar, cb),

  getFont: () => call(IPC.getFont),
  setFont: (font) => call(IPC.setFont, font),

  hasGiphyKey: () => call(IPC.hasGiphyKey),
  setGiphyKey: (key) => call(IPC.setGiphyKey, key),
  giphySearch: (query, offset) => call(IPC.giphySearch, query, offset ?? 0),
  giphySend: (to, id) => call(IPC.giphySend, to, id),

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
  getUnread: () => call(IPC.getUnread),
  onUnreadChanged: (cb) => subscribe(IPC.unreadChanged, cb),

  getSounds: () => call(IPC.getSounds),
  setSounds: (on) => call(IPC.setSounds, on),
  onSoundsChanged: (cb) => subscribe(IPC.soundsChanged, cb),

  onSelfChanged: (cb) => subscribe(IPC.selfChanged, cb),
  onFontChanged: (cb) => subscribe(IPC.fontChanged, cb),
  onMyAvatarChanged: (cb) => subscribe(IPC.myAvatarChanged, cb),

  getUpdateStatus: () => call(IPC.getUpdateStatus),
  installUpdate: () => call(IPC.installUpdate),
  checkForUpdates: () => call(IPC.checkForUpdates),
  onUpdateStatus: (cb) => subscribe(IPC.updateStatus, cb),
};

contextBridge.exposeInMainWorld('chat', api);
