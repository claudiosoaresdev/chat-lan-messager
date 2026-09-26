// "Alterar fonte" das mensagens, como no MSN: fonte, estilo, tamanho, sublinhado e cor.
// A fonte vai junto com cada mensagem e é aplicada só via propriedades de estilo (CSSOM).
import { averageColor, messageColor } from '../shared/color';
import { DEFAULT_FONT, type MessageFont } from '../shared/protocol';
import { onAppearanceApplied } from './appearance';
import { $, chat, el, errorMessage } from './dom';
import { ensureFontLoaded, fontStack } from './font-loader';
import {
  familyHasItalic,
  familyRows,
  familyWeights,
  fitToFamily,
  isClassicFont,
  isFavoriteFont,
  weightLabel,
  type FamilyRow,
} from './font-list';

const SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24];

/** Paleta no clima do MSN (sem cores claras demais para fundo branco). */
const COLORS = [
  ['#000000', 'Preto'],
  ['#595959', 'Cinza'],
  ['#800000', 'Vinho'],
  ['#d40000', 'Vermelho'],
  ['#e46c0a', 'Laranja'],
  ['#7f4f1f', 'Marrom'],
  ['#808000', 'Oliva'],
  ['#008000', 'Verde'],
  ['#008080', 'Verde-azulado'],
  ['#006d8f', 'Petróleo'],
  ['#000080', 'Azul-marinho'],
  ['#0050c8', 'Azul'],
  ['#5b2c9f', 'Roxo'],
  ['#800080', 'Púrpura'],
  ['#c000c0', 'Magenta'],
  ['#d6337f', 'Rosa'],
] as const;

let current: MessageFont = { ...DEFAULT_FONT };
/** Fonte em prévia pela janela "Aparência": só muda o visual (caixa de escrever, exemplo, barrinha). */
let preview: MessageFont | null = null;
const listeners: Array<(f: MessageFont) => void> = [];

/** Fundo da conversa e modo atuais, lidos uma vez por troca de aparência (não a cada mensagem). */
let background: { surface: string; mode: 'light' | 'dark' } | null = null;

function readBackground() {
  const root = document.documentElement;
  let surface = '#ffffff';
  try {
    surface = averageColor(getComputedStyle(root).getPropertyValue('--surface').trim() || '#fff');
  } catch {
    // mantém o branco
  }
  return { surface, mode: root.dataset.mode === 'dark' ? ('dark' as const) : ('light' as const) };
}

/**
 * Cor legível no fundo atual (regras em messageColor): no escuro o preto vira o texto do tema e as demais cores
 * ganham contraste; no claro só cores claras demais escurecem (mesmo matiz). A cor original fica em
 * data-font-color para reajustar quando o modo ou o tema mudam.
 */
export function readableColor(hex: string) {
  background ??= readBackground();
  try {
    return messageColor(hex, background.surface, background.mode, 'var(--text)');
  } catch {
    return hex;
  }
}

/** Barrinha de cor sob o "A" da barra de formatação: mostra a cor como vai aparecer. */
export function applyColorBar(node: HTMLElement, color: string) {
  node.dataset.fontBar = color;
  node.style.backgroundColor = readableColor(color);
}

/** Reaplica a cor legível em tudo que mostra a fonte (mensagens, caixa de escrever, exemplo, barrinha). */
function refreshReadableColors() {
  document.querySelectorAll<HTMLElement>('[data-font-color]').forEach((n) => {
    n.style.color = readableColor(n.dataset.fontColor ?? '#000000');
  });
  document.querySelectorAll<HTMLElement>('[data-font-bar]').forEach((n) => {
    n.style.backgroundColor = readableColor(n.dataset.fontBar ?? '#000000');
  });
}
onAppearanceApplied(() => {
  background = readBackground();
  refreshReadableColors();
});

export interface ApplyFontOptions {
  /** Fonte de mensagem recebida: o download entra no limite de downloads automáticos. */
  auto?: boolean;
  /** false: só aplica o estilo, sem baixar (o diálogo baixa depois que a escolha assenta). */
  load?: boolean;
}

/** Aplica a fonte num elemento (mensagem, caixa de texto, exemplo). */
export function applyFont(
  node: HTMLElement,
  font: MessageFont | undefined,
  { auto = false, load = true }: ApplyFontOptions = {},
) {
  if (!font) return;
  node.style.fontFamily = fontStack(font.family);
  node.style.fontSize = `${font.size}px`;
  node.style.fontWeight = String(font.weight ?? (font.bold ? 700 : 400));
  node.style.fontStyle = font.italic ? 'italic' : 'normal';
  node.style.textDecoration = font.underline ? 'underline' : 'none';
  node.dataset.fontColor = font.color;
  node.style.color = readableColor(font.color);
  // Fonte do Google: registra e o texto troca sozinho quando ela carregar.
  if (load) void ensureFontLoaded(font.family, { auto });
}

