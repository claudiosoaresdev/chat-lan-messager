// Mantém o servidor WebSocket, as conexões de saída e o mapa de peers.
// Cada instância é servidor e cliente ao mesmo tempo.
import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  MAX_IMAGE_BYTES,
  MAX_AVATAR_BYTES,
  MAX_NAME_LENGTH,
  MAX_PERSONAL_MESSAGE_LENGTH,
  MAX_TEXT_LENGTH,
  detectImageMime,
  encodeMessage,
  parseMessage,
  shouldInitiate,
  validateImageBytes,
  type AvatarHeader,
  type HelloMessage,
  type ImageHeader,
  type ImageMime,
  type MessageFont,
  type PresenceStatus,
  type WinkId,
  isWinkId,
} from '../shared/protocol';
import type {
  OutgoingImage,
  PeerAvatar,
  PeerInfo,
  PresenceUpdate,
  UiChatMessage,
  UiImageMessage,
  UiImageMeta,
  UiNudge,
  UiWink,
} from '../shared/api';

const HEARTBEAT_MS = 10_000;
/** Intervalo mínimo entre "chamar atenção" (enviar e aceitar do mesmo contato), como no MSN. */
export const NUDGE_COOLDOWN_MS = 5_000;
/** Intervalo mínimo entre winks (enviar e aceitar do mesmo contato). */
export const WINK_COOLDOWN_MS = 3_000;
const RECONNECT_MS = 3_000;
const DIAL_TIMEOUT_MS = 5_000;
const CLOSE_DUPLICATE = 4000;
const CLOSE_SELF = 4001;
/** `code` do erro de `connect()` quando o alvo é esta própria instância. */
export const SELF_CONNECTION = 'SELF_CONNECTION';

interface Conn {
  ws: WebSocket;
  outbound: boolean;
  address: string;
  targetKey?: string;
  remote: { id: string } | null;
  /** Cabeçalho aguardando o próximo frame binário. */
  pending: { kind: 'image'; header: ImageHeader } | { kind: 'avatar'; header: AvatarHeader } | null;
  alive: boolean;
  onHello?: (peerId: string) => void;
}

interface Avatar {
  mime: ImageMime;
  data: Buffer;
}

interface PeerState {
  id: string;
  name: string;
  status: PresenceStatus;
  message: string;
  avatar: Avatar | null;
  address: string;
  conn: Conn | null;
}

interface DialTarget {
  host: string;
  port: number;
  peerId?: string;
}

export interface PeerManagerOptions {
  id: string;
  name: string;
  status?: PresenceStatus;
  message?: string;
  avatar?: Uint8Array | null;
  /** Porta do servidor; 0 = porta livre dinâmica. */
  port?: number;
  /** Se a porta preferida estiver ocupada, cai para uma porta dinâmica. */
  fallbackToRandomPort?: boolean;
  host?: string;
  heartbeatMs?: number;
  reconnectMs?: number;
}

export interface PeerManagerEvents {
  peer: [PeerInfo];
  message: [UiChatMessage];
  image: [UiImageMessage];
  nudge: [UiNudge];
  wink: [UiWink];
  avatar: [PeerAvatar];
}

const ignore = (): void => undefined;

const DIAL_ERRORS: Record<string, string> = {
  ECONNREFUSED: 'Nada respondendo nesse IP e porta (app fechado ou porta errada)',
  ETIMEDOUT: 'Computador não respondeu (firewall ou IP errado)',
  EHOSTUNREACH: 'Computador não encontrado na rede',
  ENETUNREACH: 'Sem rota para esse IP (redes diferentes?)',
  ENOTFOUND: 'Nome não encontrado na rede',
};

const friendlyDialError = (err: Error) =>
  new Error(DIAL_ERRORS[(err as NodeJS.ErrnoException).code ?? ''] ?? err.message);
const normalizeAddress = (addr: string | undefined) => (addr ?? '').replace(/^::ffff:/, '');

export class PeerManager extends EventEmitter<PeerManagerEvents> {
  readonly id: string;
  private _name: string;
  private _status: PresenceStatus;
  private _message: string;
  private _avatar: Avatar | null = null;
  private readonly opts: PeerManagerOptions;
  private wss: WebSocketServer | null = null;
  private readonly peers = new Map<string, PeerState>();
  private readonly conns = new Set<Conn>();
  private readonly targets = new Map<string, DialTarget>();
  private readonly dialing = new Set<string>();
  private timers: NodeJS.Timeout[] = [];
  private readonly lastNudgeSent = new Map<string, number>();
  private readonly lastNudgeFrom = new Map<string, number>();
  private readonly lastWinkSent = new Map<string, number>();
  private readonly lastWinkFrom = new Map<string, number>();
  private _port = 0;

