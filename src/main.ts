import { app, autoUpdater, BrowserWindow, ipcMain, Notification, screen, shell, type IpcMainInvokeEvent, type Tray } from 'electron';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { PeerManager, SELF_CONNECTION } from './main/peer-manager';
import { Discovery } from './main/discovery';
import { AvatarStore } from './main/avatar-store';
import { GiphyClient, isGiphyKey } from './main/giphy';
import { Updater, feedUrl } from './main/updater';
import { Conversations } from './main/conversations';
import { ChatWindows, type ChatWindowHandle } from './main/chat-windows';
import { createTray } from './main/tray';
import { trayTooltip } from './main/tray-text';
import {
  DEFAULT_PORT,
  SettingsStore,
  parseArgs,
  parseHostPort,
  rememberPeer,
  sameTarget,
  type HostPort,
  type Settings,
} from './main/config';
import {
  IPC,
  type ChatInit,
  type LocalInfo,
  type LoginRequest,
  type OutgoingImage,
  type PresenceUpdate,
  type SavedProfile,
  type SelfInfo,
  type WindowLayout,
} from './shared/api';
import {
  DEFAULT_FONT,
  MAX_NAME_LENGTH,
  MAX_PERSONAL_MESSAGE_LENGTH,
  isPresenceStatus,
  isWinkId,
  validateFont,
} from './shared/protocol';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const localId = randomUUID();

function computerName(): string {
  // No Mac o hostname pode vir com sufixo de conflito ("-5"); o ComputerName é o nome amigável.
  if (process.platform === 'darwin') {
    try {
      const name = execFileSync('scutil', ['--get', 'ComputerName'], { encoding: 'utf8', timeout: 1000 }).trim();
      if (name) return name;
    } catch {
      // cai no hostname
    }
  }
  return os.hostname().replace(/\.local$/i, '') || 'Computador';
}

const localName = computerName().slice(0, MAX_NAME_LENGTH);
const launch = parseArgs(process.argv);

interface Session {
  peers: PeerManager;
  discovery: Discovery;
}

let session: Session | null = null;
let store: SettingsStore;
let avatars: AvatarStore;
let settings: Settings = { manualPeers: [], profile: null, font: null, giphyKey: null };
const giphy = new GiphyClient(() => settings.giphyKey);
let mainWindow: BrowserWindow | null = null;
let updater: Updater | null = null;
const conversations = new Conversations();
let chats: ChatWindows;
let tray: Tray | null = null;
/** Saindo de verdade: o "X" da home para de esconder na bandeja. */
let quitting = false;
let trayHintShown = false;

function localAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

function isSelfTarget(t: HostPort, port = session?.peers.port): boolean {
  return t.port === port && (LOOPBACK.has(t.host) || localAddresses().includes(t.host));
}

function sendToRenderer(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

/** Para todas as janelas (home e conversas): mudanças de perfil, fonte e avatares. */
function broadcast(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
}

function refreshTray() {
  const self = session ? { name: session.peers.name, status: session.peers.status } : null;
  tray?.setToolTip(trayTooltip(self, updater?.getStatus().state === 'ready'));
}

function saveSettings(next: Settings) {
  settings = next;
  store.save(settings);
}

function requireSession(): Session {
  if (!session) throw new Error('Você não está conectado. Entre novamente.');
  return session;
}

function selfInfo(s: Session): SelfInfo {
  return {
    id: localId,
    name: s.peers.name,
    status: s.peers.status,
    message: s.peers.message,
    port: s.peers.port,
    addresses: localAddresses(),
  };
}

/** Referência às notificações abertas: sem isso o GC pode levar o clique embora. */
const openNotifications = new Set<Notification>();

/** Notificação do sistema quando a conversa do contato não está em foco; o clique traz a conversa. */
function notifyChat(peerId: string, title: string, body: string) {
  if (chats.get(peerId)?.focused || !Notification.isSupported()) return;
  const n = new Notification({ title, body: body.slice(0, 200), silent: false });
  openNotifications.add(n);
  const release = () => openNotifications.delete(n);
  n.on('close', release);
  n.on('click', () => {
    release();
    chats.open(peerId, true);
  });
  n.show();
}

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

/** Conecta a um alvo manual e lembra dele para reconectar depois. Retorna a mensagem de erro, se houver. */
async function connectAndRemember(s: Session, target: HostPort): Promise<string | null> {
  if (isSelfTarget(target)) return 'Esse é o endereço deste próprio computador. Use o IP que aparece no outro.';
  try {
    await s.peers.connect(target.host, target.port);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === SELF_CONNECTION) return (err as Error).message;
    // Falhou agora, mas continua sendo rediscado e fica salvo para a próxima vez.
    saveSettings({ ...settings, manualPeers: rememberPeer(settings.manualPeers, target) });
    return (err as Error).message;
  }
  saveSettings({ ...settings, manualPeers: rememberPeer(settings.manualPeers, target) });
  return null;
}

