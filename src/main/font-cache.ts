// Fontes do Google Fonts no disco: favoritas embutidas no app, as demais baixadas uma vez e guardadas.
// Só baixa famílias do catálogo, só de fonts.googleapis.com / fonts.gstatic.com, com limite de tamanho,
// de tempo, de downloads simultâneos e de espaço total em disco (LRU por família).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FontFaceInfo } from '../shared/api';
import { findGoogleFont } from '../shared/google-fonts';
import { GOOGLE_USER_AGENT, css2Url, fontSlug, parseFontFaces, type FontEntry } from '../shared/google-css';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_FAMILY_BYTES = 12 * 1024 * 1024;
/** Espaço total ocupado pelas famílias baixadas (não conta as favoritas embutidas). */
export const MAX_CACHE_BYTES = 300 * 1024 * 1024;
/** Famílias baixando ao mesmo tempo; o resto espera na fila. */
export const DOWNLOAD_CONCURRENCY = 2;
/** Depois de uma falha, a família é rejeitada de cara por esse tempo antes de tentar de novo. */
export const FAILURE_TTL_MS = 10 * 60 * 1000;
/** Tempo máximo por requisição de rede (CSS ou arquivo). */
const FETCH_TIMEOUT_MS = 15_000;

export interface FontFaceFile {
  weight: number;
  style: 'normal' | 'italic';
  unicodeRange: string;
  /** Relativo à pasta de fontes (favoritas: public/fonts; baixadas: <slug>/<arquivo>). */
  file: string;
}

/** Face pronta para o renderer registrar com a API FontFace (tipo único, em shared/api). */
export type { FontFaceInfo };

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface FontCacheOptions {
  /** Relógio injetável (testes); por padrão `Date.now`. */
  now?: () => number;
  /** Downloads de famílias diferentes em paralelo (bullet C.1). */
  maxConcurrent?: number;
  /** Janela de "não tenta de novo" depois de uma falha (bullet C.2). */
  failureTtlMs?: number;
  maxFileBytes?: number;
  maxFamilyBytes?: number;
  /** Limite de espaço total das famílias baixadas; passado esse valor, remove as menos usadas (bullet C.6). */
  maxCacheBytes?: number;
}

const FILE_NAME = /^[0-9a-f]{16}\.woff2$/;

/** Limita quantas tarefas assíncronas rodam ao mesmo tempo; o resto espera a vez em ordem de chegada. */
class DownloadQueue {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(job: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await job();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release() {
    this.active--;
    const next = this.waiting.shift();
    if (next) {
      this.active++;
      next();
    }
  }
}

export class FontCache {
  private readonly dir: string;
  private readonly now: () => number;
  private readonly maxConcurrent: number;
  private readonly failureTtlMs: number;
  private readonly maxFileBytes: number;
  private readonly maxFamilyBytes: number;
  private readonly maxCacheBytes: number;

  private readonly queue: DownloadQueue;
  private readonly inFlight = new Map<string, Promise<FontFaceInfo[]>>();
  /** Manifestos já lidos (do disco ou recém-baixados), para não bater no disco a cada chamada. */
  private readonly manifestCache = new Map<string, FontFaceFile[]>();
  /** family → instante (via `now()`) da última falha; ver `failureTtlMs`. */
  private readonly failures = new Map<string, number>();

  constructor(
    /** userData/fonts */
    dir: string,
    /** public/fonts/manifest.json das favoritas embutidas */
    private readonly bundled: Record<string, FontFaceFile[]>,
    private readonly fetchImpl: FetchLike = fetch,
    options: FontCacheOptions = {},
  ) {
    this.dir = path.resolve(dir);
    this.now = options.now ?? Date.now;
    this.maxConcurrent = options.maxConcurrent ?? DOWNLOAD_CONCURRENCY;
    this.failureTtlMs = options.failureTtlMs ?? FAILURE_TTL_MS;
    this.maxFileBytes = options.maxFileBytes ?? MAX_FILE_BYTES;
    this.maxFamilyBytes = options.maxFamilyBytes ?? MAX_FAMILY_BYTES;
    this.maxCacheBytes = options.maxCacheBytes ?? MAX_CACHE_BYTES;
    this.queue = new DownloadQueue(this.maxConcurrent);
  }

  ensure(family: string): Promise<FontFaceInfo[]> {
    // Object.hasOwn (não `bundled[family]`): "constructor", "toString" etc. não devem "achar"
    // uma entrada herdada de Object.prototype.
    if (Object.hasOwn(this.bundled, family)) {
      return Promise.resolve(this.bundled[family].map((f) => toInfo(f, `fonts/${f.file}`)));
    }

    const cached = this.manifestCache.get(family);
    if (cached) {
      this.touchManifest(fontSlug(family));
      return Promise.resolve(cached.map((f) => toInfo(f, `chatfont://cache/${f.file}`)));
    }

    const failedAt = this.failures.get(family);
    if (failedAt !== undefined && this.now() - failedAt < this.failureTtlMs) {
      return Promise.reject(new Error(`Falha recente ao baixar ${family}; tente de novo mais tarde`));
    }

    const running = this.inFlight.get(family);
    if (running) return running;
    const job = this.load(family).finally(() => this.inFlight.delete(family));
    this.inFlight.set(family, job);
    return job;
  }

  /** chatfont://cache/<slug>/<arquivo>.woff2 → caminho no disco, ou null se sair da pasta. */
  resolveFile(url: string): string | null {
    const m = /^chatfont:\/\/cache\/([a-z0-9-]+)\/([^/]+)$/.exec(url);
    if (!m || !FILE_NAME.test(m[2])) return null;
    const file = path.join(this.dir, m[1], m[2]);
    return file.startsWith(this.dir + path.sep) ? file : null;
  }