  constructor(opts: PeerManagerOptions) {
    super();
    this.opts = opts;
    this.id = opts.id;
    this._name = opts.name;
    this._status = opts.status ?? 'available';
    this._message = opts.message ?? '';
    if (opts.avatar) this._avatar = PeerManager.toAvatar(opts.avatar);
  }

  private static toAvatar(data: Uint8Array): Avatar {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (buf.length === 0 || buf.length > MAX_AVATAR_BYTES) throw new Error('Imagem de exibição maior que 256 KB');
    const mime = detectImageMime(buf);
    if (!mime) throw new Error('Formato não suportado (use PNG, JPEG, WebP ou GIF)');
    return { mime, data: Buffer.from(buf) };
  }

  /** Define ou remove (null) a imagem de exibição e avisa todos os peers conectados. */
  setAvatar(data: Uint8Array | null) {
    this._avatar = data ? PeerManager.toAvatar(data) : null;
    for (const ws of this.openSockets()) this.sendAvatar(ws);
  }

  private sendAvatar(ws: WebSocket) {
    const a = this._avatar;
    ws.send(encodeMessage({ type: 'avatar', from: this.id, mime: a?.mime ?? null, size: a?.data.length ?? 0 }));
    if (a) ws.send(a.data, { binary: true });
  }

  getPeerAvatars(): PeerAvatar[] {
    return [...this.peers.values()]
      .filter((p) => p.avatar)
      .map((p) => ({ id: p.id, mime: p.avatar?.mime ?? null, data: p.avatar ? new Uint8Array(p.avatar.data) : null }));
  }

  get port() {
    return this._port;
  }

  get name() {
    return this._name;
  }

  get status() {
    return this._status;
  }

  get message() {
    return this._message;
  }

  /** Atualiza nome/status/mensagem pessoal e avisa todos os peers conectados. Nome vazio é ignorado. */
  setPresence(update: PresenceUpdate) {
    const name = update.name?.trim().slice(0, MAX_NAME_LENGTH);
    if (name) this._name = name;
    if (update.status !== undefined) this._status = update.status;
    if (update.message !== undefined) this._message = update.message.trim().slice(0, MAX_PERSONAL_MESSAGE_LENGTH);
    const frame = encodeMessage({
      type: 'presence',
      from: this.id,
      name: this._name,
      status: this._status,
      message: this._message,
    });
    for (const ws of this.openSockets()) ws.send(frame);
  }

  /**
   * Sobe o servidor na porta preferida. Se ela estiver ocupada e
   * `fallbackToRandomPort` estiver ligado, usa uma porta livre dinâmica.
   */
  async start(): Promise<number> {
    const preferred = this.opts.port ?? 0;
    let wss: WebSocketServer;
    try {
      wss = await this.listen(preferred);
    } catch (err) {
      const inUse = (err as NodeJS.ErrnoException).code === 'EADDRINUSE';
      if (!inUse || preferred === 0 || !this.opts.fallbackToRandomPort) throw err;
      console.warn(`[peers] porta ${preferred} ocupada, usando porta dinâmica`);
      wss = await this.listen(0);
    }

    this.wss = wss;
    wss.on('error', (err) => console.error('[peers] server error', err));
    wss.on('connection', (ws, req) => this.attach(ws, false, normalizeAddress(req.socket.remoteAddress)));
    this._port = (wss.address() as AddressInfo).port;
    this.timers.push(setInterval(() => this.heartbeat(), this.opts.heartbeatMs ?? HEARTBEAT_MS));
    this.timers.push(setInterval(() => this.redialTargets(), this.opts.reconnectMs ?? RECONNECT_MS));
    return this._port;
  }