async function login(req: LoginRequest): Promise<SelfInfo> {
  if (session) return selfInfo(session);

  const name = (typeof req.name === 'string' ? req.name.trim() : '').slice(0, MAX_NAME_LENGTH) || localName;
  const status = isPresenceStatus(req.status) ? req.status : 'available';
  const requestedPort = launch.port ?? Number(req.port);
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) throw new Error('Porta inválida');

  const connectTo = typeof req.connectTo === 'string' ? req.connectTo.trim() : '';
  const target = connectTo ? parseHostPort(connectTo) : null;
  if (connectTo && !target) throw new Error('Endereço para conectar inválido. Use o formato 192.168.0.10:47800');

  const message = settings.profile?.message ?? '';
  const peers = new PeerManager({
    id: localId,
    name,
    status,
    message,
    avatar: avatars.getCurrent()?.data ?? null,
    port: requestedPort,
    // Só a porta padrão cai para dinâmica; porta escolhida à mão falha de forma visível.
    fallbackToRandomPort: launch.port === undefined && requestedPort === DEFAULT_PORT,
  });

  let port: number;
  try {
    port = await peers.start();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new Error(
      code === 'EADDRINUSE'
        ? `A porta ${requestedPort} já está em uso. Escolha outra em Opções.`
        : `Não foi possível abrir a porta ${requestedPort}: ${(err as Error).message}`,
    );
  }
  console.log(`[chat-lan] ${name} (${localId}) ouvindo na porta ${port}`);

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

  const discovery = new Discovery({
    id: localId,
    name,
    port,
    onUp: (remoteId, host, remotePort) => peers.discovered(remoteId, host, remotePort),
    onDown: (remoteId) => peers.lost(remoteId),
  });
  discovery.start();
  session = { peers, discovery };

  const profile: SavedProfile = {
    name,
    status,
    message,
    port: requestedPort,
    connectTo,
    remember: req.remember === true,
    autoLogin: req.remember === true && req.autoLogin === true,
  };
  const manualPeers = settings.manualPeers.filter((t) => !isSelfTarget(t, port));
  saveSettings({ ...settings, manualPeers, profile: profile.remember ? profile : null });

  // O IP informado no login fica salvo; os de --connect e os já salvos só reconectam.
  if (target) void connectAndRemember(session, target);
  const others = [...launch.connect, ...manualPeers].filter((t) => !target || !sameTarget(t, target));
  others
    .filter((t, i) => !isSelfTarget(t, port) && others.findIndex((o) => sameTarget(o, t)) === i)
    .forEach((t) => peers.connect(t.host, t.port).catch((): void => undefined));

  refreshTray();
  return selfInfo(session);
}

