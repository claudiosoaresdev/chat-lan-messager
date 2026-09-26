// Medidas de uma cena a partir dos pixels (RGBA de um canvas), sem DOM: dá para testar.
//  - tom da faixa de cima: qual cor de texto (clara ou escura) fica mais legível sobre ela, e se a imagem é
//    "agitada" (o texto precisa de uma faixa translúcida atrás);
//  - cor média da imagem inteira: com o véu, dá o fundo efetivo das mensagens (messageBackground).
import { contrast, luminance, toHex, type Rgb } from '../shared/color';

export type SceneToneName = 'light' | 'dark';

export interface SceneTone {
  /** 'dark' = cena escura (texto claro por cima); 'light' = cena clara (texto escuro). */
  tone: SceneToneName;
  /** A cor escolhida não alcança 4,5:1 em toda a faixa (ou a imagem varia muito): texto ganha faixa translúcida. */
  busy: boolean;
  /** Luminância relativa média da faixa (0–1). */
  luminance: number;
  /** Desvio padrão da luminância relativa na faixa. */
  deviation: number;
}

/** Acima deste desvio de luminância a faixa é "agitada" mesmo que o contraste pareça bom. */
export const BUSY_DEVIATION = 0.12;
/** Fração dos pixels mais desfavoráveis tolerada antes de pedir a faixa translúcida. */
export const BUSY_TAIL = 0.05;

function pixels(rgba: ArrayLike<number>): Rgb[] {
  const out: Rgb[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) out.push({ r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] });
  return out;
}

/** Valor no percentil `p` (0–1) de uma lista (ordena uma cópia). */
function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
}

/**
 * Tom da faixa de cima. Para cada candidata (texto claro `onDark`, texto escuro `onLight`) calcula o contraste
 * com cada pixel e fica com a que tem o melhor contraste nos 5% piores pixels. "Agitada" quando mesmo a
 * escolhida fica abaixo de 4,5:1 nesses pixels, ou quando o desvio de luminância passa de BUSY_DEVIATION.
 */
export function sceneTone(rgba: ArrayLike<number>, onDark: string, onLight: string): SceneTone {
  const px = pixels(rgba);
  if (px.length === 0) return { tone: 'light', busy: false, luminance: 1, deviation: 0 };
  const lums = px.map((p) => luminance(p));
  const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
  const deviation = Math.sqrt(lums.reduce((a, l) => a + (l - mean) ** 2, 0) / lums.length);
  const worst = (text: string) => percentile(px.map((p) => contrast(text, p)), BUSY_TAIL);
  const [dark, light] = [worst(onDark), worst(onLight)];
  const tone: SceneToneName = dark >= light ? 'dark' : 'light';
  const busy = Math.max(dark, light) < 4.5 || deviation > BUSY_DEVIATION;
  return { tone, busy, luminance: mean, deviation };
}

/** Cor média (sRGB, como o navegador mistura) dos pixels. */
export function averagePixels(rgba: ArrayLike<number>): string {
  const px = pixels(rgba);
  if (px.length === 0) return '#808080';
  const sum = px.reduce((a, p) => ({ r: a.r + p.r, g: a.g + p.g, b: a.b + p.b }), { r: 0, g: 0, b: 0 });
  return toHex({ r: sum.r / px.length, g: sum.g / px.length, b: sum.b / px.length });
}

/**
 * Recorte "cover" com posição `center top` (como o CSS do topo): que parte da imagem (em pixels dela) aparece
 * nos primeiros `bandH` pixels de uma caixa `boxW`×`boxH`.
 */
export function coverTopBand(imgW: number, imgH: number, boxW: number, boxH: number, bandH: number) {
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const sw = boxW / scale;
  return { sx: (imgW - sw) / 2, sy: 0, sw, sh: Math.min(imgH, bandH / scale) };
}