/** Fonte salva: a que vai junto das mensagens enviadas (a prévia não muda). */
export const currentFont = () => current;

/** O que a caixa de escrever mostra: a prévia, se houver, senão a salva. */
const shownFont = () => preview ?? current;

export function onFontChange(fn: (f: MessageFont) => void) {
  listeners.push(fn);
}

function notify() {
  const font = shownFont();
  listeners.forEach((fn) => fn(font));
}

function setCurrent(font: MessageFont) {
  current = font;
  notify();
}

export async function loadFont() {
  try {
    setCurrent(await chat().getFont());
  } catch {
    setCurrent({ ...DEFAULT_FONT });
  }
}

/** Fonte trocada em outra janela: aplica aqui também. */
export function watchFontChanges() {
  chat().onFontChanged(setCurrent);
  chat().onFontPreview((font) => {
    preview = font;
    notify();
  });
}

// ---------------------------------------------------------------- diálogo

const els = {
  dialog: $<HTMLDialogElement>('font-dialog'),
  search: $<HTMLInputElement>('font-search'),
  familyList: $<HTMLUListElement>('font-family-list'),
  familyCurrent: $('font-family-current'),
  weightList: $<HTMLUListElement>('font-weight-list'),
  weightCurrent: $('font-weight-current'),
  italic: $<HTMLInputElement>('font-italic'),
  sizeList: $<HTMLUListElement>('font-size-list'),
  sizeCurrent: $('font-size-current'),
  underline: $<HTMLInputElement>('font-underline'),
  colors: $('font-colors'),
  sample: $('font-sample'),
  status: $('font-status'),
  defaultBtn: $<HTMLButtonElement>('font-default'),
  ok: $<HTMLButtonElement>('font-ok'),
  cancel: $<HTMLButtonElement>('font-cancel'),
};

/** Rascunho editado no diálogo; só vira a fonte atual no OK. */
let draft: MessageFont = { ...DEFAULT_FONT };
/** Busca + família da última lista de famílias montada (só remonta se mudar). */
let familyListKey = '';
/** Fontes do Google que já carregaram (não mostra "Baixando fonte…" de novo). */
const loaded = new Set<string>();
/** Espera a escolha assentar antes de baixar (quem passa pela lista com as setas não baixa tudo). */
const DOWNLOAD_DELAY_MS = 350;
let downloadTimer: ReturnType<typeof setTimeout> | undefined;

function listItem(label: string, selected: boolean, onPick: () => void, style?: (li: HTMLLIElement) => void) {
  const li = el('li', `font-option${selected ? ' is-selected' : ''}`, label);
  li.setAttribute('role', 'option');
  li.setAttribute('aria-selected', String(selected));
  style?.(li);
  li.addEventListener('click', onPick);
  return li;
}

function familyItem(row: FamilyRow) {
  switch (row.kind) {
    case 'section': {
      const li = el('li', 'font-section', row.label);
      li.setAttribute('role', 'presentation');
      return li;
    }
    case 'empty': {
      const li = el('li', 'font-note', 'Nenhuma fonte encontrada');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-disabled', 'true');
      return li;
    }
    case 'more': {
      const li = el('li', 'font-note', 'Refine a busca para ver mais…');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-disabled', 'true');
      li.dataset.action = 'refine';
      li.addEventListener('click', () => els.search.focus());
      return li;
    }
    case 'font':
      return listItem(
        row.family,
        row.family === draft.family,
        () => pickFamily(row.family),
        // Favoritas (embutidas, sem rede) e clássicas aparecem na própria fonte; as do Google, na da interface.
        row.group === 'google'
          ? undefined
          : (li) => {
              li.style.fontFamily = fontStack(row.family);
              if (row.group === 'favorite') void ensureFontLoaded(row.family);
            },
      );
  }
}

function renderFamilies() {
  const key = `${els.search.value}\0${draft.family}`;
  if (key === familyListKey) return;
  familyListKey = key;
  els.familyList.replaceChildren(...familyRows(els.search.value, draft.family).map(familyItem));
  els.familyList.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
}