async function logout() {
  // `?.`: o app pode sair antes do 'ready' (instalação do Squirrel), com `chats` ainda não criado.
  chats?.closeAll();
  conversations.clear();
  const s = session;
  session = null;
  refreshTray();
  if (!s) return;
  await Promise.allSettled([s.discovery.stop(), s.peers.stop()]);
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Registra um handler que devolve { ok, value } / { ok: false, error } em vez de
 * lançar: erro esperado (porta ocupada, IP errado) não vira stack trace no terminal.
 */
function handle<A extends unknown[], T>(channel: string, fn: (...args: A) => T | Promise<T>) {
  ipcMain.handle(channel, async (_e: IpcMainInvokeEvent, ...args: unknown[]): Promise<Result<T>> => {
    try {
      return { ok: true, value: await fn(...(args as A)) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

/** Como no Messenger: login e conversa em paisagem; lista de contatos em pé. */
const LAYOUTS: Record<WindowLayout, { width: number; height: number; minWidth: number; minHeight: number }> = {
  login: { width: 820, height: 600, minWidth: 700, minHeight: 520 },
  app: { width: 440, height: 700, minWidth: 380, minHeight: 560 },
  chat: { width: 660, height: 580, minWidth: 520, minHeight: 460 },
};
const currentLayout = new WeakMap<BrowserWindow, WindowLayout>();

function applyLayout(w: BrowserWindow, layout: WindowLayout) {
  if (currentLayout.get(w) === layout) return;
  currentLayout.set(w, layout);
  const l = LAYOUTS[layout];
  if (w.isMaximized()) w.unmaximize();
  if (w.isFullScreen()) w.setFullScreen(false);

  // Mantém o centro da janela e não deixa sair da área útil da tela.
  const b = w.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const width = Math.min(l.width, area.width);
  const height = Math.min(l.height, area.height);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const x = Math.round(Math.min(Math.max(cx - width / 2, area.x), area.x + area.width - width));
  const y = Math.round(Math.min(Math.max(cy - height / 2, area.y), area.y + area.height - height));
  w.setMinimumSize(Math.min(l.minWidth, width), Math.min(l.minHeight, height));
  w.setBounds({ x, y, width, height }, true);
}

function requirePeerId(v: unknown): string {
  if (typeof v !== 'string' || !v) throw new Error('Contato inválido');
  return v;
}

function registerIpc() {
  const win = (e: Electron.IpcMainEvent) => BrowserWindow.fromWebContents(e.sender);
  ipcMain.on(IPC.minimize, (e) => win(e)?.minimize());
  ipcMain.on(IPC.toggleMaximize, (e) => {
    const w = win(e);
    if (w) w.isMaximized() ? w.unmaximize() : w.maximize();
  });
  ipcMain.on(IPC.close, (e) => win(e)?.close());
  ipcMain.on(IPC.setLayout, (e, layout: unknown) => {
    const w = win(e);
    if (w && (layout === 'login' || layout === 'app' || layout === 'chat')) applyLayout(w, layout);
  });

  handle(IPC.getLocalInfo, (): LocalInfo => ({
    computerName: localName,
    addresses: localAddresses(),
    defaultPort: launch.port ?? DEFAULT_PORT,
  }));
  handle(IPC.getSavedProfile, () => settings.profile);
  handle(IPC.getSession, () => (session ? selfInfo(session) : null));
  handle(IPC.login, (req: LoginRequest) => login(req));
  handle(IPC.logout, () => logout());
  handle(IPC.setPresence, (update: PresenceUpdate) => {
    const s = requireSession();
    const clean: PresenceUpdate = {};
    if (typeof update?.name === 'string') clean.name = update.name;
    if (isPresenceStatus(update?.status)) clean.status = update.status;
    if (typeof update?.message === 'string') clean.message = update.message.slice(0, MAX_PERSONAL_MESSAGE_LENGTH);
    s.peers.setPresence(clean);
    if (settings.profile) {
      saveSettings({
        ...settings,
        profile: { ...settings.profile, name: s.peers.name, status: s.peers.status, message: s.peers.message },
      });
    }
    broadcast(IPC.selfChanged, selfInfo(s));
    refreshTray();
    return selfInfo(s);
  });

  handle(IPC.getAvatar, () => avatars.getCurrent());
  handle(IPC.setAvatar, (data: unknown) => {
    const image = data instanceof Uint8Array ? data : null;
    if (data !== null && !image) throw new Error('Imagem inválida');
    avatars.setCurrent(image);
    session?.peers.setAvatar(image);
    broadcast(IPC.myAvatarChanged, avatars.getCurrent());
  });
  handle(IPC.getAvatarLibrary, () => [...avatars.listBuiltin(), ...avatars.listUploads()]);
  handle(IPC.addAvatarUpload, (data: unknown) => {
    if (!(data instanceof Uint8Array)) throw new Error('Imagem inválida');
    return avatars.addUpload(data);
  });
  handle(IPC.removeAvatarUpload, (id: unknown) => avatars.removeUpload(String(id)));
  handle(IPC.getPeerAvatars, () => session?.peers.getPeerAvatars() ?? []);

  handle(IPC.getFont, () => settings.font ?? DEFAULT_FONT);
  handle(IPC.setFont, (font: unknown) => {
    const valid = validateFont(font);
    if (!valid) throw new Error('Fonte inválida');
    saveSettings({ ...settings, font: valid });
    broadcast(IPC.fontChanged, valid);
    return valid;
  });

  handle(IPC.hasGiphyKey, () => !!settings.giphyKey);
  handle(IPC.setGiphyKey, (key: unknown) => {
    if (key !== null && !isGiphyKey(typeof key === 'string' ? key.trim() : key)) {
      throw new Error('Chave inválida: copie a "API Key" do painel do GIPHY for Developers.');
    }
    saveSettings({ ...settings, giphyKey: key === null ? null : String(key).trim() });
  });
  handle(IPC.giphySearch, (query: unknown, offset: unknown) =>
    giphy.search(typeof query === 'string' ? query : '', Number(offset) || 0),
  );
  handle(IPC.giphySend, async (to: unknown, id: unknown) => {
    const s = requireSession();
    const peerId = requirePeerId(to);
    const gif = await giphy.fetchForSending(String(id));
    const name = `${gif.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || 'giphy'}.gif`;
    const meta = s.peers.sendImage(peerId, { name, data: gif.data });
    chats.record(peerId, { kind: 'image', image: { ...meta, data: gif.data } });
    return { meta, data: gif.data };
  });

  handle(IPC.getUpdateStatus, () => updater?.getStatus() ?? { state: 'idle' });
  handle(IPC.installUpdate, () => {
    if (!updater) throw new Error('Atualização automática indisponível nesta versão.');
    // Garante que o "X" da home não esconda durante a instalação.
    quitting = true;
    updater.install();
  });
  handle(IPC.checkForUpdates, () => updater?.check());

  handle(IPC.getPeers, () => session?.peers.getPeers() ?? []);
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
  handle(IPC.connect, async (host: unknown, port: unknown) => {
    if (typeof host !== 'string' || !host.trim()) throw new Error('IP inválido');
    const p = Number(port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error('Porta inválida');
    const error = await connectAndRemember(requireSession(), { host: host.trim(), port: p });
    if (error) throw new Error(error);
  });
  handle(IPC.getSaved, () => settings.manualPeers);
  handle(IPC.forget, (host: unknown, port: unknown) => {
    const target = { host: String(host), port: Number(port) };
    session?.peers.forget(target.host, target.port);
    saveSettings({ ...settings, manualPeers: settings.manualPeers.filter((t) => !sameTarget(t, target)) });
    return settings.manualPeers;
  });
}

/**
 * Só no app instalado no Windows (Squirrel). No macOS o Squirrel.Mac exige app assinado,
 * e no desenvolvimento não há o que atualizar.
 */
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
  // Desligar/sair do Windows não emite before-quit: sem isso, o "X" da home tentaria esconder na bandeja.
  mainWindow.on('session-end', () => {
    quitting = true;
  });
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
      // Como no MSN: aparece atrás do que você está fazendo e pisca na barra de tarefas (minimizada continua minimizada).
      if (!w.isVisible() && !w.isMinimized()) w.showInactive();
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

app.on('ready', () => {
  store = new SettingsStore(app.getPath('userData'));
  // Imagens padrão: public/avatars no desenvolvimento; copiadas junto do renderer no app empacotado.
  const builtinAvatars = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? path.join(app.getAppPath(), 'public', 'avatars')
    : path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/avatars`);
  avatars = new AvatarStore(app.getPath('userData'), builtinAvatars);
  settings = store.load();
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
});

let shuttingDown = false;
app.on('before-quit', (e) => {
  if (shuttingDown) return;
  quitting = true;
  shuttingDown = true;
  e.preventDefault();
  // Limpa a rede (avisa a saída via mDNS) e encerra. app.exit direto: um segundo
  // app.quit() depois de um quit adiado pode ficar parado (visto com SIGTERM).
  const force = setTimeout(() => app.exit(0), 3000);
  logout().finally(() => {
    clearTimeout(force);
    app.exit(0);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => showMainWindow());
