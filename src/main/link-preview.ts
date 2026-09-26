// Prévia de links (título, descrição, site e miniatura), como no WhatsApp: lê as tags Open Graph (og:*) e, na falta,
// as do Twitter (twitter:*) e o <title>. Roda só no processo principal de quem ENVIA; a prévia pronta vai pela rede
// local, então quem recebe não precisa de internet. Limites de tempo e tamanho em tudo: o app não vira um baixador.
import {
  MAX_PREVIEW_DESCRIPTION,
  MAX_PREVIEW_IMAGE_BYTES,
  MAX_PREVIEW_SITE,
  MAX_PREVIEW_TITLE,
  detectImageMime,
  type ImageMime,
} from '../shared/protocol';
import { isYoutubeId, normalizeUrl, youtubeId } from '../shared/links';

export interface LinkPreviewData {
  url: string;
  title: string;
  description?: string;
  siteName?: string;
  /** Id do vídeo, se o link é do YouTube (vira player na conversa). */
  youtube?: string;
  image?: { mime: ImageMime; data: Uint8Array };
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
/** Reduz a imagem para a miniatura (lado maior ~480 px); null = não deu para decodificar. */
export type MakeThumbnail = (data: Uint8Array) => { mime: ImageMime; data: Uint8Array } | null;

const TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_IMAGE_DOWNLOAD = 5 * 1024 * 1024;
const CACHE_SIZE = 100;
const CACHE_TTL_MS = 30 * 60 * 1000;
const USER_AGENT = 'Mozilla/5.0 (compatible; ChatLAN-LinkPreview/1.0; +https://github.com/claudiosoares)';

// ---------------------------------------------------------------- HTML

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, code: string) => {
    const c = code.toLowerCase();
    if (c.startsWith('#x') || c.startsWith('#')) {
      const n = c.startsWith('#x') ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[c] ?? m;
  });
}

const tidy = (s: string | undefined, max: number) => {
  if (!s) return undefined;
  const t = decodeEntities(s).replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

export interface HeadInfo {
  title?: string;
  description?: string;
  siteName?: string;
  image?: string;
}

/** Lê as metatags do <head>. `baseUrl` resolve imagem relativa; só fica imagem http(s). */
export function parseHead(html: string, baseUrl: string): HeadInfo {
  const end = html.search(/<\/head\s*>/i);
  const head = end >= 0 ? html.slice(0, end) : html;
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(m[0]);
    const key = (a.property ?? a.name ?? a.itemprop ?? '').toLowerCase();
    if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content;
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  let image: string | undefined;
  const rawImage = meta['og:image'] ?? meta['og:image:url'] ?? meta['og:image:secure_url'] ?? meta['twitter:image'] ?? meta['twitter:image:src'];
  if (rawImage) {
    try {
      image = normalizeUrl(new URL(decodeEntities(rawImage.trim()), baseUrl).href) ?? undefined;
    } catch {
      image = undefined;
    }
  }
  return {
    title: tidy(meta['og:title'] ?? meta['twitter:title'] ?? titleTag, MAX_PREVIEW_TITLE),
    description: tidy(meta['og:description'] ?? meta['twitter:description'] ?? meta.description, MAX_PREVIEW_DESCRIPTION),
    siteName: tidy(meta['og:site_name'] ?? meta['application-name'], MAX_PREVIEW_SITE),
    image,
  };
}

/** Charset do Content-Type ou da <meta charset>; UTF-8 se não disser ou não for conhecido. */
function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const ascii = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  const label =
    /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1] ??
    /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(ascii)?.[1] ??
    'utf-8';
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

// ---------------------------------------------------------------- rede

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Lê o corpo até `max` bytes; `stopAt` encerra antes (ex.: achou o </head>). Passou do limite sem parar → null. */
async function readLimited(res: Response, max: number, stopAt?: (text: string) => boolean): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer()).subarray(0, max);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const peek = new TextDecoder('latin1');
  // Fim do pedaço anterior: o marcador procurado pode vir partido entre dois pedaços.
  let tail = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (stopAt) {
        const text = tail + peek.decode(value, { stream: true });
        tail = text.slice(-16);
        if (stopAt(text)) break;
      }
      if (total >= max) {
        if (!stopAt) return null;
        break;
      }
    }
  } finally {
    void reader.cancel().catch((): void => undefined);
  }
  const out = new Uint8Array(Math.min(total, max));
  let at = 0;
  for (const c of chunks) {
    if (at >= out.length) break;
    out.set(c.subarray(0, out.length - at), at);
    at += c.length;
  }
  return out;
}

