// Cabeçalhos mínimos de imagem para os testes (sem pixels): o suficiente para assinatura e dimensões.

/** PNG com IHDR declarando largura × altura. */
export function pngHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const v = new DataView(b.buffer);
  v.setUint32(8, 13);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  v.setUint32(16, width);
  v.setUint32(20, height);
  b.set([8, 2, 0, 0, 0], 24);
  return b;
}

/** JPEG com APP0 e SOF0 declarando largura × altura; `extra` bytes no fim (para variar o conteúdo). */
export function jpegHeader(width: number, height: number, extra: number[] = []): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03];
  sof0.push(0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01);
  return Uint8Array.from([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9, ...extra]);
}
