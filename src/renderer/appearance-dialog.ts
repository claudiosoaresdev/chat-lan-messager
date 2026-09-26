// Janela "Aparência": modo (Sistema/Claro/Escuro), tema (cor + cena e fonte sugeridas) e cena, com prévia ao vivo.
// Prévia: cada escolha pinta esta janela na hora e pede ao main um broadcast de prévia (previewAppearance), que
// vale para todas as janelas abertas sem salvar. Cancelar/Esc pede a volta ao que está salvo; OK salva.
import type { MessageFont } from '../shared/protocol';
import { BUILTIN_SCENES, MAX_SCENE_BYTES, SCENE_HEIGHT, SCENE_WIDTH, type SceneChoice } from '../shared/scenes';
import { THEMES, effectiveScene, findTheme, themeTokens, type Appearance, type AppearanceMode, type Theme } from '../shared/themes';
import { TOKEN_NAMES } from '../shared/theme-tokens';
import { applyAppearance, currentAppearance, effectiveMode, onAppearanceApplied } from './appearance';
import { $, chat, el, errorMessage } from './dom';
import { currentFont } from './font';
import { ensureFontLoaded, fontStack } from './font-loader';
import { cropToCanvas, encodeJpegWithin } from './image-crop';

const els = {
  dialog: $<HTMLDialogElement>('appearance-dialog'),
  modes: $('appearance-mode'),
  themes: $('appearance-themes'),
  custom: $('appearance-custom'),
  scenes: $('appearance-scenes'),
  sceneBrowse: $<HTMLButtonElement>('appearance-scene-browse'),
  sceneFile: $<HTMLInputElement>('appearance-scene-file'),
  sceneError: $('appearance-scene-error'),
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

/** Chave de uma cena ("builtin:ceu", "custom:<id>", "none"): identifica os itens da grade. */
const sceneKey = (c: SceneChoice) => (c.kind === 'none' ? 'none' : `${c.kind}:${c.id}`);

/** A cena padrão do tema escolhida explicitamente conta como "a do tema" (null). */
function normalizeScene(scene: SceneChoice | null, theme: Theme): SceneChoice | null {
  return scene?.kind === 'builtin' && scene.id === theme.scene ? null : scene;
}

const sameScene = (a: SceneChoice | null, b: SceneChoice | null) => (a ? sceneKey(a) : '') === (b ? sceneKey(b) : '');

const sceneUrl = (id: string) => `scenes/${id}.svg`;

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
  const sceneName = BUILTIN_SCENES.find((x) => x.id === theme.scene)?.name ?? theme.scene;
  card.setAttribute('aria-label', `${theme.name}, cena ${sceneName}, fonte ${theme.font}`);

  const preview = el('span', 'theme-preview');
  preview.setAttribute('aria-hidden', 'true');
  const tokens = themeTokens(theme.id, effectiveMode(draft));
  for (const name of TOKEN_NAMES) preview.style.setProperty(`--${name}`, tokens[name]);
  // cena do tema no cabeçalho da mini-janela
  preview.style.setProperty('--tp-scene', `url("${new URL(sceneUrl(theme.scene), location.href).href}")`);
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

// ---------------------------------------------------------------- cenas

/** Imagens próprias (miniaturas em blob:, revogadas ao recarregar a lista e quando a janela fecha). */
let customs: Array<{ id: string; url: string }> = [];

function releaseCustoms() {
  customs.forEach((c) => URL.revokeObjectURL(c.url));
  customs = [];
}

async function loadCustoms() {
  const list = await chat().listCustomScenes();
  releaseCustoms();
  customs = list.map((c) => ({
    id: c.id,
    url: URL.createObjectURL(new Blob([c.data as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })),
  }));
}

function sceneTile(choice: SceneChoice, name: string, url: string | null) {
  const item = el('div', 'scene-item');
  const tile = el('button', 'scene-card');
  tile.type = 'button';
  tile.setAttribute('role', 'radio');
  tile.dataset.scene = sceneKey(choice);
  const thumb = el('span', url ? 'scene-thumb' : 'scene-thumb scene-thumb-none');
  thumb.setAttribute('aria-hidden', 'true');
  if (url) {
    const img = el('img');
    img.alt = '';
    img.src = url;
    img.draggable = false;
    thumb.append(img);
  }
  const badge = el('span', 'scene-badge', 'do tema');
  badge.hidden = true;
  thumb.append(badge);
  tile.append(thumb, el('span', 'scene-name', name));
  tile.addEventListener('click', () => pickScene(choice));
  item.append(tile);
  if (choice.kind === 'custom') {
    const remove = el('button', 'scene-remove', '×');
    remove.type = 'button';
    remove.title = 'Apagar esta imagem';
    remove.setAttribute('aria-label', 'Apagar esta imagem');
    remove.addEventListener('click', () => void removeCustom(choice.id));
    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        void removeCustom(choice.id);
      }
    });
    item.append(remove);
  }
  return item;
}

function renderScenes() {
  const focused = els.scenes.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.scene : undefined;
  els.scenes.replaceChildren(
    ...BUILTIN_SCENES.map((sc) => sceneTile({ kind: 'builtin', id: sc.id }, sc.name, sceneUrl(sc.id))),
    ...customs.map((c) => sceneTile({ kind: 'custom', id: c.id }, 'Minha imagem', c.url)),
    sceneTile({ kind: 'none' }, 'Nenhuma', null),
  );
  if (focused) els.scenes.querySelector<HTMLElement>(`[data-scene="${focused}"]`)?.focus();
}

