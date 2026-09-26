// Temas de cor: o Azul clássico tem os dois conjuntos desenhados à mão (theme-tokens.ts); os demais giram o
// matiz (e escalam a saturação) dos tokens cromáticos do Azul clássico e depois corrigem o contraste.
import { averageColor, contrast, luminance, mapColors, parseHex, rgbToHsl, rotateHue, shiftLightness } from './color';
import { validateSceneChoice, type SceneChoice } from './scenes';
import { CLASSIC_DARK, CLASSIC_LIGHT, TOKEN_NAMES, type TokenName, type Tokens } from './theme-tokens';

export type ThemeMode = 'light' | 'dark';

export interface Theme {
  id: string;
  name: string;
  /** Cor representativa (cartão do tema). */
  swatch: string;
  /** Rotação de matiz em graus a partir do Azul clássico e escala de saturação. */
  hue: number;
  saturation: number;
  /** Fonte sugerida das mensagens (favorita do Google ou clássica). */
  font: string;
  /** Cena padrão (id da galeria em scenes.ts). */
  scene: string;
}

/** Azul médio do Azul clássico; o cartão de cada tema mostra esta cor girada. */
const BASE_SWATCH = '#2f6fc4';

const theme = (id: string, name: string, hue: number, saturation: number, font: string, scene: string): Theme => ({
  id,
  name,
  swatch: rotateHue(BASE_SWATCH, hue, saturation),
  hue,
  saturation,
  font,
  scene,
});

export const THEMES: readonly Theme[] = [
  theme('azul-classico', 'Azul clássico', 0, 1, 'Segoe UI', 'ceu'),
  theme('verde', 'Verde', -82, 0.9, 'Nunito', 'folhas'),
  theme('rosa', 'Rosa', 113, 0.85, 'Raleway', 'petalas'),
  theme('roxo', 'Roxo', 53, 0.9, 'Rubik', 'aurora'),
  theme('laranja', 'Laranja', 171, 1, 'Manrope', 'por-do-sol'),
  theme('menta', 'Menta', -50, 0.8, 'DM Sans', 'ondas'),
  theme('vermelho', 'Vermelho', 138, 0.95, 'Oswald', 'brasas'),
  theme('grafite', 'Grafite', 0, 0.15, 'Inter', 'pontilhado'),
];

export const DEFAULT_THEME = 'azul-classico';

export function findTheme(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

/** Modo escolhido pelo usuário: 'system' segue o sistema operacional. */
export type AppearanceMode = 'system' | ThemeMode;

export interface Appearance {
  mode: AppearanceMode;
  theme: string;
  /** Cena escolhida; null = a cena padrão do tema. */
  scene: SceneChoice | null;
}

export const DEFAULT_APPEARANCE: Appearance = { mode: 'system', theme: DEFAULT_THEME, scene: null };

/** Cena que vale de fato: a escolhida ou, sem escolha, a padrão do tema. */
export function effectiveScene(a: Appearance): SceneChoice {
  return a.scene ?? { kind: 'builtin', id: (findTheme(a.theme) ?? THEMES[0]).scene };
}

export const isAppearanceMode = (v: unknown): v is AppearanceMode => v === 'system' || v === 'light' || v === 'dark';

/**
 * Valida uma aparência vinda do disco ou da IPC; null se inválida. Cena ausente ou inválida vira null (a do
 * tema): arquivo de versão antiga continua valendo. Se a imagem própria ainda existe, quem confere é o main.
 */
export function validateAppearance(raw: unknown): Appearance | null {
  const a = raw as Partial<Appearance> | null;
  if (!a || typeof a !== 'object') return null;
  if (!isAppearanceMode(a.mode) || typeof a.theme !== 'string' || !findTheme(a.theme)) return null;
  return { mode: a.mode, theme: a.theme, scene: validateSceneChoice(a.scene) };
}

/** Tokens de significado próprio (aviso, erro, não lida, winks, contador verde): não giram com o tema. */
const SEMANTIC = new Set<TokenName>([
  'accent-green',
  'warning-bg',
  'warning-bg-hover',
  'warning-border',
  'error-bg',
  'error-border',
  'unread',
  'unread-soft',
  'unread-strong',
  'unread-text',
  'wink-bg',
  'wink-text',
  'gif-text',
]);

/** Abaixo desta saturação HSL a cor é tratada como neutra (cinza, branco, preto) e não gira. */
const CHROMATIC = 0.15;

export interface ContrastPair {
  fg: TokenName;
  bg: TokenName;
  /** 4,5 para texto; 3 para bordas e ícones de controle (WCAG 1.4.11). */
  min: number;
  /** Qual lado a correção automática mexe (o texto, ou o fundo quando o texto é fixo, como branco). */
  fix: 'fg' | 'bg';
}

const text = (fg: TokenName, bg: TokenName, fix: 'fg' | 'bg' = 'fg'): ContrastPair => ({ fg, bg, min: 4.5, fix });
const ui = (fg: TokenName, bg: TokenName): ContrastPair => ({ fg, bg, min: 3, fix: 'fg' });

/** Pares verificados em todo tema × modo. Degradês entram pela média das cores opacas. */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  text('text', 'bg'),
  text('text', 'surface'),
  text('text', 'field-bg'),
  text('text-strong', 'bg'),
  text('text-strong', 'surface'),
  text('muted', 'surface'),
  text('muted', 'bg'),
  text('link', 'surface'),
  text('link', 'bg'),
  // mensagens do contato usam o destaque como cor de texto
  text('accent', 'surface'),
  text('accent-text', 'accent', 'bg'),
  // fonte selecionada em "Alterar fonte"
  text('accent-text', 'selection', 'bg'),
  // contador de não lidas
  text('accent-text', 'accent-green', 'bg'),
  text('title-text', 'title-glass'),
  text('text-strong', 'header-bg'),
  text('text', 'login-bg'),
  text('text-strong', 'row-hover'),
  text('text-strong', 'row-focus'),
  text('text-strong', 'row-selected'),
  text('text', 'menu-hover'),
  text('text', 'btn-face'),
  text('text', 'warning-bg'),
  text('text', 'warning-bg-hover'),
  text('link', 'warning-bg'),
  text('text', 'error-bg'),
  text('unread-text', 'unread-soft'),
  text('text-strong', 'unread-soft'),
  text('text-strong', 'unread-strong'),
  text('wink-text', 'wink-bg'),
  text('gif-text', 'bg'),
  ui('btn-focus', 'surface'),
  ui('btn-focus', 'field-bg'),
  ui('border-strong', 'surface'),
  ui('titlebtn-icon', 'titlebtn-bg'),
  ui('field-border', 'field-bg'),
  ui('box-border', 'field-bg'),
];

