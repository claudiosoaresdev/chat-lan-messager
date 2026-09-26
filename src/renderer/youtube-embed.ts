// Player do YouTube em iframe (youtube-nocookie.com, único site liberado no frame-src do CSP), usado na conversa e na
// janela flutuante. Acompanha o tempo do vídeo para "Destacar" e "Voltar para a conversa" continuarem do mesmo ponto.
import { isYoutubeId } from '../shared/links';
import { el } from './dom';

export const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

/** Mudança feita no player (tocar, pausar ou pular para outro ponto). */
export interface EmbedChange {
  playing: boolean;
  time: number;
  /** Pulou para outro ponto (não é só o tempo andando). */
  seeked: boolean;
}

/** Diferença entre o tempo informado e o esperado a partir da qual conta como "pulou". */
const SEEK_JUMP_S = 2;

export class YoutubeEmbed {
  readonly iframe: HTMLIFrameElement;
  private reported: number | null = null;
  private reportedAt = 0;
  private playing = true;
  /** Estado já informado pelo player (antes disso não há o que comparar). */
  private known = false;
  private ready = false;
  private queue: Array<[string, unknown[]]> = [];
  private readonly changeListeners: Array<(c: EmbedChange) => void> = [];
  private readonly startedAt = Date.now();
  private readonly onMessage = (e: MessageEvent) => this.receive(e);

  constructor(
    readonly id: string,
    private readonly start: number,
  ) {
    if (!isYoutubeId(id)) throw new Error('Vídeo inválido');
    const params = new URLSearchParams({ autoplay: '1', enablejsapi: '1', playsinline: '1', rel: '0', start: String(Math.floor(start)) });
    const iframe = el('iframe', 'yt-iframe');
    iframe.src = `${EMBED_ORIGIN}/embed/${id}?${params}`;
    iframe.title = 'Vídeo do YouTube';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    // Só o necessário para o player: scripts, cookies do próprio domínio, tela cheia e abrir o vídeo no navegador.
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
    iframe.addEventListener('load', () => this.listen());
    window.addEventListener('message', this.onMessage);
    this.iframe = iframe;
  }

  /** Pede ao player para mandar o tempo atual (API de mensagens do iframe do YouTube). */
  private listen() {
    try {
      this.iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), EMBED_ORIGIN);
    } catch {
      // sem API: o tempo vira estimativa
    }
  }

  private receive(e: MessageEvent) {
    if (e.origin !== EMBED_ORIGIN || e.source !== this.iframe.contentWindow || typeof e.data !== 'string') return;
    try {
      const data = JSON.parse(e.data) as { event?: string; info?: { currentTime?: unknown; playerState?: unknown } | null };
      // Qualquer resposta do player: ele já aceita comandos.
      if (!this.ready) {
        this.ready = true;
        for (const [func, args] of this.queue) this.post(func, args);
        this.queue = [];
      }
      if ((data.event !== 'infoDelivery' && data.event !== 'initialDelivery') || !data.info) return;
      const expected = this.currentTime();
      let seeked = false;
      let changed = false;
      if (typeof data.info.currentTime === 'number' && Number.isFinite(data.info.currentTime)) {
        seeked = this.known && Math.abs(data.info.currentTime - expected) > SEEK_JUMP_S;
        this.reported = data.info.currentTime;
        this.reportedAt = Date.now();
      }
      // 1 = tocando; 3 = carregando (não muda nada); os outros param.
      const state = data.info.playerState;
      if (typeof state === 'number' && state !== 3 && state !== -1) {
        const playing = state === 1;
        changed = playing !== this.playing;
        this.playing = playing;
        this.known = true;
      }
      if ((changed || seeked) && this.known) {
        const change = { playing: this.playing, time: this.currentTime(), seeked };
        this.changeListeners.forEach((fn) => fn(change));
      }
    } catch {
      // mensagem de outro formato
    }
  }

  private post(func: string, args: unknown[]) {
    try {
      this.iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }), EMBED_ORIGIN);
    } catch {
      // player fechado
    }
  }

  /** Comando para o player (API do iframe); antes de ele responder, fica na fila. */
  private command(func: string, args: unknown[] = []) {
    if (this.ready) this.post(func, args);
    else this.queue.push([func, args]);
  }

  play() {
    this.command('playVideo');
  }

  pause() {
    this.command('pauseVideo');
  }

  seekTo(seconds: number) {
    this.command('seekTo', [Math.max(0, seconds), true]);
    this.reported = Math.max(0, seconds);
    this.reportedAt = Date.now();
  }

  get isPlaying() {
    return this.playing;
  }

  /** Tocar, pausar ou pular feitos no player (pelo usuário ou por comando). */
  onChange(fn: (c: EmbedChange) => void) {
    this.changeListeners.push(fn);
  }

  /** Segundo atual: o que o player informou (mais o tempo desde então, se tocando) ou estimativa pelo relógio. */
  currentTime(): number {
    if (this.reported !== null) return this.reported + (this.playing ? (Date.now() - this.reportedAt) / 1000 : 0);
    return this.start + (Date.now() - this.startedAt) / 1000;
  }

  destroy() {
    window.removeEventListener('message', this.onMessage);
    this.iframe.remove();
  }
}
