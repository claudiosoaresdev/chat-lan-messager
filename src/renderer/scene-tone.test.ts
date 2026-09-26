import { describe, expect, it } from 'vitest';
import { averagePixels, coverTopBand, sceneColors, sceneTone } from './scene-tone';

const ON_DARK = '#ffffff';
const ON_LIGHT = '#14181e';

/** RGBA de `n` pixels gerados por `fn(i)`. */
function image(n: number, fn: (i: number) => [number, number, number]) {
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) out.set([...fn(i), 255], i * 4);
  return out;
}

describe('sceneTone', () => {
  it('céu claro: texto escuro, sem faixa', () => {
    const t = sceneTone(image(400, () => [200, 225, 250]), ON_DARK, ON_LIGHT);
    expect(t).toMatchObject({ tone: 'light', busy: false });
  });

  it('noite: texto claro, sem faixa', () => {
    const t = sceneTone(image(400, () => [20, 30, 70]), ON_DARK, ON_LIGHT);
    expect(t).toMatchObject({ tone: 'dark', busy: false });
  });

  it('meio-tom (nenhuma das duas chega a 4,5:1): pede faixa', () => {
    const t = sceneTone(image(400, () => [121, 121, 121]), ON_DARK, ON_LIGHT);
    expect(t.busy).toBe(true);
  });

  it('xadrez preto e branco: agitada', () => {
    const t = sceneTone(image(400, (i) => (((i % 20) + Math.floor(i / 20)) % 2 ? [255, 255, 255] : [0, 0, 0])), ON_DARK, ON_LIGHT);
    expect(t.busy).toBe(true);
    expect(t.deviation).toBeGreaterThan(0.4);
  });

  it('poucos pixels ruins (1%) não pedem faixa', () => {
    const t = sceneTone(image(400, (i) => (i < 4 ? [255, 255, 255] : [10, 10, 30])), ON_DARK, ON_LIGHT);
    expect(t).toMatchObject({ tone: 'dark', busy: false });
  });

  it('sem pixels: claro e calmo', () => {
    expect(sceneTone(new Uint8ClampedArray(0), ON_DARK, ON_LIGHT)).toMatchObject({ tone: 'light', busy: false });
  });
});

describe('averagePixels', () => {
  it('média sRGB', () => {
    expect(averagePixels(image(2, (i) => (i ? [255, 255, 255] : [0, 0, 0])))).toBe('#808080');
    expect(averagePixels(image(3, () => [16, 32, 64]))).toBe('#102040');
  });
});

describe('coverTopBand', () => {
  it('caixa mais larga que a imagem (conversa): usa a largura toda e só o começo da altura', () => {
    // 1600×900 numa caixa 900×95 → escala 0,5625; 62 px de faixa = 110 px da imagem
    const r = coverTopBand(1600, 900, 900, 95, 62);
    expect(r.sx).toBeCloseTo(0);
    expect(r.sw).toBeCloseTo(1600);
    expect(r.sh).toBeCloseTo(62 / 0.5625);
  });

  it('caixa mais alta que a proporção da imagem: corta os lados, centrado', () => {
    const r = coverTopBand(1600, 900, 100, 100, 50);
    expect(r.sw).toBeCloseTo(900);
    expect(r.sx).toBeCloseTo(350);
    expect(r.sh).toBeCloseTo(450);
  });
});

describe('sceneColors', () => {
  it('metade preta, metade branca: média cinza, extremos puros', () => {
    expect(sceneColors(image(100, (i) => (i < 50 ? [0, 0, 0] : [255, 255, 255])))).toEqual({
      average: '#808080',
      dark: '#000000',
      light: '#ffffff',
    });
  });

  it('extremos são percentis (5 e 95), não o mínimo e o máximo', () => {
    // 2% de pixels pretos e 2% brancos num fundo cinza: ficam de fora
    const c = sceneColors(image(100, (i) => (i < 2 ? [0, 0, 0] : i >= 98 ? [255, 255, 255] : [100, 100, 100])));
    expect(c.dark).toBe('#646464');
    expect(c.light).toBe('#646464');
  });
});
