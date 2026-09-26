import { describe, expect, it } from 'vitest';
import { FAVORITE_FONTS, googleFontNames } from '../shared/google-fonts';
import { CLASSIC_FONTS, DEFAULT_FONT } from '../shared/protocol';
import {
  GOOGLE_LIMIT,
  familyHasItalic,
  fitToFamily,
  familyRows,
  familyWeights,
  nearestWeight,
  weightLabel,
  type FamilyRow,
} from './font-list';

const fonts = (rows: FamilyRow[]) => rows.flatMap((r) => (r.kind === 'font' ? [r.family] : []));
const sections = (rows: FamilyRow[]) => rows.flatMap((r) => (r.kind === 'section' ? [r.label] : []));

describe('familyRows', () => {
  it('sem busca: seções Favoritas, Clássicas e Google (sem repetir favoritas), com limite', () => {
    const rows = familyRows('', 'Segoe UI');
    expect(sections(rows)).toEqual(['★ Favoritas', 'Clássicas do sistema', 'Google Fonts']);
    const names = fonts(rows);
    expect(names.slice(0, FAVORITE_FONTS.length)).toEqual([...FAVORITE_FONTS]);
    expect(names.slice(FAVORITE_FONTS.length, FAVORITE_FONTS.length + CLASSIC_FONTS.length)).toEqual([...CLASSIC_FONTS]);
    const google = names.slice(FAVORITE_FONTS.length + CLASSIC_FONTS.length);
    expect(google).toHaveLength(GOOGLE_LIMIT);
    expect(google.some((n) => FAVORITE_FONTS.includes(n))).toBe(false);
    expect(rows.at(-1)).toEqual({ kind: 'more' });
    expect(rows.find((r) => r.kind === 'font' && r.family === 'Arial')).toMatchObject({ group: 'classic' });
    expect(rows.find((r) => r.kind === 'font' && r.family === FAVORITE_FONTS[0])).toMatchObject({ group: 'favorite' });
  });

  it('a família escolhida aparece mesmo fora do recorte', () => {
    const last =
      googleFontNames()
        .filter((n) => !FAVORITE_FONTS.includes(n))
        .at(-1) ?? '';
    const rows = familyRows('', last);
    expect(fonts(rows)).toContain(last);
    expect(rows.at(-1)).toEqual({ kind: 'more' });
    expect(fonts(rows).filter((n) => n === last)).toHaveLength(1);
  });

  it('com busca: sem seções, clássicas que casam primeiro (sem acento/maiúsculas)', () => {
    const rows = familyRows('VERDÁ', 'Segoe UI');
    expect(sections(rows)).toEqual([]);
    expect(fonts(rows)[0]).toBe('Verdana');
    const roboto = familyRows('robo', 'Segoe UI');
    expect(fonts(roboto)[0]).toBe('Roboto');
    expect(roboto.find((r) => r.kind === 'font' && r.family === 'Roboto')).toMatchObject({ group: 'favorite' });
  });

  it('busca sem resultado', () => {
    expect(familyRows('zzzqqqxx', 'Segoe UI')).toEqual([{ kind: 'empty' }]);
  });

  it('busca ampla também é limitada', () => {
    const rows = familyRows('a', 'Segoe UI');
    expect(rows.at(-1)).toEqual({ kind: 'more' });
    expect(rows.filter((r) => r.kind === 'font' && r.group !== 'classic')).toHaveLength(GOOGLE_LIMIT);
  });
});

describe('peso e itálico', () => {
  it('clássicas: normal e negrito, sempre com itálico', () => {
    expect(familyWeights('Arial')).toEqual([400, 700]);
    expect(familyHasItalic('Arial')).toBe(true);
  });

  it('Google: pesos e itálico do catálogo', () => {
    expect(familyWeights('Roboto')).toContain(700);
    expect(familyHasItalic('Roboto')).toBe(true);
  });

  it('peso mais próximo', () => {
    expect(nearestWeight([400, 700], 600)).toBe(700);
    expect(nearestWeight([400, 700], 500)).toBe(400);
    expect(nearestWeight([300, 500], 400)).toBe(300);
    expect(nearestWeight([100], 900)).toBe(100);
    expect(nearestWeight([400, 700], 700)).toBe(700);
  });

  it('rótulo do peso', () => {
    expect(weightLabel(700)).toBe('Negrito 700');
    expect(weightLabel(100)).toBe('Fina 100');
  });

  it('ajusta a fonte à família: peso mais próximo, negrito e itálico', () => {
    const noItalic = googleFontNames().find((n) => !familyHasItalic(n) && familyWeights(n).length === 1) ?? '';
    const w = familyWeights(noItalic)[0];
    const fit = fitToFamily({ ...DEFAULT_FONT, weight: 900, bold: true, italic: true }, noItalic);
    expect(fit).toMatchObject({ family: noItalic, weight: w, bold: w >= 600, italic: false });
    expect(fitToFamily({ ...DEFAULT_FONT, weight: 600, italic: true }, 'Arial')).toMatchObject({
      weight: 700,
      bold: true,
      italic: true,
    });
  });
});
