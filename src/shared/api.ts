// Tipos compartilhados entre main, preload e renderer (API window.chat).
import type { ImageMime, MessageFont, PresenceStatus, WinkId } from './protocol';

/** Informações da máquina, disponíveis antes do login. */
export interface LocalInfo {
  computerName: string;
  addresses: string[];
  defaultPort: number;
}

/** Perfil salvo para preencher a tela de login. */
export interface SavedProfile {
  name: string;
  status: PresenceStatus;
  message: string;
  port: number;
  connectTo: string;
  remember: boolean;
  autoLogin: boolean;
}

export interface LoginRequest {
  name: string;
  status: PresenceStatus;
  /** Porta do servidor local. */
  port: number;
  /** "IP:porta" opcional para conectar logo ao entrar. */
  connectTo: string;
  remember: boolean;
  autoLogin: boolean;
}

export interface SelfInfo {
  id: string;
  name: string;
  status: PresenceStatus;
  message: string;
  port: number;
  addresses: string[];
}

export interface PeerInfo {
  id: string;
  name: string;
  status: PresenceStatus;
  message: string;
  address: string;
  online: boolean;
}

export interface PresenceUpdate {
  status?: PresenceStatus;
  message?: string;
}

export interface UiChatMessage {
  from: string;
  fromName: string;
  text: string;
  ts: number;
  self: boolean;
  font?: MessageFont;
}

export interface UiNudge {
  from: string;
  fromName: string;
  ts: number;
  self: boolean;
}

export interface UiWink {
  from: string;
  fromName: string;
  wink: WinkId;
  ts: number;
  self: boolean;
}

export interface UiImageMeta {
  from: string;
  fromName: string;
  name: string;
  mime: ImageMime;
  size: number;
  ts: number;
  self: boolean;
}

export interface UiImageMessage extends UiImageMeta {
  data: Uint8Array;
}

/** Imagem de exibição (bytes + tipo). */
export interface AvatarImage {
  mime: string;
  data: Uint8Array;
}

/** Item da grade "Imagem de exibição": padrão (public/avatars) ou enviada por você. */
export interface LibraryAvatar extends AvatarImage {
  id: string;
  name: string;
  kind: 'builtin' | 'upload';
}

/** Imagem de exibição de um contato; `data` null = o contato removeu a imagem. */
export interface PeerAvatar {
  id: string;
  mime: ImageMime | null;
  data: Uint8Array | null;
}

/** Resultado da busca no GIPHY, com a prévia já baixada pelo processo principal. */
export interface GiphyItem {
  id: string;
  title: string;
  data: Uint8Array;
}

export interface SavedPeer {
  host: string;
  port: number;
}

export interface OutgoingImage {
  name: string;
  data: Uint8Array;
}

export type Unsubscribe = () => void;

export type WindowLayout = 'login' | 'app' | 'chat';

/** Estado da atualização automática (só no app instalado no Windows). */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'downloading' }
  | { state: 'ready'; version: string | null }
  | { state: 'installing' }
  | { state: 'error'; message: string };

export interface ChatApi {
  // janela (sem moldura nativa: a barra de título é desenhada pela interface)
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
  /** Tamanho da janela: 'login' e 'chat' (paisagem) ou 'app' (em pé, lista de contatos). */
  setLayout(layout: WindowLayout): void;

  // sessão
  getLocalInfo(): Promise<LocalInfo>;
  getSavedProfile(): Promise<SavedProfile | null>;
  /** Sessão ativa (ex.: depois de recarregar a janela) ou null. */
  getSession(): Promise<SelfInfo | null>;
  login(req: LoginRequest): Promise<SelfInfo>;
  logout(): Promise<void>;
  setPresence(update: PresenceUpdate): Promise<SelfInfo>;