export const pairKey = (p: ContrastPair) => `${p.fg}/${p.bg}`;

/**
 * Pares em que o Azul clássico claro, igual ao visual original do MSN, fica abaixo do mínimo. O conjunto é
 * mantido idêntico ao original de propósito; os temas derivados, que passam pela correção, cumprem todos.
 * - muted: #6b7a90 sobre branco dá 4,36:1 (quase AA);
 * - texto branco sobre a seleção (#3399ff) e sobre o verde do contador (#6fbe44): cores do WLM;
 * - bordas claras dos campos (#9db6d9, #abbdd3): ~2:1, o campo se distingue pela sombra interna e o foco.
 */
export const CLASSIC_LIGHT_EXEMPT: ReadonlySet<string> = new Set([
  'muted/surface',
  'muted/bg',
  'accent-text/selection',
  'accent-text/accent-green',
  'field-border/field-bg',
  'box-border/field-bg',
]);

/** Contraste de um par (degradês pela média das cores opacas). */
export function pairContrast(tokens: Tokens, p: ContrastPair): number {
  return contrast(averageColor(tokens[p.fg]), averageColor(tokens[p.bg]));
}

function rotateTokens(base: Tokens, hue: number, saturation: number): Tokens {
  const out = { ...base };
  for (const name of TOKEN_NAMES) {
    if (SEMANTIC.has(name)) continue;
    out[name] = mapColors(base[name], (hex) =>
      rgbToHsl(parseHex(hex)).s > CHROMATIC ? rotateHue(hex, hue, saturation) : hex,
    );
  }
  return out;
}

/**
 * Correção por luminância: afasta o lado indicado do par (texto ou fundo) da luminância do outro, em passos de
 * 1% de luminosidade HSL, até atingir o mínimo. Repete até estabilizar, pois um token pode estar em vários pares.
 */
export function fixContrast(tokens: Tokens): Tokens {
  const out = { ...tokens };
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const p of CONTRAST_PAIRS) {
      const [move, other] = p.fix === 'fg' ? [p.fg, p.bg] : [p.bg, p.fg];
      const direction = luminance(averageColor(out[move])) < luminance(averageColor(out[other])) ? -1 : 1;
      for (let step = 0; step < 100 && pairContrast(out, p) < p.min; step++) {
        out[move] = mapColors(out[move], (hex) => shiftLightness(hex, direction * 0.01));
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

const cache = new Map<string, Tokens>();

/** Tokens do tema no modo: Azul clássico usa os conjuntos à mão; os demais giram os tokens cromáticos. */
export function themeTokens(id: string, mode: ThemeMode): Tokens {
  const t = findTheme(id) ?? findTheme(DEFAULT_THEME);
  if (!t) throw new Error('tema padrão ausente');
  const base = mode === 'dark' ? CLASSIC_DARK : CLASSIC_LIGHT;
  if (t.id === DEFAULT_THEME) return { ...base };
  const key = `${t.id}:${mode}`;
  let tokens = cache.get(key);
  if (!tokens) {
    tokens = fixContrast(rotateTokens(base, t.hue, t.saturation));
    cache.set(key, tokens);
  }
  return { ...tokens };
}
