// Posição da janela flutuante de vídeo (picture-in-picture). Sem Electron aqui (testável).

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const VIDEO_DEFAULT = { width: 480, height: 270 };
export const VIDEO_MIN = { width: 240, height: 135 };
/** Distância da borda da tela em que a janela, ao ser solta, encosta nela. */
export const SNAP_PX = 24;
/** Folga da borda para a posição padrão (canto inferior direito). */
const MARGIN = 16;

/** Solta perto da borda da área útil: encosta (cada eixo por si). */
export function snapToEdge(b: Rect, area: Rect, threshold = SNAP_PX): Rect {
  let { x, y } = b;
  if (Math.abs(x - area.x) <= threshold) x = area.x;
  else if (Math.abs(area.x + area.width - (x + b.width)) <= threshold) x = area.x + area.width - b.width;
  if (Math.abs(y - area.y) <= threshold) y = area.y;
  else if (Math.abs(area.y + area.height - (y + b.height)) <= threshold) y = area.y + area.height - b.height;
  return { ...b, x, y };
}

/** Canto inferior direito da área útil, como o PiP dos navegadores. */
export function defaultBounds(area: Rect): Rect {
  const width = Math.min(VIDEO_DEFAULT.width, area.width);
  const height = Math.min(VIDEO_DEFAULT.height, area.height);
  return { x: area.x + area.width - width - MARGIN, y: area.y + area.height - height - MARGIN, width, height };
}

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/**
 * Posição salva, se ainda couber numa tela (monitor desligado, resolução trocada): precisa ter ao menos metade da
 * janela visível em alguma área útil; o tamanho é limitado ao da tela e ao mínimo. Senão, null.
 */
export function restoreBounds(saved: Rect | null, areas: Rect[]): Rect | null {
  if (!saved) return null;
  const area = areas
    .map((a) => ({ a, o: overlap(saved, a) }))
    .sort((p, q) => q.o - p.o)[0];
  if (!area || area.o < (saved.width * saved.height) / 2) return null;
  const width = Math.max(VIDEO_MIN.width, Math.min(saved.width, area.a.width));
  const height = Math.max(VIDEO_MIN.height, Math.min(saved.height, area.a.height));
  const x = Math.min(Math.max(saved.x, area.a.x), area.a.x + area.a.width - width);
  const y = Math.min(Math.max(saved.y, area.a.y), area.a.y + area.a.height - height);
  return { x, y, width, height };
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) < 100_000;

/** Valida a posição lida do disco. */
export function parseBounds(raw: unknown): Rect | null {
  const r = raw as Partial<Rect> | null;
  if (!r || typeof r !== 'object') return null;
  if (!isInt(r.x) || !isInt(r.y) || !isInt(r.width) || !isInt(r.height)) return null;
  if (r.width < VIDEO_MIN.width || r.height < VIDEO_MIN.height) return null;
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}
