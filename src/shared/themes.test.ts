import { describe, expect, it } from 'vitest';
import { averageColor, parseHex, rgbToHsl } from './color';
import { isKnownFont } from './protocol';
import { CLASSIC_DARK, CLASSIC_LIGHT, TOKEN_NAMES } from './theme-tokens';
import {
  CLASSIC_LIGHT_EXEMPT,
  CONTRAST_PAIRS,
  DEFAULT_THEME,
  THEMES,
  findTheme,
  pairContrast,
  pairKey,
  themeTokens,
  type ThemeMode,
} from './themes';

const MODES: ThemeMode[] = ['light', 'dark'];

describe('temas', () => {
  it('8 temas, ids únicos, Azul clássico primeiro e padrão', () => {
    expect(THEMES).toHaveLength(8);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(8);
    expect(THEMES[0]).toMatchObject({ id: DEFAULT_THEME, hue: 0, saturation: 1 });
    expect(findTheme('verde')?.name).toBe('Verde');
    expect(findTheme('nada')).toBeUndefined();
  });

  it('fontes sugeridas existem', () => {
    for (const t of THEMES) expect(isKnownFont(t.font), t.font).toBe(true);
  });

  it('Azul clássico usa os conjuntos desenhados à mão', () => {
    expect(themeTokens('azul-classico', 'light')).toEqual(CLASSIC_LIGHT);
    expect(themeTokens('azul-classico', 'dark')).toEqual(CLASSIC_DARK);
    // id desconhecido cai no padrão
    expect(themeTokens('nada', 'light')).toEqual(CLASSIC_LIGHT);
  });

  it('todo tema × modo tem todos os tokens, com valores não vazios', () => {
    for (const t of THEMES)
      for (const m of MODES) {
        const tokens = themeTokens(t.id, m);
        expect(Object.keys(tokens).sort()).toEqual([...TOKEN_NAMES].sort());
        for (const n of TOKEN_NAMES) expect(tokens[n], `${t.id}/${m}/${n}`).not.toBe('');
      }
  });

  it('degradês mantêm a estrutura depois de girar', () => {
    const verde = themeTokens('verde', 'light');
    expect(verde['header-bg']).toMatch(/^radial-gradient\(60% 90% at 100% 0%, rgba\(/);
    expect(verde['window-glow']).toContain('var(--glow)');
  });

  it('tokens de significado (aviso, não lida, winks) não mudam com o tema', () => {
    for (const m of MODES) {
      const base = themeTokens('azul-classico', m);
      for (const t of THEMES) {
        const tokens = themeTokens(t.id, m);
        for (const n of ['warning-bg', 'unread', 'unread-text', 'wink-bg', 'wink-text'] as const) expect(tokens[n]).toBe(base[n]);
      }
    }
  });

  it('o matiz muda de fato: o destaque de cada tema é diferente', () => {
    for (const m of MODES) {
      const accents = THEMES.map((t) => themeTokens(t.id, m).accent);
      expect(new Set(accents).size).toBe(THEMES.length);
    }
  });

  it('Grafite é quase cinza', () => {
    for (const m of MODES) {
      const { s } = rgbToHsl(parseHex(averageColor(themeTokens('grafite', m).accent)));
      expect(s).toBeLessThan(0.2);
    }
  });

  it('pares obrigatórios estão na lista', () => {
    const keys = CONTRAST_PAIRS.map(pairKey);
    for (const k of [
      'text/bg',
      'text/surface',
      'muted/surface',
      'link/surface',
      'accent-text/accent',
      'title-text/title-glass',
      'text-strong/row-selected',
      'text-strong/row-focus',
      'text/warning-bg',
      'unread-text/unread-soft',
      'border-strong/surface',
      'btn-focus/surface',
    ])
      expect(keys).toContain(k);
  });

  describe.each(THEMES.flatMap((t) => MODES.map((m) => [t.id, m] as const)))('contraste %s / %s', (id, mode) => {
    const tokens = themeTokens(id, mode);
    const exempt = id === DEFAULT_THEME && mode === 'light' ? CLASSIC_LIGHT_EXEMPT : new Set<string>();
    it.each(CONTRAST_PAIRS.filter((p) => !exempt.has(pairKey(p))).map((p) => [pairKey(p), p] as const))('%s', (_, p) => {
      expect(pairContrast(tokens, p)).toBeGreaterThanOrEqual(p.min);
    });
  });

  it('as exceções do Azul clássico claro ainda são necessárias (lista não fica velha)', () => {
    for (const p of CONTRAST_PAIRS.filter((x) => CLASSIC_LIGHT_EXEMPT.has(pairKey(x))))
      expect(pairContrast(CLASSIC_LIGHT, p), pairKey(p)).toBeLessThan(p.min);
    expect(CONTRAST_PAIRS.filter((x) => CLASSIC_LIGHT_EXEMPT.has(pairKey(x)))).toHaveLength(CLASSIC_LIGHT_EXEMPT.size);
  });
});
