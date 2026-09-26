// Links nas mensagens: detecção no texto e reconhecimento de vídeos do YouTube. Sem DOM (testável).

export const MAX_URL_LENGTH = 2048;

export interface FoundLink {
  start: number;
  end: number;
  /** URL normalizada (http/https), pronta para abrir. */
  url: string;
}

// Começa em http(s):// ou www. e vai até um espaço ou caractere que não aparece em URL.
const CANDIDATE = /\b(?:https?:\/\/|www\.)[^\s<>"'`{}|\\^]+/gi;
const TRAILING = /[.,!?:;'"”’»]+$/;

/** Tira do fim a pontuação da frase; ")" só fica se tiver "(" correspondente (links da Wikipédia). */
function trimTrailing(raw: string): string {
  let s = raw;
  for (;;) {
    const before = s;
    s = s.replace(TRAILING, '');
    if (s.endsWith(')')) {
      const open = (s.match(/\(/g) ?? []).length;
      const close = (s.match(/\)/g) ?? []).length;
      if (close > open) s = s.slice(0, -1);
    }
    if (s === before) return s;
  }
}

/** URL aceita para abrir ou pré-visualizar: http/https, sem usuário/senha, com host, até MAX_URL_LENGTH. */
export function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_URL_LENGTH) return null;
  const withScheme = /^www\./i.test(raw) ? `https://${raw}` : raw;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || !url.hostname) return null;
    const href = url.href;
    return href.length <= MAX_URL_LENGTH ? href : null;
  } catch {
    return null;
  }
}

/** Links no texto, na ordem em que aparecem. */
export function findLinks(text: string): FoundLink[] {
  const out: FoundLink[] = [];
  for (const m of text.matchAll(CANDIDATE)) {
    const start = m.index ?? 0;
    const raw = trimTrailing(m[0]);
    if (/^www\.?$/i.test(raw)) continue;
    const url = normalizeUrl(raw);
    if (url) out.push({ start, end: start + raw.length, url });
  }
  return out;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
export const isYoutubeId = (v: unknown): v is string => typeof v === 'string' && YOUTUBE_ID.test(v);

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

/** Id do vídeo em links do YouTube (watch, youtu.be, shorts, embed, live); outros links → null. */
export function youtubeId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1] ?? null;
  }
  return isYoutubeId(id) ? id : null;
}

/** Segundo inicial do link (`t=90`, `t=1m30s`, `t=1h2m3s`, `start=90`); 0 se não houver. */
export function youtubeStart(raw: string): number {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 0;
  }
  const t = url.searchParams.get('t') ?? url.searchParams.get('start');
  if (!t) return 0;
  if (/^\d+s?$/.test(t)) return Math.min(parseInt(t, 10), 86_400);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m) return 0;
  const secs = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return Math.min(secs, 86_400);
}
