// CSS do Google Fonts (API css2): monta a URL e lê as @font-face.
// Sem dependências: usado pelo main (FontCache) e por scripts/update-google-fonts.mjs (Node roda .ts direto).

export type FontCategory = 'sans' | 'serif' | 'display' | 'handwriting' | 'mono';
/** [família, categoria, máscara de pesos (bit 0 = 100 … bit 8 = 900), tem itálico] */
export type FontEntry = [family: string, category: FontCategory, weightMask: number, italic: 0 | 1];

export interface FontFaceSource {
  weight: number;
  style: 'normal' | 'italic';
  unicodeRange: string;
  /** https://fonts.gstatic.com/… .woff2 */
  src: string;
}

/** Navegador moderno: o Google só manda woff2 (e com unicode-range) para esses. */
export const GOOGLE_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** Subconjuntos guardados: português e demais línguas latinas. */
const KEEP_SUBSETS = new Set(['latin', 'latin-ext']);

export function weightsOf(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 9; i++) if (mask & (1 << i)) out.push((i + 1) * 100);
  return out;
}

export function fontSlug(family: string): string {
  return family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function css2Url([family, , mask, italic]: FontEntry): string {
  const specs: string[] = [];
  for (const ital of italic ? [0, 1] : [0]) for (const w of weightsOf(mask)) specs.push(`${ital},${w}`);
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:ital,wght@${specs.join(';')}&display=swap`;
}

export function parseFontFaces(css: string): FontFaceSource[] {
  // Comentário livre (não só nome de subconjunto): fontes tipo CJK (ex.: Noto Sans JP) numeram
  // fatias como `/* [12] */`, que não é um subconjunto válido, e não podem ser confundidas com
  // "sem comentário".
  const blocks = /(?:\/\*\s*([^*]*?)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
  const matches = [...css.matchAll(blocks)];
  // Quando a resposta rotula alguns blocos com o subconjunto (latin, latin-ext, cyrillic, …),
  // qualquer bloco sem rótulo reconhecido — comentado ou não — é de outro subconjunto (ex.: as
  // dezenas de fatias de CJK) e deve ser descartado; só quando NENHUM bloco tem comentário é que
  // a fonte não distingue subconjuntos e todos os blocos são aceitos.
  const anyLabelled = matches.some(([, subset]) => subset !== undefined);
  const out: FontFaceSource[] = [];
  for (const [, subset, body] of matches) {
    if (anyLabelled && !KEEP_SUBSETS.has(subset ?? '')) continue;
    const weight = Number(/font-weight:\s*(\d{3})\s*;/.exec(body)?.[1]);
    const style = /font-style:\s*italic/.test(body) ? 'italic' : 'normal';
    const src = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[A-Za-z0-9._/-]+\.woff2)\)/.exec(body)?.[1];
    const unicodeRange = /unicode-range:\s*([U+0-9A-Fa-f?,\s-]+);/.exec(body)?.[1].trim() ?? '';
    if (!src || !(weight >= 100 && weight <= 900)) continue;
    out.push({ weight, style, unicodeRange, src });
  }
  return out;
}
