// Catálogo do Google Fonts embutido no app (gerado por scripts/update-google-fonts.mjs): lista e busca offline.
import catalog from './google-fonts.json';
import { weightsOf, type FontCategory, type FontEntry } from '../main/google-css';

const entries = catalog.fonts as FontEntry[];
const byName = new Map(entries.map((e) => [e[0], e]));

/** As mais populares do Google (vêm embutidas no app). */
export const FAVORITE_FONTS: readonly string[] = catalog.favorites;

export const findGoogleFont = (family: string): FontEntry | undefined => byName.get(family);
export const googleFontNames = (): string[] => entries.map((e) => e[0]);
export const fontWeights = (family: string): number[] => weightsOf(byName.get(family)?.[2] ?? 0);
export const hasItalic = (family: string): boolean => byName.get(family)?.[3] === 1;
export const fontCategory = (family: string): FontCategory | undefined => byName.get(family)?.[1];

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Nomes que contêm o texto (sem maiúsculas/acentos); os que começam com ele vêm primeiro. */
export function searchFonts(query: string): string[] {
  const q = fold(query);
  const names = googleFontNames();
  if (!q) return names;
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of names) {
    const n = fold(name);
    if (n.startsWith(q)) starts.push(name);
    else if (n.includes(q)) contains.push(name);
  }
  return [...starts, ...contains];
}
