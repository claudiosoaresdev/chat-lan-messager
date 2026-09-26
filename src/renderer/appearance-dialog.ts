// Janela "Aparência": modo (Sistema/Claro/Escuro) e tema (cor + fonte sugerida), com prévia ao vivo.
// Prévia: cada escolha pinta esta janela na hora e pede ao main um broadcast de prévia (previewAppearance), que
// vale para todas as janelas abertas sem salvar. Cancelar/Esc pede a volta ao que está salvo; OK salva.
import type { MessageFont } from '../shared/protocol';
import { THEMES, findTheme, themeTokens, type Appearance, type AppearanceMode, type Theme } from '../shared/themes';
import { TOKEN_NAMES } from '../shared/theme-tokens';
import { applyAppearance, currentAppearance, effectiveMode, onAppearanceApplied } from './appearance';
import { $, chat, el, errorMessage } from './dom';
import { currentFont } from './font';
import { ensureFontLoaded, fontStack } from './font-loader';

const els = {
  dialog: $<HTMLDialogElement>('appearance-dialog'),
  modes: $('appearance-mode'),
  themes: $('appearance-themes'),
  custom: $('appearance-custom'),
  restore: $<HTMLButtonElement>('appearance-restore'),
  ok: $<HTMLButtonElement>('appearance-ok'),
  cancel: $<HTMLButtonElement>('appearance-cancel'),
};

/** O que estava valendo ao abrir (volta no Cancelar). */
let original: Appearance = currentAppearance();
let originalFont: MessageFont = currentFont();
/** Escolhas em prévia; só são salvas no OK. */
let draft: Appearance = original;
let draftFont: MessageFont = originalFont;
let dirty = false;

/** Fonte sugerida do tema no lugar da do usuário: mantém tamanho, cor e sublinhado; peso normal, sem itálico. */
const withThemeFont = (font: MessageFont, theme: Theme): MessageFont => ({
  ...font,
  family: theme.font,
  weight: 400,
  bold: false,
  italic: false,
});

const sameFont = (a: MessageFont, b: MessageFont) => JSON.stringify(a) === JSON.stringify(b);

const draftTheme = () => findTheme(draft.theme) ?? THEMES[0];

// ---------------------------------------------------------------- desenho

/** Radiogroup com "roving tabindex": só o item marcado entra no Tab. */
function markRadios(group: HTMLElement, isOn: (b: HTMLElement) => boolean) {
  group.querySelectorAll<HTMLElement>('[role="radio"]').forEach((b) => {
    const on = isOn(b);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
    b.classList.toggle('is-selected', on);
  });
}

/** Mini-janela do tema: as variáveis do tema ficam no próprio cartão, então ele se pinta com a paleta dele. */
function themeCard(theme: Theme) {
  const card = el('button', 'theme-card');
  card.type = 'button';
  card.setAttribute('role', 'radio');
  card.dataset.theme = theme.id;
  card.setAttribute('aria-label', `${theme.name}, fonte ${theme.font}`);

  const preview = el('span', 'theme-preview');
  preview.setAttribute('aria-hidden', 'true');
  const tokens = themeTokens(theme.id, effectiveMode(draft));
  for (const name of TOKEN_NAMES) preview.style.setProperty(`--${name}`, tokens[name]);
  const body = el('span', 'tp-body');
  const mine = el('span', 'tp-line tp-mine', 'Oi! Tudo bem?');
  const theirs = el('span', 'tp-line tp-theirs', 'Tudo ótimo :)');
  for (const line of [mine, theirs]) line.style.fontFamily = fontStack(theme.font);
  body.append(mine, theirs);
  preview.append(el('span', 'tp-title'), el('span', 'tp-header'), body);

  const font = el('span', 'theme-font', theme.font);
  font.style.fontFamily = fontStack(theme.font);
  // Favoritas vêm embutidas no app: carregam sem rede.
  void ensureFontLoaded(theme.font);

  card.append(preview, el('span', 'theme-name', theme.name), font);
  card.addEventListener('click', () => pickTheme(theme));
  return card;
}