  private async load(family: string): Promise<FontFaceInfo[]> {
    const entry = findGoogleFont(family);
    if (!entry) throw new Error(`Fonte desconhecida: ${family}`);
    const slug = fontSlug(family);
    const folder = path.join(this.dir, slug);
    const manifestFile = path.join(folder, 'manifest.json');

    const saved = readManifest(manifestFile);
    if (saved) {
      this.manifestCache.set(family, saved);
      this.touchManifest(slug);
      return saved.map((f) => toInfo(f, `chatfont://cache/${f.file}`));
    }

    try {
      return await this.queue.run(() => this.download(family, entry, slug, folder, manifestFile));
    } catch (err) {
      // Nunca deixa lixo parcial (arquivos sem manifesto, ou manifesto sem todos os arquivos).
      fs.rmSync(folder, { recursive: true, force: true });
      this.failures.set(family, this.now());
      throw err;
    }
  }

  private async download(
    family: string,
    entry: FontEntry,
    slug: string,
    folder: string,
    manifestFile: string,
  ): Promise<FontFaceInfo[]> {
    const cssRes = await this.fetchImpl(css2Url(entry), {
      headers: { 'User-Agent': GOOGLE_USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'error',
    });
    if (!cssRes.ok) throw new Error(`Google Fonts respondeu ${cssRes.status}`);
    const faces = parseFontFaces(await cssRes.text());
    if (!faces.length) throw new Error(`Nenhuma face válida para ${family}`);

    fs.mkdirSync(folder, { recursive: true });
    const files = new Map<string, string>();
    let total = 0;
    const manifest: FontFaceFile[] = [];
    for (const face of faces) {
      let name = files.get(face.src);
      if (!name) {
        const res = await this.fetchImpl(face.src, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error' });
        if (!res.ok) throw new Error(`Download da fonte falhou (${res.status})`);
        const declared = Number(res.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > this.maxFileBytes) throw new Error('Arquivo de fonte grande demais');
        const data = Buffer.from(await res.arrayBuffer());
        if (data.length > this.maxFileBytes) throw new Error('Arquivo de fonte grande demais');
        total += data.length;
        if (total > this.maxFamilyBytes) throw new Error('Família de fonte grande demais');
        name = `${createHash('sha1').update(face.src).digest('hex').slice(0, 16)}.woff2`;
        fs.writeFileSync(path.join(folder, name), data);
        files.set(face.src, name);
      }
      manifest.push({ weight: face.weight, style: face.style, unicodeRange: face.unicodeRange, file: `${slug}/${name}` });
    }
    // Manifesto por último: só existe quando todos os arquivos já estão no disco.
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    this.manifestCache.set(family, manifest);
    this.evictIfNeeded(slug);
    return manifest.map((f) => toInfo(f, `chatfont://cache/${f.file}`));
  }

  /** Marca a família como usada agora (mtime do manifesto), para a política de LRU do bullet C.6. */
  private touchManifest(slug: string) {
    const t = new Date(this.now());
    try {
      fs.utimesSync(path.join(this.dir, slug, 'manifest.json'), t, t);
    } catch {
      // sem manifesto (favorita, ou ainda sem cache em disco): nada a marcar
    }
  }

  /** Se o total baixado passou do limite, remove pastas inteiras da menos usada para a mais usada,
   * nunca a família que acabou de ser baixada (`justDownloaded`). */
  private evictIfNeeded(justDownloaded: string) {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(this.dir, { withFileTypes: true });
    } catch {
      return;
    }

    const families: { slug: string; folder: string; size: number; mtimeMs: number }[] = [];
    let total = 0;
    for (const d of dirents) {
      if (!d.isDirectory()) continue;
      const folder = path.join(this.dir, d.name);
      const manifestFile = path.join(folder, 'manifest.json');
      let mtimeMs: number;
      try {
        mtimeMs = fs.statSync(manifestFile).mtimeMs;
      } catch {
        continue; // pasta sem manifesto: não é (ou não terminou de ser) uma família em cache
      }
      const size = folderSize(folder);
      total += size;
      families.push({ slug: d.name, folder, size, mtimeMs });
    }

    if (total <= this.maxCacheBytes) return;
    families.sort((a, b) => a.mtimeMs - b.mtimeMs); // mais antiga primeiro
    for (const fam of families) {
      if (total <= this.maxCacheBytes) break;
      if (fam.slug === justDownloaded) continue;
      fs.rmSync(fam.folder, { recursive: true, force: true });
      total -= fam.size;
      for (const [family] of this.manifestCache) {
        if (fontSlug(family) === fam.slug) this.manifestCache.delete(family);
      }
    }
  }
}

function readManifest(manifestFile: string): FontFaceFile[] | null {
  try {
    const saved = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as FontFaceFile[];
    return Array.isArray(saved) && saved.length ? saved : null;
  } catch {
    return null; // ainda não baixada
  }
}

function folderSize(folder: string): number {
  let total = 0;
  for (const name of fs.readdirSync(folder)) {
    try {
      total += fs.statSync(path.join(folder, name)).size;
    } catch {
      // arquivo pode ter sumido entre o readdir e o stat; ignora
    }
  }
  return total;
}

function toInfo(f: FontFaceFile, url: string): FontFaceInfo {
  return { weight: f.weight, style: f.style, unicodeRange: f.unicodeRange, url };
}
