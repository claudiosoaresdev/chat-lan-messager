import { app, BrowserWindow, ipcMain, Notification, screen, shell, type IpcMainInvokeEvent } from 'electron';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { PeerManager, SELF_CONNECTION } from './main/peer-manager';
import { Discovery } from './main/discovery';
import { AvatarStore } from './main/avatar-store';
import { GiphyClient, isGiphyKey } from './main/giphy';
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

/** Avisa de mensagem nova quando a janela não está em foco (estilo "Fulano diz:"). */
function notifyIfUnfocused(title: string, body: string) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFocused()) return;
  mainWindow.flashFrame(true);
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body: body.slice(0, 200), silent: false });
  n.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  n.show();
}

let shaking = false;

/** Faz a janela tremer, como o "chamar atenção" do MSN. */
function shakeWindow() {
  const w = mainWindow;
  if (!w || w.isDestroyed() || shaking) return;
  // Minimizada: reaparece sem roubar o foco, como a janela de conversa do MSN.
  if (w.isMinimized()) w.showInactive();
  if (w.isMaximized() || w.isFullScreen()) return;

  shaking = true;
  const [x, y] = w.getPosition();
  const steps = [
    [-10, -4], [10, 4], [-9, 3], [9, -3], [-7, -2], [7, 2], [-5, 2], [5, -2], [-3, -1], [3, 1], [0, 0],
  ];
  let i = 0;
  const timer = setInterval(() => {
    if (w.isDestroyed() || i >= steps.length) {
      clearInterval(timer);
      if (!w.isDestroyed()) w.setPosition(x, y);
      shaking = false;
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

  peers.on('peer', (peer) => sendToRenderer(IPC.peer, peer));
  peers.on('message', (msg) => {
    sendToRenderer(IPC.message, msg);
    notifyIfUnfocused(`${msg.fromName} diz:`, msg.text);
  });
  peers.on('avatar', (avatar) => sendToRenderer(IPC.peerAvatar, avatar));
  peers.on('wink', (wink) => {
    sendToRenderer(IPC.wink, wink);
    notifyIfUnfocused('Chat Live Messenger', `${wink.fromName} enviou um wink`);
  });
  peers.on('nudge', (nudge) => {
    sendToRenderer(IPC.nudge, nudge);
    notifyIfUnfocused('Chat Live Messenger', `${nudge.fromName} chamou a sua atenção!`);
    shakeWindow();
  });
  peers.on('image', (img) => {
    sendToRenderer(IPC.image, img);
    notifyIfUnfocused(`${img.fromName} enviou uma imagem`, img.name);
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

  return selfInfo(session);
}

async function logout() {
  const s = session;
  session = null;
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
    if (isPresenceStatus(update?.status)) clean.status = update.status;
    if (typeof update?.message === 'string') clean.message = update.message.slice(0, MAX_PERSONAL_MESSAGE_LENGTH);
    s.peers.setPresence(clean);
    if (settings.profile) {
      saveSettings({ ...settings, profile: { ...settings.profile, status: s.peers.status, message: s.peers.message } });
    }
    return selfInfo(s);
  });

  handle(IPC.getAvatar, () => avatars.getCurrent());
  handle(IPC.setAvatar, (data: unknown) => {
    const image = data instanceof Uint8Array ? data : null;
    if (data !== null && !image) throw new Error('Imagem inválida');
    avatars.setCurrent(image);
    session?.peers.setAvatar(image);
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
  handle(IPC.giphySend, async (id: unknown) => {
    const s = requireSession();
    const gif = await giphy.fetchForSending(String(id));
    const name = `${gif.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || 'giphy'}.gif`;
    const meta = s.peers.sendImage({ name, data: gif.data });
    return { meta, data: gif.data };
  });

  handle(IPC.getPeers, () => session?.peers.getPeers() ?? []);
  handle(IPC.send, (text: unknown) => {
    if (typeof text !== 'string') throw new Error('Texto inválido');
    return requireSession().peers.sendText(text, settings.font ?? DEFAULT_FONT);
  });
  handle(IPC.sendImage, (image: OutgoingImage) => {
    if (!image || !(image.data instanceof Uint8Array)) throw new Error('Imagem inválida');
    return requireSession().peers.sendImage({ name: String(image.name ?? ''), data: image.data });
  });
  handle(IPC.sendNudge, () => {
    const nudge = requireSession().peers.sendNudge();
    // No MSN a janela de quem chama também treme.
    shakeWindow();
    return nudge;
  });
  handle(IPC.sendWink, (wink: unknown) => {
    if (!isWinkId(wink)) throw new Error('Wink desconhecido');
    return requireSession().peers.sendWink(wink);
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Nada de navegação ou janelas novas a partir do conteúdo.
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  currentLayout.set(mainWindow, 'login');
  mainWindow.on('focus', () => mainWindow?.flashFrame(false));

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  mainWindow.on('closed', () => (mainWindow = null));
};

app.on('ready', () => {
  store = new SettingsStore(app.getPath('userData'));
  // Imagens padrão: public/avatars no desenvolvimento; copiadas junto do renderer no app empacotado.
  const builtinAvatars = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? path.join(app.getAppPath(), 'public', 'avatars')
    : path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/avatars`);
  avatars = new AvatarStore(app.getPath('userData'), builtinAvatars);
  settings = store.load();
  registerIpc();
  createWindow();
});

let shuttingDown = false;
app.on('before-quit', (e) => {
  if (shuttingDown) return;
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

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

