// Recorte central de imagens no canvas (imagem de exibição 1:1, cena 16:9) e codificação com limite de tamanho.

/** Maior retângulo central de uma imagem `w`×`h` na proporção `tw`:`th` (em pixels da imagem). */
export function centerCropRect(w: number, h: number, tw: number, th: number) {
  const target = tw / th;
  const sw = w / h > target ? h * target : w;
  const sh = w / h > target ? h : w / target;
  return { sx: (w - sw) / 2, sy: (h - sh) / 2, sw, sh };
}

/** Qualidades JPEG tentadas, da melhor para a pior, até caber no limite. */
export const JPEG_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.35] as const;

/** Desenha o recorte central da imagem (arquivo ou bytes) num canvas `width`×`height`. */
export async function cropToCanvas(blob: Blob, width: number, height: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const r = centerCropRect(img.naturalWidth || width, img.naturalHeight || height, width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Não foi possível processar a imagem');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const encodeCanvas = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível processar a imagem'))), type, quality),
  );

/** JPEG com qualidade decrescente até caber em `maxBytes`. */
export async function encodeJpegWithin(canvas: HTMLCanvasElement, maxBytes: number): Promise<Uint8Array> {
  for (const q of JPEG_QUALITIES) {
    const out = await encodeCanvas(canvas, 'image/jpeg', q);
    if (out.size <= maxBytes) return new Uint8Array(await out.arrayBuffer());
  }
  throw new Error('Imagem detalhada demais: não coube em 400 KB');
}
