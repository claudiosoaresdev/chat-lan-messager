// Dimensões de uma imagem lidas do cabeçalho, sem decodificar: barra imagens pequenas no disco que viram
// bitmaps enormes na memória (bomba de descompressão).

export interface ImageSize {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/** PNG: o primeiro bloco tem de ser IHDR (tamanho 13); largura e altura nos bytes 16–23. */
export function pngSize(b: Uint8Array): ImageSize | null {
  if (b.length < 33 || !PNG_SIGNATURE.every((x, i) => b[i] === x)) return null;
  if (u32(b, 8) !== 13 || String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null;
  return { width: u32(b, 16), height: u32(b, 20) };
}

/** JPEG: percorre os marcadores até o primeiro SOF0/1/2 (FFC0/FFC1/FFC2); sem ele (ou com SOS antes), null. */
export function jpegSize(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    // bytes de preenchimento (FF FF ...)
    while (i < b.length && b[i] === 0xff) i++;
    if (i >= b.length) return null;
    const marker = b[i];
    i++;
    // marcadores sem segmento
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    // fim da imagem ou início dos dados antes de um SOF: sem dimensões
    if (marker === 0xd9 || marker === 0xda) return null;
    if (i + 2 > b.length) return null;
    const length = u16(b, i);
    if (length < 2 || i + length > b.length) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (length < 7) return null;
      return { width: u16(b, i + 5), height: u16(b, i + 3) };
    }
    i += length;
  }
  return null;
}

export function imageSize(b: Uint8Array, mime: 'image/png' | 'image/jpeg'): ImageSize | null {
  return mime === 'image/png' ? pngSize(b) : jpegSize(b);
}