/** Modo em que as mini-janelas foram desenhadas (só redesenha se ele mudar). */
let cardsMode = '';

function renderThemes() {
  cardsMode = effectiveMode(draft);
  const focused = els.themes.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.theme : undefined;
  els.themes.replaceChildren(...THEMES.map(themeCard));
  if (focused) els.themes.querySelector<HTMLElement>(`[data-theme="${focused}"]`)?.focus();
}

function render() {
  markRadios(els.modes, (b) => b.dataset.mode === draft.mode);
  markRadios(els.themes, (b) => b.dataset.theme === draft.theme);
  els.custom.hidden = draftFont.family === draftTheme().font;
}

// ---------------------------------------------------------------- prévia

function preview(font?: MessageFont) {
  dirty = true;
  applyAppearance(draft);
  void chat()
    .previewAppearance(draft, font)
    .catch((err) => console.warn(errorMessage(err)));
  render();
}

function pickMode(mode: AppearanceMode) {
  if (mode === draft.mode) return;
  draft = { ...draft, mode };
  preview();
}

function pickTheme(theme: Theme) {
  if (theme.id === draft.theme && draftFont.family === theme.font) return;
  draft = { ...draft, theme: theme.id };
  draftFont = withThemeFont(draftFont, theme);
  preview(draftFont);
}

// ---------------------------------------------------------------- teclado

/** Setas movem e marcam dentro do radiogroup (na grade, ↑/↓ pulam uma linha). */
function radioKeys(group: HTMLElement, columns: () => number) {
  group.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns(), ArrowDown: columns() }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
    const i = radios.findIndex((r) => r.getAttribute('aria-checked') === 'true');
    const next = radios[Math.max(0, Math.min(radios.length - 1, i + step))];
    next?.click();
    next?.focus();
  });
}

const gridColumns = () => getComputedStyle(els.themes).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
radioKeys(els.modes, () => 1);
radioKeys(els.themes, gridColumns);

els.modes.querySelectorAll<HTMLButtonElement>('.mode-option').forEach((b) =>
  b.addEventListener('click', () => pickMode(b.dataset.mode as AppearanceMode)),
);

// ---------------------------------------------------------------- abrir, OK e Cancelar

function cancel() {
  if (dirty) {
    applyAppearance(original);
    void chat()
      .previewAppearance(null)
      .catch((err) => console.warn(errorMessage(err)));
  }
  dirty = false;
  els.dialog.close();
}

async function confirm() {
  try {
    if (!sameFont(draftFont, originalFont)) await chat().setFont(draftFont);
    await chat().setAppearance(draft);
    dirty = false;
    els.dialog.close();
  } catch (err) {
    console.warn(errorMessage(err));
    cancel();
  }
}

els.restore.addEventListener('click', () => {
  draftFont = withThemeFont(draftFont, draftTheme());
  preview(draftFont);
  els.themes.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
});
els.cancel.addEventListener('click', cancel);
els.ok.addEventListener('click', () => void confirm());
// Esc: o <dialog> dispara "cancel"; restaura a prévia em vez de só fechar.
els.dialog.addEventListener('cancel', (e) => {
  e.preventDefault();
  cancel();
});
// Enter confirma (OK é o botão padrão), menos sobre Cancelar e "Restaurar tema".
els.dialog.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target === els.cancel || e.target === els.restore) return;
  e.preventDefault();
  void confirm();
});

// Modo "Sistema" com o SO trocando claro/escuro: as mini-janelas acompanham.
onAppearanceApplied((_a, mode) => {
  if (!els.dialog.open || mode === cardsMode) return;
  renderThemes();
  render();
});

export function openAppearanceDialog() {
  original = currentAppearance();
  originalFont = currentFont();
  draft = { ...original };
  draftFont = originalFont;
  dirty = false;
  renderThemes();
  render();
  els.dialog.showModal();
  els.themes.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
}
