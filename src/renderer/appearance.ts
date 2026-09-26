// Aparência no renderer: modo (claro/escuro) em data-mode no <html> e tokens do tema como propriedades CSS.
// "Sistema" segue o prefers-color-scheme (o main ajusta o nativeTheme, então o matchMedia acompanha).
import { DEFAULT_APPEARANCE, themeTokens, validateAppearance, type Appearance, type ThemeMode } from '../shared/themes';
import { TOKEN_NAMES } from '../shared/theme-tokens';
import { chat } from './dom';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

let shown: Appearance = { ...DEFAULT_APPEARANCE };
const listeners: Array<(a: Appearance, mode: ThemeMode) => void> = [];

export const currentAppearance = (): Appearance => shown;

export function effectiveMode(a: Appearance = shown): ThemeMode {
  if (a.mode === 'system') return darkQuery.matches ? 'dark' : 'light';
  return a.mode;
}

/** Avisa depois que as cores mudaram (ex.: reajustar a cor das mensagens para o fundo novo). */
export function onAppearanceApplied(fn: (a: Appearance, mode: ThemeMode) => void) {
  listeners.push(fn);
}

function paint(theme: string, mode: ThemeMode) {
  const root = document.documentElement;
  root.dataset.mode = mode;
  const tokens = themeTokens(theme, mode);
  for (const name of TOKEN_NAMES) root.style.setProperty(`--${name}`, tokens[name]);
}

/** Aplica a aparência nesta janela (salva ou em prévia). */
export function applyAppearance(a: Appearance) {
  shown = a;
  const mode = effectiveMode(a);
  paint(a.theme, mode);
  listeners.forEach((fn) => fn(a, mode));
}

/**
 * Chamado antes de qualquer tela. Pinta já com o modo efetivo e o tema que o main pôs na URL (sem flash), depois
 * confirma pela IPC e passa a seguir as mudanças (outra janela, prévia da janela "Aparência", sistema).
 */
export function initAppearance() {
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode');
  const theme = params.get('theme');
  if ((mode === 'light' || mode === 'dark') && theme) {
    const initial = validateAppearance({ mode, theme });
    if (initial) paint(initial.theme, initial.mode as ThemeMode);
  }
  chat().onAppearanceChanged(applyAppearance);
  darkQuery.addEventListener('change', () => {
    if (shown.mode === 'system') applyAppearance(shown);
  });
  void chat()
    .getAppearance()
    .then(applyAppearance)
    .catch(() => applyAppearance(shown));
}
