import { describe, expect, it } from 'vitest';
import { jpegSize, pngSize } from './image-size';
import { jpegHeader, pngHeader } from './test-images';

describe('pngSize', () => {
  it('lê largura e altura do IHDR', () => {
    expect(pngSize(pngHeader(1600, 900))).toEqual({ width: 1600, height: 900 });
    expect(pngSize(pngHeader(10000, 10000))).toEqual({ width: 10000, height: 10000 });
  });

  it('exige IHDR como primeiro bloco e cabeçalho inteiro', () => {
    const other = pngHeader(10, 10);
    other.set([0x74, 0x45, 0x58, 0x74], 12); // tEXt
    expect(pngSize(other)).toBeNull();
    const badLength = pngHeader(10, 10);
    badLength[11] = 14;
    expect(pngSize(badLength)).toBeNull();
    expect(pngSize(pngHeader(10, 10).slice(0, 20))).toBeNull();
    expect(pngSize(Uint8Array.from([1, 2, 3]))).toBeNull();
  });
});

describe('jpegSize', () => {
  it('acha o SOF0 depois de outros segmentos', () => {
    expect(jpegSize(jpegHeader(1600, 900))).toEqual({ width: 1600, height: 900 });
  });

  it('aceita SOF2 (progressivo)', () => {
    const b = jpegHeader(800, 450);
    b[b.indexOf(0xc0)] = 0xc2;
    expect(jpegSize(b)).toEqual({ width: 800, height: 450 });
  });

  it('recusa sem SOF, com SOS antes, cortado ou embaralhado', () => {
    expect(jpegSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    expect(jpegSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6]))).toBeNull();
    const full = jpegHeader(1600, 900);
    expect(jpegSize(full.slice(0, 26))).toBeNull();
    expect(jpegSize(Uint8Array.from([0xff, 0xd8, 0x12, 0x34, 0x56]))).toBeNull();
    // tamanho de segmento que passa do fim
    expect(jpegSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0, 0]))).toBeNull();
    // SOF3 (sem perdas) não conta
    const sof3 = jpegHeader(10, 10);
    sof3[sof3.indexOf(0xc0)] = 0xc3;
    expect(jpegSize(sof3)).toBeNull();
  });
});
