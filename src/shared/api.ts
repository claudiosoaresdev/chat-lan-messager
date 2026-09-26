// Tipos compartilhados entre main, preload e renderer (API window.chat).
import type { ImageMime, MessageFont, PresenceStatus, SceneMime, WinkId } from './protocol';
import type { Appearance } from './themes';

export type { Appearance, AppearanceMode } from './themes';
export type { SceneChoice } from './scenes';

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
  name?: string;
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
  /** Id da mensagem (a prévia do link se refere a ele); versões antigas não mandam. */
  id?: string;
}

/** Prévia de link (título, site, miniatura), montada por quem enviou a mensagem. */
export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  siteName?: string;
  /** Id do vídeo, se o link é do YouTube (vira player na conversa). */
  youtube?: string;
  image?: { mime: ImageMime; data: Uint8Array };
}

/** Prévia que chegou para a mensagem `ref` da conversa com `peerId`. */
export interface ChatPreview {
  peerId: string;
  ref: string;
  preview: LinkPreview;
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

/**
 * Um item da conversa com um contato, guardado pelo main durante a sessão.
 * `seq` cresce sempre (evita repetir itens); `at` é a hora local em que o item entrou.
 */
export type ConversationItem =
  | { seq: number; at: number; kind: 'text'; message: UiChatMessage; preview?: LinkPreview }
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

/** Cena anunciada a um contato ou recebida dele: da galeria, imagem (JPEG/PNG até 400 KB) ou nenhuma. */
export type SharedScene =
  | { kind: 'builtin'; id: string }
  | { kind: 'image'; mime: SceneMime; data: Uint8Array }
  | { kind: 'none' };

/** Cena de um contato (a que ele usa nas conversas). */
export interface PeerScene {
  id: string;
  scene: SharedScene;
}

/** Música tocando no Spotify ("O que estou ouvindo"). `artist` pode ser vazio (podcast, arquivo local). */
export interface Listening {
  artist: string;
  title: string;
}

/** O que um contato está ouvindo; null = nada (ou ele não compartilha). */
export interface PeerListening {
  id: string;
  listening: Listening | null;
}

/** Cena própria (JPEG 1600×900 até 400 KB) guardada em userData/scenes. */
export interface CustomScene {
  id: string;
  data: Uint8Array;
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

/** Face de uma fonte do Google pronta para registrar com FontFace. */
export interface FontFaceInfo {
  weight: number;
  style: 'normal' | 'italic';
  unicodeRange: string;
  url: string;
}

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
  /** Garante que a fonte do Google está no disco (baixa se preciso) e devolve as faces.
   * `auto`: pedido por causa de uma mensagem recebida (limitado a algumas famílias novas por hora). */
  ensureFont(family: string, auto?: boolean): Promise<FontFaceInfo[]>;

  // GIFs do GIPHY (opcional: precisa de internet e de uma chave de API)
  hasGiphyKey(): Promise<boolean>;
  setGiphyKey(key: string | null): Promise<void>;
  giphySearch(query: string, offset?: number): Promise<{ items: GiphyItem[]; next: number | null }>;
  /** Baixa o GIF e envia como imagem pela rede local; devolve os bytes para mostrar na sua conversa. */
  giphySend(to: string, id: string): Promise<{ meta: UiImageMeta; data: Uint8Array }>;

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
  /** Chegou a prévia do link de uma mensagem desta conversa (minha ou do contato). */
  onChatPreview(cb: (preview: ChatPreview) => void): Unsubscribe;
  /** Contatos com mensagem não vista (piscam na lista). */
  getUnread(): Promise<string[]>;
  /** Cena do contato (null = ele não mandou: versão antiga ou ainda conectando). */
  getPeerScene(peerId: string): Promise<PeerScene | null>;
  /** O contato desta janela trocou de cena. */
  onPeerScene(cb: (scene: PeerScene) => void): Unsubscribe;
  onUnreadChanged(cb: (change: { peerId: string; unread: boolean }) => void): Unsubscribe;

  // prévia dos links que eu envio (menu ☰ da home)
  getLinkPreviews(): Promise<boolean>;
  setLinkPreviews(on: boolean): Promise<boolean>;
  onLinkPreviewsChanged(cb: (on: boolean) => void): Unsubscribe;

  // "O que estou ouvindo" (Spotify)
  /** A minha música e a do contato (`peerId`), para o letreiro da conversa. */
  getListening(peerId?: string): Promise<{ mine: Listening | null; peer: Listening | null }>;
  onMyListening(cb: (listening: Listening | null) => void): Unsubscribe;
  /** O contato desta janela trocou de música. */
  onPeerListening(cb: (listening: PeerListening) => void): Unsubscribe;
  getShareListening(): Promise<boolean>;
  setShareListening(on: boolean): Promise<boolean>;
  onShareListeningChanged(cb: (on: boolean) => void): Unsubscribe;

