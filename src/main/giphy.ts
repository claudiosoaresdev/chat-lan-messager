// Busca de GIFs no GIPHY (opcional: precisa de internet e de uma chave de API).
// Tudo roda no processo principal: a interface continua sem acesso à internet (CSP),
// e quem recebe o GIF não precisa de internet — ele vai como imagem pela rede local.
import { MAX_IMAGE_BYTES, detectImageMime } from '../shared/protocol';

const API = 'https://api.giphy.com/v1/gifs';
const PAGE_SIZE = 24;
const TIMEOUT_MS = 10_000;
const MAX_PREVIEW_BYTES = 1.5 * 1024 * 1024;
const PREVIEW_CONCURRENCY = 6;

export interface GiphyResult {
  id: string;
  title: string;
  previewUrl: string;
  sendUrl: string;
}

export interface GiphyPage {
  results: GiphyResult[];
  next: number | null;
}

export const isGiphyKey = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9]{16,64}$/.test(v);

/** Só baixa de https em domínios do GIPHY (evita o app virar "baixador" de qualquer URL). */
export function isGiphyMediaUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && (url.hostname === 'giphy.com' || url.hostname.endsWith('.giphy.com'));
  } catch {
    return false;
  }
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});

/** Lê a resposta da API e escolhe as versões: prévia pequena e uma versão leve para enviar. */
export function parseSearchResponse(body: unknown, offset: number): GiphyPage {
  const root = obj(body);
  const data = Array.isArray(root.data) ? root.data : [];
  const results: GiphyResult[] = [];
  for (const item of data) {
    const it = obj(item);
    const images = obj(it.images);
    const pick = (...names: string[]) => {
      for (const n of names) {
        const url = obj(images[n]).url;
        if (isGiphyMediaUrl(url)) return url;
      }
      return null;
    };
    const previewUrl = pick('fixed_width_small', 'fixed_width_downsampled', 'fixed_width');
    // Versão de 200 px de altura: leve para a rede local e do tamanho certo para a conversa.
    const sendUrl = pick('fixed_height', 'downsized', 'original');
    if (typeof it.id !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(it.id) || !previewUrl || !sendUrl) continue;
    results.push({ id: it.id, title: typeof it.title === 'string' ? it.title.slice(0, 120) : 'GIF', previewUrl, sendUrl });
  }
  const pagination = obj(root.pagination);
  const total = typeof pagination.total_count === 'number' ? pagination.total_count : 0;
  const nextOffset = offset + data.length;
  return { results, next: data.length > 0 && nextOffset < total ? nextOffset : null };
}

function friendlyNetworkError(err: unknown): Error {
  const e = err as Error & { cause?: { code?: string } };
  const code = e.cause?.code ?? '';
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return new Error('O GIPHY demorou para responder. Tente de novo.');
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|ECONNRESET/.test(code) || e.name === 'TypeError') {
    return new Error('Sem conexão com a internet: o GIPHY precisa de internet (o resto do Chat LAN funciona normalmente).');
  }
  return e instanceof Error ? e : new Error(String(err));
}

async function download(url: string, maxBytes: number): Promise<Uint8Array> {
  if (!isGiphyMediaUrl(url)) throw new Error('Endereço de GIF inválido');
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw friendlyNetworkError(err);
  }
  if (!res.ok) throw new Error(`O GIPHY respondeu com erro (${res.status})`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error('GIF grande demais');
  const data = new Uint8Array(await res.arrayBuffer());
  if (data.byteLength > maxBytes) throw new Error('GIF grande demais');
  const mime = detectImageMime(data);
  if (mime !== 'image/gif' && mime !== 'image/webp') throw new Error('O GIPHY devolveu um arquivo que não é GIF');
  return data;
}

export interface GiphyPreview {
  id: string;
  title: string;
  data: Uint8Array;
}

export class GiphyClient {
  /** Resultados já vistos, para enviar pelo id sem aceitar URL vinda da interface. */
  private readonly known = new Map<string, GiphyResult>();

  constructor(private readonly getKey: () => string | null) {}

  async search(query: string, offset = 0): Promise<{ items: GiphyPreview[]; next: number | null }> {
    const key = this.getKey();
    if (!key) throw new Error('Informe a chave de API do GIPHY para buscar GIFs.');
    const q = query.trim().slice(0, 50);
    const params = new URLSearchParams({
      api_key: key,
      limit: String(PAGE_SIZE),
      offset: String(Math.max(0, Math.min(4999, Math.floor(offset)))),
      rating: 'pg',
      lang: 'pt',
    });
    if (q) params.set('q', q);

    let res: Response;
    try {
      res = await fetch(`${API}/${q ? 'search' : 'trending'}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw friendlyNetworkError(err);
    }
    if (res.status === 401 || res.status === 403) throw new Error('Chave de API do GIPHY inválida.');
    if (res.status === 429) throw new Error('Limite de buscas do GIPHY atingido. Tente daqui a pouco.');
    if (!res.ok) throw new Error(`O GIPHY respondeu com erro (${res.status})`);

    const page = parseSearchResponse(await res.json(), offset);
    for (const r of page.results) this.known.set(r.id, r);

    // Baixa as prévias com poucas conexões ao mesmo tempo; prévia que falhar é pulada.
    const items: Array<GiphyPreview | null> = new Array(page.results.length).fill(null);
    let cursor = 0;
    const worker = async () => {
      while (cursor < page.results.length) {
        const i = cursor++;
        const r = page.results[i];
        try {
          items[i] = { id: r.id, title: r.title, data: await download(r.previewUrl, MAX_PREVIEW_BYTES) };
        } catch {
          items[i] = null;
        }
      }
    };
    await Promise.all(Array.from({ length: PREVIEW_CONCURRENCY }, worker));
    return { items: items.filter((x): x is GiphyPreview => !!x), next: page.next };
  }

  /** Baixa a versão para envio de um GIF que apareceu na busca. */
  async fetchForSending(id: string): Promise<{ title: string; data: Uint8Array }> {
    const r = this.known.get(id);
    if (!r) throw new Error('GIF não encontrado. Busque de novo.');
    return { title: r.title, data: await download(r.sendUrl, MAX_IMAGE_BYTES) };
  }
}
