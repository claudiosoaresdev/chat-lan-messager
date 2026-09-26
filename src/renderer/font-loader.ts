// Pilhas de fonte e carregamento das fontes do Google Fonts (baixadas pelo main, registradas com FontFace).
import type { FontCategory } from '../shared/google-css';
import { fontCategory } from '../shared/google-fonts';
import type { ClassicFont } from '../shared/protocol';
import { chat } from './dom';

/** Pilhas de fallback, para a fonte ter equivalente parecido no Mac e no Windows. */
export const FONT_STACKS: Record<ClassicFont, string> = {
  'Segoe UI': "'Segoe UI', Tahoma, 'Helvetica Neue', sans-serif",
  Arial: 'Arial, Helvetica, sans-serif',
  Calibri: "Calibri, Carlito, 'Helvetica Neue', sans-serif",
  'Comic Sans MS': "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', cursive",
  'Courier New': "'Courier New', Courier, monospace",
  Georgia: 'Georgia, serif',
  Impact: "Impact, 'Arial Black', sans-serif",
  'Lucida Console': "'Lucida Console', Monaco, Menlo, monospace",
  Tahoma: 'Tahoma, Verdana, sans-serif',
  'Times New Roman': "'Times New Roman', Times, serif",
  'Trebuchet MS': "'Trebuchet MS', 'Lucida Grande', sans-serif",
  Verdana: 'Verdana, Geneva, sans-serif',
};

/** Enquanto a fonte do Google não carrega (ou sem internet): parecida da mesma categoria. */
const GENERIC: Record<FontCategory, string> = {
  sans: "'Segoe UI', sans-serif",
  display: "'Segoe UI', sans-serif",
  serif: 'Georgia, serif',
  handwriting: "'Comic Sans MS', cursive",
  mono: "'Courier New', monospace",
};

const isClassic = (family: string): family is ClassicFont => Object.hasOwn(FONT_STACKS, family);

/** Valor de font-family para a fonte escolhida: clássica, do Google (com fallback) ou a padrão. */
export function fontStack(family: string): string {
  if (isClassic(family)) return FONT_STACKS[family];
  const category = fontCategory(family);
  return category ? `'${family.replace(/['\\]/g, '')}', ${GENERIC[category]}` : FONT_STACKS['Segoe UI'];
}

export type FontLoadState = 'ready' | 'loading' | 'offline';
const loads = new Map<string, Promise<FontLoadState>>();

/** Registra a família do Google (uma vez). Resolve 'offline' se não deu para baixar. */
export function ensureFontLoaded(family: string): Promise<FontLoadState> {
  if (isClassic(family) || !fontCategory(family)) return Promise.resolve('ready');
  let job = loads.get(family);
  if (!job) {
    job = chat()
      .ensureFont(family)
      .then((faces) => {
        for (const f of faces) {
          const face = new FontFace(family, `url("${f.url}")`, {
            weight: String(f.weight),
            style: f.style,
            ...(f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}),
          });
          document.fonts.add(face);
        }
        return 'ready' as const;
      })
      .catch((err: unknown) => {
        console.warn('[fontes]', family, err instanceof Error ? err.message : err);
        loads.delete(family); // tenta de novo na próxima vez (ex.: voltou a internet)
        return 'offline' as const;
      });
    loads.set(family, job);
  }
  return job;
}