function renderDialog() {
  const weights = familyWeights(draft.family);
  const canItalic = familyHasItalic(draft.family);

  els.familyCurrent.textContent = draft.family;
  els.weightCurrent.textContent = weightLabel(draft.weight);
  els.sizeCurrent.textContent = String(draft.size);

  renderFamilies();
  els.weightList.replaceChildren(
    ...weights.map((weight) =>
      listItem(
        weightLabel(weight),
        weight === draft.weight,
        () => update({ weight, bold: weight >= 600 }),
        (li) => {
          li.style.fontFamily = fontStack(draft.family);
          li.style.fontWeight = String(weight);
        },
      ),
    ),
  );
  els.sizeList.replaceChildren(...SIZES.map((size) => listItem(String(size), size === draft.size, () => update({ size }))));

  els.italic.disabled = !canItalic;
  els.italic.checked = draft.italic;
  els.underline.checked = draft.underline;
  els.colors.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => {
    const on = b.dataset.color === draft.color;
    b.classList.toggle('is-selected', on);
    b.setAttribute('aria-checked', String(on));
  });

  applyFont(els.sample, draft, { load: false });
  // Mantém o item escolhido visível nas listas.
  for (const list of [els.weightList, els.sizeList]) {
    list.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
  }
}

function update(patch: Partial<MessageFont>) {
  draft = { ...draft, ...patch };
  renderDialog();
}

/** "Baixando fonte…" enquanto a fonte do Google não chega; favoritas e clássicas não mostram nada. */
function trackDownload(family: string) {
  if (isClassicFont(family) || isFavoriteFont(family) || loaded.has(family)) {
    els.status.textContent = '';
    return;
  }
  els.status.textContent = 'Baixando fonte…';
  void ensureFontLoaded(family).then((state) => {
    if (state === 'ready') loaded.add(family);
    if (draft.family !== family) return; // já trocou de fonte
    els.status.textContent = state === 'offline' ? 'Sem internet: a fonte vai aparecer parecida até conseguir baixar.' : '';
  });
}

/** Baixa a família escolhida só depois de DOWNLOAD_DELAY_MS sem outra troca; favoritas e clássicas na hora. */
function scheduleDownload(family: string) {
  clearTimeout(downloadTimer);
  downloadTimer = undefined;
  if (isClassicFont(family) || isFavoriteFont(family) || loaded.has(family)) {
    trackDownload(family);
    void ensureFontLoaded(family);
    return;
  }
  els.status.textContent = '';
  downloadTimer = setTimeout(() => {
    downloadTimer = undefined;
    if (draft.family === family) trackDownload(family);
  }, DOWNLOAD_DELAY_MS);
}

/** Troca a família mantendo o peso mais próximo que ela tem e o itálico só se existir. */
function pickFamily(family: string) {
  if (family === draft.family) return;
  draft = fitToFamily(draft, family);
  renderDialog();
  scheduleDownload(family);
}

// Setas do teclado percorrem cada lista (cabeçalhos e avisos ficam de fora).
function keyboardList(list: HTMLUListElement) {
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...list.querySelectorAll<HTMLLIElement>('.font-option')];
    const i = items.findIndex((li) => li.classList.contains('is-selected'));
    items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.click();
  });
}
[els.familyList, els.weightList, els.sizeList].forEach(keyboardList);

els.search.addEventListener('input', renderFamilies);
els.search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const first = familyRows(els.search.value, draft.family).find((r) => r.kind === 'font');
    if (first?.kind === 'font') pickFamily(first.family);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    els.familyList.focus();
  }
});

els.colors.replaceChildren(
  ...COLORS.map(([color, name]) => {
    const b = el('button', 'swatch');
    b.type = 'button';
    b.title = name;
    b.dataset.color = color;
    b.setAttribute('role', 'radio');
    b.style.backgroundColor = color;
    b.addEventListener('click', () => update({ color }));
    return b;
  }),
);

els.italic.addEventListener('change', () => update({ italic: els.italic.checked }));
els.underline.addEventListener('change', () => update({ underline: els.underline.checked }));
els.defaultBtn.addEventListener('click', () => {
  els.search.value = '';
  update({ ...DEFAULT_FONT });
  scheduleDownload(DEFAULT_FONT.family);
});
els.cancel.addEventListener('click', () => els.dialog.close());
els.dialog.addEventListener('close', () => clearTimeout(downloadTimer));
els.ok.addEventListener('click', async () => {
  try {
    setCurrent(await chat().setFont(draft));
    els.dialog.close();
  } catch (err) {
    console.warn(errorMessage(err));
    els.dialog.close();
  }
});

export function openFontDialog() {
  // Normaliza a fonte guardada (peso/itálico que a família não tem).
  draft = fitToFamily({ ...current }, current.family);
  els.search.value = '';
  familyListKey = '';
  els.dialog.showModal();
  renderDialog();
  scheduleDownload(draft.family);
  els.familyList.focus();
}
