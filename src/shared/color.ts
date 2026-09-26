// Utilitários de cor (sRGB) para gerar e verificar os temas.

export interface Rgb {
  /** 0–255 */
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  l: number;
}

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Lê `#rgb`, `#rgba`, `#rrggbb` ou `#rrggbbaa` (o alfa é ignorado). */
export function parseHex(hex: string): Rgb {
  const m = HEX.exec(hex.trim());
  if (!m) throw new Error(`cor inválida: ${hex}`);
  let h = m[1];
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const byte = (v: number) => clamp(Math.round(v), 0, 255);

export function toHex({ r, g, b }: Rgb): string {
  return '#' + [r, g, b].map((v) => byte(v).toString(16).padStart(2, '0')).join('');
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s: clamp(s, 0, 1), l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

/** Luminância relativa WCAG 2.x (0 = preto, 1 = branco). */
export function luminance(color: string | Rgb): number {
  const { r, g, b } = typeof color === 'string' ? parseHex(color) : color;
  const lin = (v: number) => {
    const c = byte(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Razão de contraste WCAG entre duas cores (1–21). */
export function contrast(a: string | Rgb, b: string | Rgb): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Gira o matiz e escala a saturação de uma cor `#hex`. */
export function rotateHue(hex: string, degrees: number, saturationScale = 1): string {
  const hsl = rgbToHsl(parseHex(hex));
  return toHex(hslToRgb({ h: hsl.h + degrees, s: clamp(hsl.s * saturationScale, 0, 1), l: hsl.l }));
}

/** Soma `delta` à luminosidade HSL de uma cor `#hex` (negativo escurece). */
export function shiftLightness(hex: string, delta: number): string {
  const hsl = rgbToHsl(parseHex(hex));
  return toHex(hslToRgb({ ...hsl, l: clamp(hsl.l + delta, 0, 1) }));
}

const COLOR = /#[0-9a-f]{3,8}\b|\brgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/gi;

/**
 * Aplica `fn` a cada cor literal de um valor CSS (`#hex`, `rgb()`, `rgba()`), inclusive dentro de degradês.
 * O resto do texto (posições, `var(--…)`, `transparent`) fica igual; `rgba()` mantém o alfa.
 */
export function mapColors(value: string, fn: (hex: string) => string): string {
  return value.replace(COLOR, (m, r?: string, g?: string, b?: string, a?: string) => {
    if (m.startsWith('#')) {
      if (!HEX.test(m)) return m;
      const alpha = m.length === 5 ? m.slice(4) + m.slice(4) : m.length === 9 ? m.slice(7) : '';
      return fn(toHex(parseHex(m))) + alpha;
    }
    const out = parseHex(fn(toHex({ r: Number(r), g: Number(g), b: Number(b) })));
    return a === undefined ? `rgb(${out.r}, ${out.g}, ${out.b})` : `rgba(${out.r}, ${out.g}, ${out.b}, ${a})`;
  });
}

/** Cores opacas de um valor CSS, em `#rrggbb` (cores com alfa < 1 ficam de fora). */
export function opaqueColors(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(COLOR)) {
    const [s, r, g, b, a] = m;
    if (s.startsWith('#')) {
      if (!HEX.test(s)) continue;
      if ((s.length === 5 && !/f$/i.test(s)) || (s.length === 9 && !/ff$/i.test(s))) continue;
      out.push(toHex(parseHex(s)));
    } else if (a === undefined || Number(a) >= 1) {
      out.push(toHex({ r: Number(r), g: Number(g), b: Number(b) }));
    }
  }
  return out;
}

/** Média (em sRGB) das cores opacas de um valor: a cor "representativa" de um degradê. */
export function averageColor(value: string): string {
  const colors = opaqueColors(value).map(parseHex);
  if (colors.length === 0) throw new Error(`sem cor opaca: ${value}`);
  const sum = colors.reduce((a, c) => ({ r: a.r + c.r, g: a.g + c.g, b: a.b + c.b }), { r: 0, g: 0, b: 0 });
  return toHex({ r: sum.r / colors.length, g: sum.g / colors.length, b: sum.b / colors.length });
}

/**
 * Garante contraste mínimo de `hex` sobre `bgHex`: se faltar, clareia (fundo escuro) ou escurece (fundo claro)
 * em passos de 1% de luminosidade HSL, mantendo o matiz. Se nem o extremo bastar, devolve o extremo.
 */
export function ensureContrast(hex: string, bgHex: string, min: number): string {
  const color = toHex(parseHex(hex));
  if (contrast(color, bgHex) >= min) return color;
  // Clareia se o branco contrasta mais com o fundo do que o preto.
  const direction = contrast('#ffffff', bgHex) > contrast('#000000', bgHex) ? 1 : -1;
  let out = color;
  for (let step = 1; step <= 100; step++) {
    out = shiftLightness(color, direction * step * 0.01);
    if (contrast(out, bgHex) >= min) return out;
  }
  return out;
}

/** Pretos e cinzas escuros (quase sem saturação e bem escuros): a cor "neutra" das mensagens. */
export function isDarkNeutral(hex: string): boolean {
  const rgb = parseHex(hex);
  return rgbToHsl(rgb).s < 0.12 && luminance(rgb) < 0.2;
}

/**
 * Cor de uma mensagem no fundo `surface` do tema. No escuro: preto e cinzas escuros viram o texto do tema
 * (`text`, a mensagem padrão fica igual ao texto normal) e as demais cores ganham contraste de 4,5:1. No claro:
 * 3:1, o que mantém a paleta do "Alterar fonte" como escolhida no Azul clássico.
 */
export function messageColor(hex: string, surface: string, mode: 'light' | 'dark', text: string): string {
  if (mode === 'dark' && isDarkNeutral(hex)) return text;
  return ensureContrast(hex, surface, mode === 'dark' ? 4.5 : 3);
}