  private listen(port: number): Promise<WebSocketServer> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ port, host: this.opts.host, maxPayload: MAX_IMAGE_BYTES });
      wss.once('error', (err) => {
        wss.close();
        reject(err);
      });
      wss.once('listening', () => {
        wss.removeAllListeners('error');
        resolve(wss);
      });
    });
  }

  async stop(): Promise<void> {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.targets.clear();
    for (const conn of this.conns) conn.ws.terminate();
    // close() espera todas as conexões HTTP acabarem; com limite, uma conexão pendurada não trava o fechamento.
    await new Promise<void>((resolve) => {
      if (!this.wss) return resolve();
      const timer = setTimeout(resolve, 1500);
      this.wss.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.wss = null;
  }

  getPeers(): PeerInfo[] {
    return [...this.peers.values()].map((p) => this.toInfo(p));
  }

  /**
   * Registra um alvo de conexão. O alvo é redicado automaticamente enquanto
   * o peer correspondente estiver offline.
   */
  addTarget(key: string, host: string, port: number): Promise<string> {
    const existing = this.targets.get(key);
    if (!existing || existing.host !== host || existing.port !== port) {
      this.targets.set(key, { host, port });
    }
    return this.dial(key);
  }

  removeTarget(key: string) {
    this.targets.delete(key);
  }

  /** Conexão manual por IP (fallback quando o mDNS não funciona). */
  connect(host: string, port: number): Promise<string> {
    return this.addTarget(`manual:${host}:${port}`, host, port);
  }

  /** Para de rediscar um alvo manual. Não derruba uma conexão já aberta. */
  forget(host: string, port: number) {
    this.removeTarget(`manual:${host}:${port}`);
  }

  /** Peer descoberto via mDNS: só o lado com ID menor inicia a conexão. */
  discovered(remoteId: string, host: string, port: number) {
    if (remoteId === this.id || !shouldInitiate(this.id, remoteId)) return;
    this.addTarget(`mdns:${remoteId}`, host, port).catch(ignore);
  }

  lost(remoteId: string) {
    this.removeTarget(`mdns:${remoteId}`);
  }

  sendText(to: string, text: string, font?: MessageFont): UiChatMessage {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Mensagem vazia');
    if (trimmed.length > MAX_TEXT_LENGTH) throw new Error(`Mensagem maior que ${MAX_TEXT_LENGTH} caracteres`);
    const ws = this.socketFor(to);
    const ts = Date.now();
    ws.send(encodeMessage({ type: 'chat', from: this.id, text: trimmed, ts, ...(font ? { font } : {}) }));
    return { from: this.id, fromName: this._name, text: trimmed, ts, self: true, ...(font ? { font } : {}) };
  }

  /** Chama a atenção do contato. Limitado a um a cada NUDGE_COOLDOWN_MS por contato. */
  sendNudge(to: string, now = Date.now()): UiNudge {
    const ws = this.socketFor(to);
    if (now - (this.lastNudgeSent.get(to) ?? 0) < NUDGE_COOLDOWN_MS) {
      throw new Error('Aguarde alguns segundos para chamar a atenção de novo.');
    }
    this.lastNudgeSent.set(to, now);
    ws.send(encodeMessage({ type: 'nudge', from: this.id, ts: now }));
    return { from: this.id, fromName: this._name, ts: now, self: true };
  }

  /** Envia um wink ao contato. Limitado a um a cada WINK_COOLDOWN_MS por contato. */
  sendWink(to: string, wink: WinkId, now = Date.now()): UiWink {
    if (!isWinkId(wink)) throw new Error('Wink desconhecido');
    const ws = this.socketFor(to);
    if (now - (this.lastWinkSent.get(to) ?? 0) < WINK_COOLDOWN_MS) {
      throw new Error('Aguarde a animação terminar para enviar outro wink.');
    }
    this.lastWinkSent.set(to, now);
    ws.send(encodeMessage({ type: 'wink', from: this.id, wink, ts: now }));
    return { from: this.id, fromName: this._name, wink, ts: now, self: true };
  }

  sendImage(to: string, image: OutgoingImage): UiImageMeta {
    const data = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
    if (data.length === 0) throw new Error('Imagem vazia');
    if (data.length > MAX_IMAGE_BYTES) throw new Error('Imagem maior que 10 MB');
    const mime = detectImageMime(data);
    if (!mime) throw new Error('Formato não suportado (use PNG, JPEG, WebP ou GIF)');
    const ws = this.socketFor(to);
    const name = (image.name || 'imagem').slice(0, 255);
    const ts = Date.now();
    ws.send(encodeMessage({ type: 'image', from: this.id, name, mime, size: data.length, ts }));
    ws.send(data, { binary: true });
    return { from: this.id, fromName: this._name, name, mime, size: data.length, ts, self: true };
  }

  // ---------------------------------------------------------------------------

  /** Conexão aberta com o contato. Erro visível quando ele está offline. */
  private socketFor(to: string): WebSocket {
    const peer = this.peers.get(to);
    if (!peer) throw new Error('Contato desconhecido.');
    const ws = peer.conn?.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error(`${peer.name} está offline.`);
    return ws;
  }

  private *openSockets() {
    for (const peer of this.peers.values()) {
      if (peer.conn && peer.conn.ws.readyState === WebSocket.OPEN) yield peer.conn.ws;
    }
  }

  private isTargetOnline(t: DialTarget) {
    return !!t.peerId && !!this.peers.get(t.peerId)?.conn;
  }

  private redialTargets() {
    for (const [key, t] of this.targets) {
      if (!this.isTargetOnline(t)) this.dial(key).catch(ignore);
    }
  }

  private dial(key: string): Promise<string> {
    const target = this.targets.get(key);
    if (!target) return Promise.reject(new Error('Alvo desconhecido'));
    if (this.isTargetOnline(target)) return Promise.resolve(target.peerId as string);
    if (this.dialing.has(key)) return Promise.reject(new Error('Conexão em andamento'));

    this.dialing.add(key);
    return new Promise<string>((resolve, reject) => {
      const host = target.host.includes(':') ? `[${target.host}]` : target.host;
      const ws = new WebSocket(`ws://${host}:${target.port}`, {
        maxPayload: MAX_IMAGE_BYTES,
        handshakeTimeout: DIAL_TIMEOUT_MS,
      });
      let settled = false;
      const finish = (err: Error | null, peerId?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.dialing.delete(key);
        if (err) reject(err);
        else resolve(peerId as string);
      };
      const timer = setTimeout(() => {
        finish(new Error('Tempo esgotado ao conectar'));
        ws.terminate();
      }, DIAL_TIMEOUT_MS * 2);

      ws.once('error', (err) => finish(friendlyDialError(err)));
      ws.once('close', (code) =>
        finish(
          code === CLOSE_SELF
            ? Object.assign(new Error('Esse é o endereço deste próprio computador. Use o IP que aparece no outro.'), {
                code: SELF_CONNECTION,
              })
            : new Error('O outro lado encerrou a conexão (não é o Chat LAN?)'),
        ),
      );
      ws.once('open', () => {
        const conn = this.attach(ws, true, target.host, key);
        conn.onHello = (peerId) => finish(null, peerId);
      });
    });
  }

  private attach(ws: WebSocket, outbound: boolean, address: string, targetKey?: string): Conn {
    const conn: Conn = {
      ws,
      outbound,
      address,
      targetKey,
      remote: null,
      pending: null,
      alive: true,
    };
    this.conns.add(conn);

    ws.on('pong', () => (conn.alive = true));
    ws.on('error', (err) => console.warn(`[peers] socket error (${address})`, err.message));
    ws.on('close', () => this.onClose(conn));
    ws.on('message', (data, isBinary) => this.onFrame(conn, data, isBinary));

    ws.send(encodeMessage({ type: 'hello', id: this.id, name: this._name, status: this._status, message: this._message }));
    return conn;
  }

  private onFrame(conn: Conn, data: RawData, isBinary: boolean) {
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);

    if (isBinary) {
      const pending = conn.pending;
      conn.pending = null;
      // Frame binário sem cabeçalho pendente é descartado.
      if (!pending || !conn.remote) return;

      if (pending.kind === 'avatar') {
        const { header } = pending;
        const peer = this.peers.get(conn.remote.id);
        if (!peer || !header.mime || !validateImageBytes(buf, header.mime, header.size)) return;
        peer.avatar = { mime: header.mime, data: Buffer.from(buf) };
        this.emit('avatar', { id: peer.id, mime: header.mime, data: new Uint8Array(peer.avatar.data) });
        return;
      }

      const { header } = pending;
      if (!validateImageBytes(buf, header.mime, header.size)) return;
      const peer = this.peers.get(conn.remote.id);
      this.emit('image', {
        from: header.from,
        fromName: peer?.name ?? header.from,
        name: header.name,
        mime: header.mime,
        size: header.size,
        ts: header.ts,
        self: false,
        data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
      });
      return;
    }

    const msg = parseMessage(buf.toString('utf8'));
    if (!msg) return;

    if (msg.type === 'hello') {
      if (conn.remote) return;
      this.onHello(conn, msg);
      return;
    }

    // Antes do hello nada é aceito; `from` tem que bater com o peer da conexão.
    if (!conn.remote || msg.from !== conn.remote.id) return;

    if (msg.type === 'presence') {
      const peer = this.peers.get(msg.from);
      if (!peer) return;
      peer.name = msg.name;
      peer.status = msg.status;
      peer.message = msg.message;
      this.emit('peer', this.toInfo(peer));
    } else if (msg.type === 'chat') {
      conn.pending = null;
      this.emit('message', {
        from: msg.from,
        fromName: this.peers.get(msg.from)?.name ?? msg.from,
        text: msg.text,
        ts: msg.ts,
        self: false,
        ...(msg.font ? { font: msg.font } : {}),
      });
    } else if (msg.type === 'image') {
      conn.pending = { kind: 'image', header: msg };
    } else if (msg.type === 'avatar') {
      if (msg.size > 0) {
        conn.pending = { kind: 'avatar', header: msg };
        return;
      }
      conn.pending = null;
      const peer = this.peers.get(msg.from);
      if (!peer || !peer.avatar) return;
      peer.avatar = null;
      this.emit('avatar', { id: peer.id, mime: null, data: null });
    } else if (msg.type === 'wink') {
      const now = Date.now();
      if (now - (this.lastWinkFrom.get(msg.from) ?? 0) < WINK_COOLDOWN_MS) return;
      this.lastWinkFrom.set(msg.from, now);
      this.emit('wink', {
        from: msg.from,
        fromName: this.peers.get(msg.from)?.name ?? msg.from,
        wink: msg.wink,
        ts: msg.ts,
        self: false,
      });
    } else if (msg.type === 'nudge') {
      // Anti-spam: chamadas seguidas do mesmo contato são ignoradas.
      const now = Date.now();
      if (now - (this.lastNudgeFrom.get(msg.from) ?? 0) < NUDGE_COOLDOWN_MS) return;
      this.lastNudgeFrom.set(msg.from, now);
      this.emit('nudge', {
        from: msg.from,
        fromName: this.peers.get(msg.from)?.name ?? msg.from,
        ts: msg.ts,
        self: false,
      });
    }
  }

  private onHello(conn: Conn, hello: HelloMessage) {
    const remoteId = hello.id;
    if (remoteId === this.id) {
      if (conn.targetKey) this.targets.delete(conn.targetKey);
      conn.ws.close(CLOSE_SELF, 'self');
      return;
    }

    conn.remote = { id: remoteId };
    if (conn.targetKey) {
      const target = this.targets.get(conn.targetKey);
      if (target) target.peerId = remoteId;
    }

    let peer = this.peers.get(remoteId);
    if (!peer) {
      peer = {
        id: remoteId,
        name: hello.name,
        status: hello.status,
        message: hello.message,
        avatar: null,
        address: conn.address,
        conn: null,
      };
      this.peers.set(remoteId, peer);
    }

    const existing = peer.conn;
    if (existing && existing !== conn && existing.ws.readyState === WebSocket.OPEN) {
      // Conexão duplicada: os dois lados mantêm a que foi iniciada pelo ID menor.
      const preferred = (c: Conn) => c.outbound === shouldInitiate(this.id, remoteId);
      if (preferred(conn) && !preferred(existing)) {
        peer.conn = conn;
        existing.ws.close(CLOSE_DUPLICATE, 'duplicate');
      } else {
        conn.ws.close(CLOSE_DUPLICATE, 'duplicate');
      }
    } else {
      peer.conn = conn;
    }

    peer.name = hello.name;
    peer.status = hello.status;
    peer.message = hello.message;
    peer.address = peer.conn?.address ?? conn.address;
    conn.onHello?.(remoteId);
    this.emit('peer', this.toInfo(peer));
    // Conexão aceita: manda a imagem de exibição para o novo contato.
    if (peer.conn === conn && this._avatar) this.sendAvatar(conn.ws);
  }

  private onClose(conn: Conn) {
    this.conns.delete(conn);
    if (!conn.remote) return;
    const peer = this.peers.get(conn.remote.id);
    if (peer && peer.conn === conn) {
      peer.conn = null;
      this.emit('peer', this.toInfo(peer));
    }
  }

  private heartbeat() {
    for (const conn of this.conns) {
      if (!conn.alive) {
        conn.ws.terminate();
        continue;
      }
      conn.alive = false;
      try {
        conn.ws.ping();
      } catch {
        // socket já fechando
      }
    }
  }

  private toInfo(p: PeerState): PeerInfo {
    return { id: p.id, name: p.name, status: p.status, message: p.message, address: p.address, online: !!p.conn };
  }
}