function render() {
  const theme = draftTheme();
  markRadios(els.modes, (b) => b.dataset.mode === draft.mode);
  markRadios(els.themes, (b) => b.dataset.theme === draft.theme);
  const shown = sceneKey(effectiveScene(draft));
  markRadios(els.scenes, (b) => b.dataset.scene === shown);
  els.scenes.querySelectorAll<HTMLElement>('.scene-card').forEach((b) => {
    const badge = b.querySelector<HTMLElement>('.scene-badge');
    if (badge) badge.hidden = b.dataset.scene !== `builtin:${theme.scene}`;
  });
  els.custom.hidden = draftFont.family === theme.font && normalizeScene(draft.scene, theme) === null;
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
  if (theme.id === draft.theme) return;
  // De volta ao tema de quando abriu: volta também a fonte e a cena de antes (mesmo se eram personalizadas);
  // outro tema traz a cena dele.
  const back = theme.id === original.theme;
  draft = { ...draft, theme: theme.id, scene: back ? original.scene : null };
  draftFont = back ? originalFont : withThemeFont(draftFont, theme);
  preview(draftFont);
}

function pickScene(choice: SceneChoice) {
  const scene = normalizeScene(choice, draftTheme());
  if (sameScene(scene, normalizeScene(draft.scene, draftTheme()))) return;
  els.sceneError.textContent = '';
  draft = { ...draft, scene };
  preview();
}

async function removeCustom(id: string) {
  els.sceneError.textContent = '';
  const uses = (a: Appearance) => a.scene?.kind === 'custom' && a.scene.id === id;
  try {
    // O main também tira a imagem da aparência salva e da prévia; aqui o rascunho acompanha.
    await chat().removeCustomScene(id);
    if (uses(original)) original = { ...original, scene: null };
    await loadCustoms();
    renderScenes();
    if (uses(draft)) {
      draft = { ...draft, scene: null };
      preview();
    } else {
      render();
    }
    els.scenes.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  } catch (err) {
    els.sceneError.textContent = errorMessage(err);
  }
}

/** Procurar…: recorte central 16:9, 1600×900, JPEG até 400 KB; guarda e já escolhe. */
async function addCustom(file: File) {
  els.sceneError.textContent = '';
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
    els.sceneError.textContent = 'Formato não suportado (use PNG, JPEG, WebP ou GIF)';
    return;
  }
  try {
    const canvas = await cropToCanvas(file, SCENE_WIDTH, SCENE_HEIGHT);
    const bytes = await encodeJpegWithin(canvas, MAX_SCENE_BYTES);
    const { id } = await chat().addCustomScene(bytes);
    await loadCustoms();
    renderScenes();
    pickScene({ kind: 'custom', id });
    render();
    els.scenes.querySelector<HTMLElement>(`[data-scene="custom:${id}"]`)?.focus();
  } catch (err) {
    els.sceneError.textContent = errorMessage(err);
  }
}

// ---------------------------------------------------------------- teclado

/**
 * Setas movem e marcam dentro do radiogroup; Home/End vão ao primeiro/último. Na grade, ↑/↓ andam uma linha
 * e param na borda (sem pular para o lado nem para o último).
 */
function radioKeys(group: HTMLElement, columns: () => number) {
  group.addEventListener('keydown', (e) => {
    const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
    const i = radios.findIndex((r) => r.getAttribute('aria-checked') === 'true');
    const cols = columns();
    const target: Record<string, number> = {
      ArrowLeft: Math.max(0, i - 1),
      ArrowRight: Math.min(radios.length - 1, i + 1),
      ArrowUp: i - cols >= 0 ? i - cols : i,
      ArrowDown: i + cols < radios.length ? i + cols : i,
      Home: 0,
      End: radios.length - 1,
    };
    if (!(e.key in target)) return;
    e.preventDefault();
    const next = radios[target[e.key]];
    next?.click();
    next?.focus();
  });
}

const gridColumns = (grid: HTMLElement) => () => getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
radioKeys(els.modes, () => 1);
radioKeys(els.themes, gridColumns(els.themes));
radioKeys(els.scenes, gridColumns(els.scenes));

els.sceneBrowse.addEventListener('click', () => els.sceneFile.click());
els.sceneFile.addEventListener('change', () => {
  const file = els.sceneFile.files?.[0];
  els.sceneFile.value = '';
  if (file) void addCustom(file);
});

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
    // Uma chamada só: aparência e fonte são validadas e salvas juntas.
    await chat().setAppearance(draft, sameFont(draftFont, originalFont) ? undefined : draftFont);
    dirty = false;
    els.dialog.close();
  } catch (err) {
    console.warn(errorMessage(err));
    cancel();
  }
}

els.restore.addEventListener('click', () => {
  draftFont = withThemeFont(draftFont, draftTheme());
  draft = { ...draft, scene: null };
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

// Fechou (OK, Cancelar, Esc): solta as miniaturas das imagens próprias.
els.dialog.addEventListener('close', () => {
  releaseCustoms();
  els.scenes.replaceChildren();
});

export async function openAppearanceDialog() {
  if (els.dialog.open) return;
  original = currentAppearance();
  originalFont = currentFont();
  draft = { ...original };
  draftFont = originalFont;
  dirty = false;
  els.sceneError.textContent = '';
  try {
    await loadCustoms();
  } catch (err) {
    els.sceneError.textContent = errorMessage(err);
  }
  // Pedido em dobro (clique duplo no menu) enquanto a lista carregava: o primeiro já abriu.
  if (els.dialog.open) return;
  renderThemes();
  renderScenes();
  render();
  els.dialog.showModal();
  els.themes.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
}
