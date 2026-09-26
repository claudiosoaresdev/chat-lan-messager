import { describe, expect, it } from 'vitest';
import { JPEG_QUALITIES, centerCropRect } from './image-crop';

describe('centerCropRect', () => {
  it('foto em pé vira 16:9 cortando em cima e embaixo', () => {
    expect(centerCropRect(900, 1600, 16, 9)).toEqual({ sx: 0, sy: (1600 - 506.25) / 2, sw: 900, sh: 506.25 });
  });

  it('panorâmica vira 16:9 cortando os lados', () => {
    expect(centerCropRect(3200, 900, 16, 9)).toEqual({ sx: 800, sy: 0, sw: 1600, sh: 900 });
  });

  it('já 16:9: a imagem inteira', () => {
    expect(centerCropRect(1920, 1080, 1600, 900)).toEqual({ sx: 0, sy: 0, sw: 1920, sh: 1080 });
  });

  it('quadrado para a imagem de exibição', () => {
    expect(centerCropRect(300, 200, 128, 128)).toEqual({ sx: 50, sy: 0, sw: 200, sh: 200 });
  });

  it('qualidades JPEG decrescem', () => {
    for (let i = 1; i < JPEG_QUALITIES.length; i++) expect(JPEG_QUALITIES[i]).toBeLessThan(JPEG_QUALITIES[i - 1]);
  });
});