  // som de nova mensagem (menu ☰ da home)
  getSounds(): Promise<boolean>;
  setSounds(on: boolean): Promise<boolean>;
  onSoundsChanged(cb: (on: boolean) => void): Unsubscribe;

  // aparência (modo claro/escuro e tema)
  getAppearance(): Promise<Appearance>;
  /** Salva, ajusta as janelas nativas e avisa todas as janelas. */
  /** OK da janela "Aparência": salva a aparência e, se vier, a fonte das mensagens (as duas ou nenhuma). */
  setAppearance(appearance: Appearance, font?: MessageFont): Promise<Appearance>;
  /**
   * Prévia ao vivo em todas as janelas, sem salvar (janela "Aparência"). `font`: fonte sugerida do tema,
   * também só em prévia. `null` volta à aparência e à fonte salvas.
   */
  previewAppearance(appearance: Appearance | null, font?: MessageFont): Promise<void>;
  /** Aparência mudou (salva ou em prévia). */
  onAppearanceChanged(cb: (appearance: Appearance) => void): Unsubscribe;
  /** Prévia da fonte (só visual, não muda a fonte de envio); null = fim da prévia. */
  onFontPreview(cb: (font: MessageFont | null) => void): Unsubscribe;

  // cenas próprias (imagens do usuário para o topo e o fundo das conversas)
  /** Mais recentes primeiro. */
  listCustomScenes(): Promise<CustomScene[]>;
  /** Guarda um JPEG (já recortado em 1600×900, até 400 KB); a mesma imagem não duplica. */
  addCustomScene(data: Uint8Array): Promise<{ id: string }>;
  /** Apaga; se era a cena em uso (ou em prévia), a aparência volta para a cena do tema. */
  removeCustomScene(id: string): Promise<void>;
  /** Bytes da imagem, ou null se ela não existe mais. */
  getCustomScene(id: string): Promise<Uint8Array | null>;

  // mudanças feitas em outra janela
  onSelfChanged(cb: (self: SelfInfo) => void): Unsubscribe;
  onFontChanged(cb: (font: MessageFont) => void): Unsubscribe;
  onMyAvatarChanged(cb: (avatar: AvatarImage | null) => void): Unsubscribe;

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
  ensureFont: 'font:ensure',
  hasGiphyKey: 'giphy:has-key',
  setGiphyKey: 'giphy:set-key',
  giphySearch: 'giphy:search',
  giphySend: 'giphy:send',
  getPeers: 'chat:get-peers',
  send: 'chat:send',
  sendImage: 'chat:send-image',
  sendNudge: 'chat:send-nudge',
  sendWink: 'chat:send-wink',
  connect: 'chat:connect',
  getSaved: 'chat:get-saved',
  forget: 'chat:forget',
  peer: 'chat:peer',
  openChat: 'chat:open',
  getChatInit: 'chat:init',
  chatItem: 'chat:item',
  getUnread: 'chat:unread',
  getPeerScene: 'scene:peer-get',
  peerScene: 'scene:peer',
  unreadChanged: 'chat:unread-changed',
  chatPreview: 'chat:preview',
  getLinkPreviews: 'preview:get',
  setLinkPreviews: 'preview:set',
  linkPreviewsChanged: 'preview:changed',
  getListening: 'listening:get',
  myListening: 'listening:mine',
  peerListening: 'listening:peer',
  getShareListening: 'listening:share-get',
  setShareListening: 'listening:share-set',
  shareListeningChanged: 'listening:share-changed',
  getSounds: 'sound:get',
  setSounds: 'sound:set',
  soundsChanged: 'sound:changed',
  getAppearance: 'appearance:get',
  setAppearance: 'appearance:set',
  previewAppearance: 'appearance:preview',
  appearanceChanged: 'appearance:changed',
  fontPreview: 'font:preview',
  listCustomScenes: 'scene:list',
  addCustomScene: 'scene:add',
  removeCustomScene: 'scene:remove',
  getCustomScene: 'scene:get',
  selfChanged: 'session:self-changed',
  fontChanged: 'font:changed',
  myAvatarChanged: 'avatar:mine-changed',
  getUpdateStatus: 'update:status',
  installUpdate: 'update:install',
  checkForUpdates: 'update:check',
  updateStatus: 'update:changed',
} as const;