  // imagem de exibição
  getAvatar(): Promise<AvatarImage | null>;
  /** Define (PNG/JPEG/WebP/GIF até 256 KB) ou remove (null) a sua imagem; avisa os contatos. */
  setAvatar(data: Uint8Array | null): Promise<void>;
  getAvatarLibrary(): Promise<LibraryAvatar[]>;
  addAvatarUpload(data: Uint8Array): Promise<LibraryAvatar>;
  removeAvatarUpload(id: string): Promise<void>;
  getPeerAvatars(): Promise<PeerAvatar[]>;
  onPeerAvatar(cb: (avatar: PeerAvatar) => void): Unsubscribe;

  // fonte das mensagens ("Alterar fonte")
  getFont(): Promise<MessageFont>;
  setFont(font: MessageFont): Promise<MessageFont>;

  // GIFs do GIPHY (opcional: precisa de internet e de uma chave de API)
  hasGiphyKey(): Promise<boolean>;
  setGiphyKey(key: string | null): Promise<void>;
  giphySearch(query: string, offset?: number): Promise<{ items: GiphyItem[]; next: number | null }>;
  /** Baixa o GIF e envia como imagem pela rede local; devolve os bytes para mostrar na sua conversa. */
  giphySend(id: string): Promise<{ meta: UiImageMeta; data: Uint8Array }>;

  // contatos e mensagens
  getPeers(): Promise<PeerInfo[]>;
  send(text: string): Promise<UiChatMessage>;
  sendImage(image: OutgoingImage): Promise<UiImageMeta>;
  /** Chamar atenção de todos na conversa (a janela deles treme). */
  nudge(): Promise<UiNudge>;
  /** Envia um wink (animação) para todos na conversa. */
  sendWink(wink: WinkId): Promise<UiWink>;
  connect(host: string, port: number): Promise<void>;
  getSaved(): Promise<SavedPeer[]>;
  forget(host: string, port: number): Promise<SavedPeer[]>;
  onMessage(cb: (msg: UiChatMessage) => void): Unsubscribe;
  onImage(cb: (img: UiImageMessage) => void): Unsubscribe;
  onPeer(cb: (peer: PeerInfo) => void): Unsubscribe;
  onNudge(cb: (nudge: UiNudge) => void): Unsubscribe;
  onWink(cb: (wink: UiWink) => void): Unsubscribe;

  // atualização automática
  getUpdateStatus(): Promise<UpdateStatus>;
  /** Fecha o app e abre a versão nova já baixada. */
  installUpdate(): Promise<void>;
  /** Procura versão nova de novo (depois de uma falha). */
  checkForUpdates(): Promise<void>;
  onUpdateStatus(cb: (status: UpdateStatus) => void): Unsubscribe;
}

export const IPC = {
  minimize: 'win:minimize',
  toggleMaximize: 'win:toggle-maximize',
  close: 'win:close',
  setLayout: 'win:layout',
  getLocalInfo: 'session:local-info',
  getSavedProfile: 'session:saved-profile',
  getSession: 'session:get',
  login: 'session:login',
  logout: 'session:logout',
  setPresence: 'session:presence',
  getAvatar: 'avatar:get',
  setAvatar: 'avatar:set',
  getAvatarLibrary: 'avatar:library',
  addAvatarUpload: 'avatar:upload',
  removeAvatarUpload: 'avatar:remove-upload',
  getPeerAvatars: 'avatar:peers',
  peerAvatar: 'avatar:peer',
  getFont: 'font:get',
  setFont: 'font:set',
  hasGiphyKey: 'giphy:has-key',
  setGiphyKey: 'giphy:set-key',
  giphySearch: 'giphy:search',
  giphySend: 'giphy:send',
  getPeers: 'chat:get-peers',
  send: 'chat:send',
  sendImage: 'chat:send-image',
  sendNudge: 'chat:send-nudge',
  sendWink: 'chat:send-wink',
  wink: 'chat:wink',
  nudge: 'chat:nudge',
  connect: 'chat:connect',
  getSaved: 'chat:get-saved',
  forget: 'chat:forget',
  message: 'chat:message',
  image: 'chat:image',
  peer: 'chat:peer',
  getUpdateStatus: 'update:status',
  installUpdate: 'update:install',
  checkForUpdates: 'update:check',
  updateStatus: 'update:changed',
} as const;
