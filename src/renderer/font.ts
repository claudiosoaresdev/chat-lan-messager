// "Alterar fonte" das mensagens, como no MSN: fonte, estilo, tamanho, sublinhado e cor.
// A fonte vai junto com cada mensagem e é aplicada só via propriedades de estilo (CSSOM).
import { DEFAULT_FONT, FONT_FAMILIES, type FontFamily, type MessageFont } from '../shared/protocol';
import { $, chat, el, errorMessage } from './dom';

/** Pilhas de fallback, para a fonte ter equivalente parecido no Mac e no Windows. */
const FONT_STACKS: Record<FontFamily, string> = {
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

const SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24];

const STYLES = [
  { label: 'Normal', bold: false, italic: false },
  { label: 'Itálico', bold: false, italic: true },
  { label: 'Negrito', bold: true, italic: false },
  { label: 'Negrito itálico', bold: true, italic: true },
];

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
const listeners: Array<(f: MessageFont) => void> = [];

/** Cores muito claras ficariam invisíveis no fundo branco: escurece para leitura. */
function readableColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.85 ? '#7a7a7a' : hex;
}

/** Aplica a fonte num elemento (mensagem, caixa de texto, exemplo). */
export function applyFont(node: HTMLElement, font: MessageFont | undefined) {
  if (!font) return;
  node.style.fontFamily = FONT_STACKS[font.family] ?? '';
  node.style.fontSize = `${font.size}px`;
  node.style.fontWeight = font.bold ? '700' : '400';
  node.style.fontStyle = font.italic ? 'italic' : 'normal';
  node.style.textDecoration = font.underline ? 'underline' : 'none';
  node.style.color = readableColor(font.color);
}

export const currentFont = () => current;

export function onFontChange(fn: (f: MessageFont) => void) {
  listeners.push(fn);
}

function setCurrent(font: MessageFont) {
  current = font;
  listeners.forEach((fn) => fn(font));
}

export async function loadFont() {
  try {
    setCurrent(await chat().getFont());
  } catch {
    setCurrent({ ...DEFAULT_FONT });
  }
}

// ---------------------------------------------------------------- diálogo

const els = {
  dialog: $<HTMLDialogElement>('font-dialog'),
  familyList: $<HTMLUListElement>('font-family-list'),
  familyCurrent: $('font-family-current'),
  styleList: $<HTMLUListElement>('font-style-list'),
  styleCurrent: $('font-style-current'),
  sizeList: $<HTMLUListElement>('font-size-list'),
  sizeCurrent: $('font-size-current'),
  underline: $<HTMLInputElement>('font-underline'),
  colors: $('font-colors'),
  sample: $('font-sample'),
  defaultBtn: $<HTMLButtonElement>('font-default'),
  ok: $<HTMLButtonElement>('font-ok'),
  cancel: $<HTMLButtonElement>('font-cancel'),
};

/** Rascunho editado no diálogo; só vira a fonte atual no OK. */
let draft: MessageFont = { ...DEFAULT_FONT };

function listItem(label: string, selected: boolean, onPick: () => void, style?: (li: HTMLLIElement) => void) {
  const li = el('li', `font-option${selected ? ' is-selected' : ''}`, label);
  li.setAttribute('role', 'option');
  li.setAttribute('aria-selected', String(selected));
  style?.(li);
  li.addEventListener('click', onPick);
  return li;
}

function renderDialog() {
  const styleLabel = STYLES.find((s) => s.bold === draft.bold && s.italic === draft.italic)?.label ?? 'Normal';

  els.familyCurrent.textContent = draft.family;
  els.styleCurrent.textContent = styleLabel;
  els.sizeCurrent.textContent = String(draft.size);

  els.familyList.replaceChildren(
    ...FONT_FAMILIES.map((family) =>
      listItem(
        family,
        family === draft.family,
        () => update({ family }),
        (li) => (li.style.fontFamily = FONT_STACKS[family]),
      ),
    ),
  );
  els.styleList.replaceChildren(
    ...STYLES.map((s) =>
      listItem(
        s.label,
        s.label === styleLabel,
        () => update({ bold: s.bold, italic: s.italic }),
        (li) => {
          li.style.fontWeight = s.bold ? '700' : '400';
          li.style.fontStyle = s.italic ? 'italic' : 'normal';
        },
      ),
    ),
  );
  els.sizeList.replaceChildren(...SIZES.map((size) => listItem(String(size), size === draft.size, () => update({ size }))));

  els.underline.checked = draft.underline;
  els.colors.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => {
    const on = b.dataset.color === draft.color;
    b.classList.toggle('is-selected', on);
    b.setAttribute('aria-checked', String(on));
  });

  applyFont(els.sample, draft);
  // Mantém o item escolhido visível nas listas.
  for (const list of [els.familyList, els.styleList, els.sizeList]) {
    list.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
  }
}

function update(patch: Partial<MessageFont>) {
  draft = { ...draft, ...patch };
  renderDialog();
}

// Setas do teclado percorrem cada lista.
function keyboardList(list: HTMLUListElement) {
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...list.querySelectorAll<HTMLLIElement>('.font-option')];
    const i = items.findIndex((li) => li.classList.contains('is-selected'));
    items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.click();
  });
}
[els.familyList, els.styleList, els.sizeList].forEach(keyboardList);

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

els.underline.addEventListener('change', () => update({ underline: els.underline.checked }));
els.defaultBtn.addEventListener('click', () => update({ ...DEFAULT_FONT }));
els.cancel.addEventListener('click', () => els.dialog.close());
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
  draft = { ...current };
  els.dialog.showModal();
  renderDialog();
  els.familyList.focus();
}
