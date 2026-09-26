import { describe, expect, it } from 'vitest';
import {
  averageColor,
  contrast,
  ensureContrast,
  isDarkNeutral,
  messageColor,
  hslToRgb,
  luminance,
  mapColors,
  opaqueColors,
  parseHex,
  rgbToHsl,
  rotateHue,
  shiftLightness,
  toHex,
} from './color';

describe('cor', () => {
  it('lê e escreve #hex', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('#0B3F92')).toEqual({ r: 11, g: 63, b: 146 });
    expect(parseHex('#0b3f9280')).toEqual({ r: 11, g: 63, b: 146 });
    expect(toHex({ r: 11, g: 63, b: 146 })).toBe('#0b3f92');
    expect(() => parseHex('azul')).toThrow();
  });

  it('HSL ida e volta', () => {
    for (const hex of ['#0b3f92', '#6fbe44', '#e8a13a', '#777777', '#ffffff', '#000000']) {
      expect(toHex(hslToRgb(rgbToHsl(parseHex(hex))))).toBe(hex);
    }
    expect(rgbToHsl(parseHex('#ff0000'))).toEqual({ h: 0, s: 1, l: 0.5 });
  });

  it('luminância e contraste WCAG', () => {
    expect(luminance('#fff')).toBeCloseTo(1);
    expect(luminance('#000')).toBe(0);
    expect(contrast('#000', '#fff')).toBeCloseTo(21);
    expect(contrast('#fff', '#000')).toBeCloseTo(21);
    expect(contrast('#777', '#fff')).toBeCloseTo(4.48, 2);
  });

  it('gira o matiz e escala a saturação', () => {
    expect(rotateHue('#ff0000', 120)).toBe('#00ff00');
    expect(rotateHue('#ff0000', -120)).toBe('#0000ff');
    expect(rotateHue('#ff0000', 0, 0)).toBe('#808080');
    expect(rotateHue('#777777', 90)).toBe('#777777');
  });

  it('clareia e escurece', () => {
    expect(shiftLightness('#808080', 0.5)).toBe('#ffffff');
    expect(shiftLightness('#808080', -1)).toBe('#000000');
  });

  it('mapColors troca só as cores e preserva o resto do degradê', () => {
    const grad = 'linear-gradient(180deg, #ff0000 0%, #00ff00 46%, var(--glow) 50%, transparent)';
    expect(mapColors(grad, (c) => rotateHue(c, 120))).toBe(
      'linear-gradient(180deg, #00ff00 0%, #0000ff 46%, var(--glow) 50%, transparent)',
    );
  });

  it('mapColors trata rgb()/rgba() mantendo o alfa', () => {
    const v = 'radial-gradient(60% 90% at 100% 0%, rgba(255, 0, 0, 0.22), rgba(255,0,0,0) 70%), rgb(0, 0, 255)';
    expect(mapColors(v, (c) => rotateHue(c, 120))).toBe(
      'radial-gradient(60% 90% at 100% 0%, rgba(0, 255, 0, 0.22), rgba(0, 255, 0, 0) 70%), rgb(255, 0, 0)',
    );
  });

  it('mapColors mantém o alfa de #rgba e #rrggbbaa', () => {
    expect(mapColors('#f008 #ff000080', (c) => rotateHue(c, 120))).toBe('#00ff0088 #00ff0080');
  });

  it('média das cores opacas de um degradê', () => {
    const v = 'radial-gradient(rgba(255, 255, 255, 0.9), rgba(255,255,255,0)), linear-gradient(#000000, #ffffff)';
    expect(opaqueColors(v)).toEqual(['#000000', '#ffffff']);
    expect(averageColor(v)).toBe('#808080');
    expect(averageColor('#123456')).toBe('#123456');
    expect(() => averageColor('transparent')).toThrow();
  });
});

describe('ensureContrast', () => {
  it('mantém a cor que já contrasta', () => {
    expect(ensureContrast('#000000', '#ffffff', 3)).toBe('#000000');
    expect(ensureContrast('#0B3F92', '#fff', 3)).toBe('#0b3f92');
  });

  it('clareia no fundo escuro e escurece no claro, até o mínimo', () => {
    const dark = '#20262f';
    const black = ensureContrast('#000000', dark, 3);
    expect(contrast(black, dark)).toBeGreaterThanOrEqual(3);
    expect(luminance(black)).toBeGreaterThan(luminance(dark));

    const navy = ensureContrast('#000080', dark, 3);
    expect(contrast(navy, dark)).toBeGreaterThanOrEqual(3);
    // mantém o matiz
    expect(Math.round(rgbToHsl(parseHex(navy)).h)).toBe(240);

    const yellow = ensureContrast('#ffff66', '#ffffff', 3);
    expect(contrast(yellow, '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(luminance(yellow)).toBeLessThan(luminance('#ffff66'));
  });

  it('muda o mínimo possível (não vai além do necessário)', () => {
    const dark = '#20262f';
    const out = ensureContrast('#000000', dark, 3);
    const hsl = rgbToHsl(parseHex(out));
    const lessLight = toHex(hslToRgb({ ...hsl, l: hsl.l - 0.01 }));
    expect(contrast(lessLight, dark)).toBeLessThan(3);
  });
});

describe('messageColor', () => {
  const DARK = '#20262f';
  const TEXT = '#e3e9f1';
  const PALETTE = ['#000000', '#595959', '#800000', '#d40000', '#e46c0a', '#7f4f1f', '#808000', '#008000', '#008080',
    '#006d8f', '#000080', '#0050c8', '#5b2c9f', '#800080', '#c000c0', '#d6337f'];

  it('preto e cinza escuro são neutros; cores e cinzas claros não', () => {
    expect(isDarkNeutral('#000000')).toBe(true);
    expect(isDarkNeutral('#595959')).toBe(true);
    expect(isDarkNeutral('#000080')).toBe(false);
    expect(isDarkNeutral('#808080')).toBe(false);
  });

  it('no escuro, neutros viram o texto do tema', () => {
    expect(messageColor('#000000', DARK, 'dark', TEXT)).toBe(TEXT);
    expect(messageColor('#595959', DARK, 'dark', 'var(--text)')).toBe('var(--text)');
  });

  it('no escuro, as demais cores ficam com 4,5:1 e o mesmo matiz', () => {
    for (const c of PALETTE.filter((c) => !isDarkNeutral(c))) {
      const out = messageColor(c, DARK, 'dark', TEXT);
      expect(contrast(out, DARK)).toBeGreaterThanOrEqual(4.5);
      expect(Math.abs(rgbToHsl(parseHex(out)).h - rgbToHsl(parseHex(c)).h)).toBeLessThan(2);
    }
  });

  it('no claro, a paleta fica como escolhida no fundo branco (3:1) e o preto continua preto', () => {
    for (const c of PALETTE) expect(messageColor(c, '#ffffff', 'light', TEXT)).toBe(c);
    const yellow = messageColor('#ffff66', '#ffffff', 'light', TEXT);
    expect(contrast(yellow, '#ffffff')).toBeGreaterThanOrEqual(3);
  });
});
