// Fontes do Google Fonts no disco: favoritas embutidas no app, as demais baixadas uma vez e guardadas.
// Só baixa famílias do catálogo, só de fonts.googleapis.com / fonts.gstatic.com, com limite de tamanho.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { findGoogleFont } from '../shared/google-fonts';
import { GOOGLE_USER_AGENT, css2Url, fontSlug, parseFontFaces } from './google-css';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_FAMILY_BYTES = 12 * 1024 * 1024;

export interface FontFaceFile {
  weight: number;
  style: 'normal' | 'italic';
  unicodeRange: string;
  /** Relativo à pasta de fontes (favoritas: public/fonts; baixadas: <slug>/<arquivo>). */
  file: string;
}

/** Face pronta para o renderer registrar com a API FontFace. */
export interface FontFaceInfo {
  weight: number;
  style: 'normal' | 'italic';
  unicodeRange: string;
  url: string;
}

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

const FILE_NAME = /^[0-9a-f]{16}\.woff2$/;

export class FontCache {
  private readonly inFlight = new Map<string, Promise<FontFaceInfo[]>>();

  constructor(
    /** userData/fonts */
    private readonly dir: string,
    /** public/fonts/manifest.json das favoritas embutidas */
    private readonly bundled: Record<string, FontFaceFile[]>,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  ensure(family: string): Promise<FontFaceInfo[]> {
    const embedded = this.bundled[family];
    if (embedded) return Promise.resolve(embedded.map((f) => toInfo(f, `fonts/${f.file}`)));
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
    const urlOf = (f: FontFaceFile) => `chatfont://cache/${f.file}`;

    try {
      const saved = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as FontFaceFile[];
      if (Array.isArray(saved) && saved.length) return saved.map((f) => toInfo(f, urlOf(f)));
    } catch {
      // ainda não baixada
    }

    const cssRes = await this.fetchImpl(css2Url(entry), { headers: { 'User-Agent': GOOGLE_USER_AGENT } });
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
        const res = await this.fetchImpl(face.src);
        if (!res.ok) throw new Error(`Download da fonte falhou (${res.status})`);
        const data = Buffer.from(await res.arrayBuffer());
        if (data.length > MAX_FILE_BYTES) throw new Error('Arquivo de fonte grande demais');
        total += data.length;
        if (total > MAX_FAMILY_BYTES) throw new Error('Família de fonte grande demais');
        name = `${createHash('sha1').update(face.src).digest('hex').slice(0, 16)}.woff2`;
        fs.writeFileSync(path.join(folder, name), data);
        files.set(face.src, name);
      }
      manifest.push({ weight: face.weight, style: face.style, unicodeRange: face.unicodeRange, file: `${slug}/${name}` });
    }
    // Manifesto por último: só existe quando todos os arquivos já estão no disco.
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    return manifest.map((f) => toInfo(f, urlOf(f)));
  }
}

function toInfo(f: FontFaceFile, url: string): FontFaceInfo {
  return { weight: f.weight, style: f.style, unicodeRange: f.unicodeRange, url };
}
