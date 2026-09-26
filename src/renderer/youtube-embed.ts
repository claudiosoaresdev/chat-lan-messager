// Player do YouTube em iframe (youtube-nocookie.com, único site liberado no frame-src do CSP), usado na conversa e na
// janela flutuante. Acompanha o tempo do vídeo para "Destacar" e "Voltar para a conversa" continuarem do mesmo ponto.
import { isYoutubeId } from '../shared/links';
import { el } from './dom';

export const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

export class YoutubeEmbed {
  readonly iframe: HTMLIFrameElement;
  private reported: number | null = null;
  private reportedAt = 0;
  private playing = true;
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
      const data = JSON.parse(e.data) as { event?: string; info?: { currentTime?: unknown; playerState?: unknown } };
      if (data.event !== 'infoDelivery' || !data.info) return;
      if (typeof data.info.currentTime === 'number' && Number.isFinite(data.info.currentTime)) {
        this.reported = data.info.currentTime;
        this.reportedAt = Date.now();
      }
      // 1 = tocando; os outros estados param o relógio da estimativa.
      if (typeof data.info.playerState === 'number') this.playing = data.info.playerState === 1;
    } catch {
      // mensagem de outro formato
    }
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
