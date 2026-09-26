import { describe, expect, it } from 'vitest';
import { FAVORITE_FONTS, findGoogleFont, fontWeights, googleFontNames, hasItalic, searchFonts } from './google-fonts';

describe('catálogo do Google Fonts', () => {
  it('tem centenas de famílias e 20 favoritas que existem no catálogo', () => {
    expect(googleFontNames().length).toBeGreaterThan(1000);
    expect(FAVORITE_FONTS).toHaveLength(20);
    for (const name of FAVORITE_FONTS) expect(findGoogleFont(name)).toBeTruthy();
  });

  it('pesos e itálico da família', () => {
    expect(fontWeights('Roboto')).toContain(400);
    expect(fontWeights('Roboto')).toContain(700);
    expect(hasItalic('Roboto')).toBe(true);
    expect(fontWeights('Nao Existe')).toEqual([]);
  });

  it('busca sem diferenciar maiúsculas e acentos, prefixo primeiro', () => {
    const r = searchFonts('ROBO');
    expect(r[0]).toBe('Roboto');
    expect(r.every((n) => n.toLowerCase().includes('robo'))).toBe(true);
    expect(searchFonts('')).toHaveLength(googleFontNames().length);
    expect(searchFonts('ópen sâns')).toContain('Open Sans');
  });
});
