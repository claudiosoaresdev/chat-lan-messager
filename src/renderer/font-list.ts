// Modelo do diálogo "Alterar fonte" (sem DOM): linhas da lista de famílias, pesos e itálico.
import {
  FAVORITE_FONTS,
  findGoogleFont,
  fontWeights,
  foldFontName,
  googleFontNames,
  hasItalic,
  searchFonts,
} from '../shared/google-fonts';
import { CLASSIC_FONTS } from '../shared/protocol';

/** Máximo de fontes do Google mostradas de uma vez (a lista inteira tem ~1.800). */
export const GOOGLE_LIMIT = 400;

export type FontGroup = 'favorite' | 'classic' | 'google';

export type FamilyRow =
  { kind: 'section'; label: string } | { kind: 'font'; family: string; group: FontGroup } | { kind: 'more' } | { kind: 'empty' };

const favorites = new Set(FAVORITE_FONTS);
const classics = new Set<string>(CLASSIC_FONTS);

export const isClassicFont = (family: string) => classics.has(family);
export const isFavoriteFont = (family: string) => favorites.has(family);

const groupOf = (family: string): FontGroup => (classics.has(family) ? 'classic' : favorites.has(family) ? 'favorite' : 'google');

/** Até `limit` fontes do Google; a escolhida entra mesmo fora do recorte; "Refine…" se sobrou. */
function googleRows(names: string[], selected: string, limit: number): FamilyRow[] {
  const shown = names.slice(0, limit);
  const rows: FamilyRow[] = shown.map((family) => ({
    kind: 'font',
    family,
    group: groupOf(family),
  }));
  if (names.length > limit && !shown.includes(selected) && names.includes(selected)) {
    rows.push({ kind: 'font', family: selected, group: groupOf(selected) });
  }
  if (names.length > limit) rows.push({ kind: 'more' });
  return rows;
}

/**
 * Linhas da lista de famílias. Sem busca: seções Favoritas / Clássicas / Google Fonts (sem as favoritas).
 * Com busca: sem seções; clássicas que casam e depois `searchFonts`.
 */
export function familyRows(query: string, selected: string, limit = GOOGLE_LIMIT): FamilyRow[] {
  const q = foldFontName(query);
  if (!q) {
    return [
      { kind: 'section', label: '★ Favoritas' },
      ...FAVORITE_FONTS.map((family): FamilyRow => ({
        kind: 'font',
        family,
        group: 'favorite',
      })),
      { kind: 'section', label: 'Clássicas do sistema' },
      ...CLASSIC_FONTS.map((family): FamilyRow => ({
        kind: 'font',
        family,
        group: 'classic',
      })),
      { kind: 'section', label: 'Google Fonts' },
      ...googleRows(
        googleFontNames().filter((n) => !favorites.has(n)),
        selected,
        limit,
      ),
    ];
  }
  const rows: FamilyRow[] = [
    ...CLASSIC_FONTS.filter((n) => foldFontName(n).includes(q)).map((family): FamilyRow => ({
      kind: 'font',
      family,
      group: 'classic',
    })),
    ...googleRows(searchFonts(query), selected, limit),
  ];
  return rows.length ? rows : [{ kind: 'empty' }];
}

export const WEIGHT_NAMES: Record<number, string> = {
  100: 'Fina',
  200: 'Extraleve',
  300: 'Leve',
  400: 'Normal',
  500: 'Média',
  600: 'Seminegrito',
  700: 'Negrito',
  800: 'Extranegrito',
  900: 'Preta',
};

export const weightLabel = (weight: number) => `${WEIGHT_NAMES[weight] ?? 'Peso'} ${weight}`;

/** Pesos disponíveis: clássicas só normal e negrito; Google conforme o catálogo. */
export function familyWeights(family: string): number[] {
  if (!findGoogleFont(family)) return [400, 700];
  const weights = fontWeights(family);
  return weights.length ? weights : [400];
}

/** Clássicas sempre têm itálico (o sistema inclina se precisar); Google conforme o catálogo. */
export const familyHasItalic = (family: string) => !findGoogleFont(family) || hasItalic(family);

/** Peso disponível mais próximo (empate: o mais leve). */
export function nearestWeight(weights: readonly number[], weight: number): number {
  let best = weights[0] ?? 400;
  for (const w of weights) if (Math.abs(w - weight) < Math.abs(best - weight)) best = w;
  return best;
}