export class LinkPreviewer {
  private readonly cache = new Map<string, { at: number; value: Promise<LinkPreviewData | null> }>();

  constructor(
    private readonly fetchImpl: Fetch,
    private readonly thumbnail: MakeThumbnail,
    private readonly now: () => number = Date.now,
  ) {}

  /** Prévia do link (com cache); null se não deu (sem título, fora do ar, não é HTML…). Nunca rejeita. */
  get(rawUrl: string): Promise<LinkPreviewData | null> {
    const url = normalizeUrl(rawUrl);
    if (!url) return Promise.resolve(null);
    const hit = this.cache.get(url);
    if (hit && this.now() - hit.at < CACHE_TTL_MS) {
      // Mais recente no fim (LRU).
      this.cache.delete(url);
      this.cache.set(url, hit);
      return hit.value;
    }
    const value = this.load(url).catch((): null => null);
    this.cache.set(url, { at: this.now(), value });
    while (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value as string);
    return value;
  }

  private async load(url: string): Promise<LinkPreviewData | null> {
    const yt = youtubeId(url);
    if (yt) return this.loadYoutube(url, yt);

    const page = await withTimeout(async (signal) => {
      const res = await this.fetchImpl(url, {
        signal,
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' },
      });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !/text\/html|application\/xhtml\+xml/i.test(type)) {
        void res.body?.cancel().catch((): void => undefined);
        return null;
      }
      const bytes = await readLimited(res, MAX_HTML_BYTES, (chunk) => /<\/head\s*>/i.test(chunk));
      return bytes ? { html: decodeHtml(bytes, type), finalUrl: res.url || url } : null;
    });
    if (!page) return null;

    const head = parseHead(page.html, page.finalUrl);
    if (!head.title) return null;
    const image = head.image ? await this.loadImage(head.image) : null;
    return {
      url,
      title: head.title,
      ...(head.description ? { description: head.description } : {}),
      siteName: head.siteName ?? new URL(page.finalUrl).hostname.replace(/^www\./, ''),
      ...(image ? { image } : {}),
    };
  }

  /** YouTube: oEmbed (título e canal) e a miniatura oficial — mais confiável que ler a página. */
  private async loadYoutube(url: string, id: string): Promise<LinkPreviewData | null> {
    if (!isYoutubeId(id)) return null;
    const info = await withTimeout(async (signal) => {
      const res = await this.fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, {
        signal,
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!res.ok) return null;
      const body = await readLimited(res, 64 * 1024);
      if (!body) return null;
      return JSON.parse(new TextDecoder().decode(body)) as { title?: unknown; author_name?: unknown };
    }).catch((): null => null);
    const image = await this.loadImage(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    const title = tidy(typeof info?.title === 'string' ? info.title : undefined, MAX_PREVIEW_TITLE) ?? 'Vídeo do YouTube';
    const author = tidy(typeof info?.author_name === 'string' ? info.author_name : undefined, MAX_PREVIEW_DESCRIPTION);
    return {
      url,
      title,
      ...(author ? { description: author } : {}),
      siteName: 'YouTube',
      youtube: id,
      ...(image ? { image } : {}),
    };
  }

  private async loadImage(url: string): Promise<LinkPreviewData['image'] | null> {
    try {
      const bytes = await withTimeout(async (signal) => {
        const res = await this.fetchImpl(url, { signal, redirect: 'follow', headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' } });
        if (!res.ok) {
          void res.body?.cancel().catch((): void => undefined);
          return null;
        }
        return readLimited(res, MAX_IMAGE_DOWNLOAD);
      });
      if (!bytes || !detectImageMime(bytes)) return null;
      const thumb = this.thumbnail(bytes);
      if (thumb && thumb.data.length <= MAX_PREVIEW_IMAGE_BYTES && detectImageMime(thumb.data) === thumb.mime) return thumb;
      // Formato que o redutor não abre (WebP, GIF): vai o original, se já for pequeno.
      const mime = detectImageMime(bytes);
      return mime && bytes.length <= MAX_PREVIEW_IMAGE_BYTES ? { mime, data: bytes } : null;
    } catch {
      return null;
    }
  }
}
