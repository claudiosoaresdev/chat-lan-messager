// Janela de GIFs do GIPHY. A busca e os downloads são feitos pelo processo principal;
// aqui só chegam bytes (prévias em blob:), então a CSP da interface continua fechada.
import type { UiImageMeta } from '../shared/api';
import { $, chat, el, errorMessage } from './dom';
import { to } from './chat';

const els = {
  setup: $('gif-setup'),
  keyForm: $<HTMLFormElement>('gif-key-form'),
  key: $<HTMLInputElement>('gif-key'),
  keyError: $('gif-key-error'),
  browser: $('gif-browser'),
  searchForm: $<HTMLFormElement>('gif-search-form'),
  query: $<HTMLInputElement>('gif-query'),
  grid: $('gif-grid'),
  status: $('gif-status'),
  more: $<HTMLButtonElement>('gif-more'),
  changeKey: $<HTMLButtonElement>('gif-change-key'),
};

let onSent: (meta: UiImageMeta, data: Uint8Array) => void = () => undefined;
let onClose: () => void = () => undefined;
let urls: string[] = [];
let currentQuery: string | null = null;
let nextOffset: number | null = null;
let searchId = 0;
let sending = false;

function setStatus(text: string) {
  els.status.textContent = text;
}

function clearGrid() {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  els.grid.replaceChildren();
}

async function send(id: string, title: string) {
  if (sending) return;
  sending = true;
  setStatus(`Enviando "${title}"…`);
  try {
    const { meta, data } = await chat().giphySend(to(), id);
    onSent(meta, data);
    setStatus('');
    onClose();
  } catch (err) {
    setStatus(errorMessage(err));
  } finally {
    sending = false;
  }
}

async function search(query: string, append = false) {
  const id = ++searchId;
  if (!append) {
    clearGrid();
    nextOffset = 0;
  }
  currentQuery = query;
  els.more.hidden = true;
  setStatus(query ? `Buscando "${query}"…` : 'Carregando os GIFs do momento…');
  try {
    const page = await chat().giphySearch(query, nextOffset ?? 0);
    if (id !== searchId) return; // outra busca começou nesse meio-tempo
    for (const item of page.items) {
      const url = URL.createObjectURL(new Blob([item.data as Uint8Array<ArrayBuffer>]));
      urls.push(url);
      const b = el('button', 'gif-tile');
      b.type = 'button';
      b.title = item.title;
      b.setAttribute('role', 'option');
      const img = el('img');
      img.alt = item.title;
      img.src = url;
      b.append(img);
      b.addEventListener('click', () => void send(item.id, item.title));
      els.grid.append(b);
    }
    nextOffset = page.next;
    els.more.hidden = page.next === null;
    setStatus(els.grid.children.length ? '' : 'Nenhum GIF encontrado.');
  } catch (err) {
    if (id !== searchId) return;
    setStatus(errorMessage(err));
  }
}

function showSetup() {
  els.browser.hidden = true;
  els.setup.hidden = false;
  els.keyError.textContent = '';
  els.key.value = '';
  els.key.focus();
}

function showBrowser() {
  els.setup.hidden = true;
  els.browser.hidden = false;
  els.query.focus();
  if (currentQuery === null) void search('');
}

els.keyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await chat().setGiphyKey(els.key.value.trim());
    currentQuery = null;
    showBrowser();
  } catch (err) {
    els.keyError.textContent = errorMessage(err);
  }
});

els.searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  void search(els.query.value.trim());
});

// Busca enquanto digita, com uma pequena espera.
let debounce = 0;
els.query.addEventListener('input', () => {
  window.clearTimeout(debounce);
  debounce = window.setTimeout(() => {
    const q = els.query.value.trim();
    if (q !== currentQuery) void search(q);
  }, 500);
});

els.more.addEventListener('click', () => void search(currentQuery ?? '', true));
els.changeKey.addEventListener('click', showSetup);

/** Chamado quando a janela de GIFs é aberta. */
export async function onGifPickerOpened() {
  try {
    if (await chat().hasGiphyKey()) showBrowser();
    else showSetup();
  } catch {
    showSetup();
  }
}

export function initGiphy(handlers: { sent(meta: UiImageMeta, data: Uint8Array): void; close(): void }) {
  onSent = handlers.sent;
  onClose = handlers.close;
}
