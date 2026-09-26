// Imagens de exibição: a minha (login, contatos, conversa), as dos contatos e o
// diálogo "Imagem de exibição" com a grade de imagens e o "Procurar...".
import type { LibraryAvatar, PeerAvatar } from '../shared/api';
import { IMAGE_MIME_TYPES, MAX_AVATAR_BYTES } from '../shared/protocol';
import { $, chat, el, errorMessage, icon } from './dom';
import { cropToCanvas, encodeCanvas } from './image-crop';

/** Lado da imagem que vai para os contatos (quadrada). */
const AVATAR_SIZE = 128;
const MY_AVATAR_CONTAINERS = ['login-avatar', 'me-avatar', 'chat-me-avatar'];

let myUrl: string | null = null;
const peerUrls = new Map<string, string>();
const peerListeners: Array<() => void> = [];

// ---------------------------------------------------------------- exibição

const blobUrl = (data: Uint8Array, mime: string) => URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: mime }));

/** Troca o conteúdo de um .avatar pela imagem, ou volta ao boneco padrão (`fallback`). */
export function paintAvatar(container: HTMLElement, url: string | null, fallback = 'person-3d') {
  const inner = container.querySelector('.avatar-inner');
  if (!inner) return;
  if (url) {
    const img = el('img', 'avatar-img');
    img.alt = '';
    img.src = url;
    inner.replaceChildren(img);
    inner.classList.add('has-image');
  } else {
    inner.replaceChildren(icon(fallback));
    inner.classList.remove('has-image');
  }
}

function paintMine() {
  for (const id of MY_AVATAR_CONTAINERS) paintAvatar($(id), myUrl);
}

function setMine(data: Uint8Array | null, mime = 'image/png') {
  if (myUrl) URL.revokeObjectURL(myUrl);
  myUrl = data ? blobUrl(data, mime) : null;
  paintMine();
}

export async function loadMyAvatar() {
  const current = await chat().getAvatar();
  setMine(current?.data ?? null, current?.mime);
}

/** Imagem trocada em outra janela: atualiza aqui também. */
export function watchMyAvatar() {
  chat().onMyAvatarChanged((a) => setMine(a?.data ?? null, a?.mime));
}

export const peerAvatarUrl = (id: string) => peerUrls.get(id) ?? null;

export function onPeerAvatarsChange(fn: () => void) {
  peerListeners.push(fn);
}

export function applyPeerAvatar(a: PeerAvatar) {
  const old = peerUrls.get(a.id);
  if (old) URL.revokeObjectURL(old);
  if (a.data && a.mime) peerUrls.set(a.id, blobUrl(a.data, a.mime));
  else peerUrls.delete(a.id);
  peerListeners.forEach((fn) => fn());
}

export async function loadPeerAvatars() {
  for (const a of await chat().getPeerAvatars()) applyPeerAvatar(a);
}

export function clearPeerAvatars() {
  peerUrls.forEach((url) => URL.revokeObjectURL(url));
  peerUrls.clear();
  peerListeners.forEach((fn) => fn());
}

// ---------------------------------------------------------------- conversão

/** Recorta no centro, reduz para 128×128 e devolve PNG (ou JPEG, se o PNG passar do limite). */
async function toAvatarBytes(blob: Blob): Promise<Uint8Array> {
  const canvas = await cropToCanvas(blob, AVATAR_SIZE, AVATAR_SIZE);
  let out = await encodeCanvas(canvas, 'image/png');
  if (out.size > MAX_AVATAR_BYTES) out = await encodeCanvas(canvas, 'image/jpeg', 0.9);
  return new Uint8Array(await out.arrayBuffer());
}

// ---------------------------------------------------------------- diálogo "Imagem de exibição"

const els = {
  dialog: $<HTMLDialogElement>('avatar-dialog'),
  builtin: $('avatar-grid-builtin'),
  uploads: $('avatar-grid-uploads'),
  uploadsTitle: $('avatar-uploads-title'),
  preview: $('avatar-preview'),
  previewName: $('avatar-preview-name'),
  file: $<HTMLInputElement>('avatar-file'),
  remove: $<HTMLButtonElement>('avatar-remove'),
  none: $<HTMLButtonElement>('avatar-none'),
  error: $('avatar-error'),
  ok: $<HTMLButtonElement>('avatar-ok'),
  cancel: $<HTMLButtonElement>('avatar-cancel'),
};

interface Tile {
  item: LibraryAvatar;
  url: string;
  button: HTMLButtonElement;
}

let tiles: Tile[] = [];
/** undefined = sem mudança; null = "Sem imagem"; Tile = imagem escolhida. */
let selected: Tile | null | undefined;
let getStatus: () => string = () => 'available';

function select(choice: Tile | null) {
  selected = choice;
  tiles.forEach((t) => {
    const on = t === choice;
    t.button.classList.toggle('is-selected', on);
    t.button.setAttribute('aria-selected', String(on));
  });
  paintAvatar(els.preview, choice ? choice.url : null);
  els.previewName.textContent = choice ? choice.item.name : 'Sem imagem';
  els.remove.disabled = !choice || choice.item.kind !== 'upload';
  els.error.textContent = '';
}

function addTile(item: LibraryAvatar, grid: HTMLElement, prepend = false): Tile {
  const url = blobUrl(item.data, item.mime);
  const button = el('button', 'avatar-tile');
  button.type = 'button';
  button.title = item.name;
  button.setAttribute('role', 'option');
  const img = el('img');
  img.alt = item.name;
  img.src = url;
  button.append(img);
  const tile: Tile = { item, url, button };
  button.addEventListener('click', () => select(tile));
  button.addEventListener('dblclick', () => {
    select(tile);
    void confirm();
  });
  if (prepend) grid.prepend(button);
  else grid.append(button);
  tiles.push(tile);
  return tile;
}

function refreshUploadsTitle() {
  const empty = !tiles.some((t) => t.item.kind === 'upload');
  els.uploadsTitle.hidden = empty;
  els.uploads.hidden = empty;
}

function closeDialog() {
  els.dialog.close();
  tiles.forEach((t) => URL.revokeObjectURL(t.url));
  tiles = [];
  els.builtin.replaceChildren();
  els.uploads.replaceChildren();
}

export async function openAvatarDialog() {
  selected = undefined;
  els.error.textContent = '';
  els.preview.dataset.status = getStatus();
  paintAvatar(els.preview, myUrl);
  els.previewName.textContent = myUrl ? 'Imagem atual' : 'Sem imagem';
  els.remove.disabled = true;

  try {
    const library = await chat().getAvatarLibrary();
    for (const item of library) addTile(item, item.kind === 'builtin' ? els.builtin : els.uploads);
  } catch (err) {
    els.error.textContent = errorMessage(err);
  }
  refreshUploadsTitle();
  els.dialog.showModal();
  els.ok.focus();
}

async function confirm() {
  if (selected === undefined) {
    closeDialog();
    return;
  }
  els.ok.disabled = true;
  try {
    if (selected === null) {
      await chat().setAvatar(null);
      setMine(null);
    } else {
      // Enviadas já estão prontas; as padrão (inclusive SVG) viram PNG 128×128.
      const bytes =
        selected.item.kind === 'upload'
          ? selected.item.data
          : await toAvatarBytes(new Blob([selected.item.data as Uint8Array<ArrayBuffer>], { type: selected.item.mime }));
      await chat().setAvatar(bytes);
      setMine(bytes, selected.item.kind === 'upload' ? selected.item.mime : bytes[0] === 0x89 ? 'image/png' : 'image/jpeg');
    }
    closeDialog();
  } catch (err) {
    els.error.textContent = errorMessage(err);
  } finally {
    els.ok.disabled = false;
  }
}

els.file.addEventListener('change', async () => {
  const file = els.file.files?.[0];
  els.file.value = '';
  if (!file) return;
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    els.error.textContent = 'Formato não suportado (use PNG, JPEG, WebP ou GIF)';
    return;
  }
  try {
    const bytes = await toAvatarBytes(file);
    const item = await chat().addAvatarUpload(bytes);
    // Mesmo arquivo enviado de novo: reaproveita o bloco existente.
    const existing = tiles.find((t) => t.item.id === item.id);
    const tile = existing ?? addTile(item, els.uploads, true);
    refreshUploadsTitle();
    select(tile);
    tile.button.scrollIntoView({ block: 'nearest' });
  } catch (err) {
    els.error.textContent = errorMessage(err);
  }
});

els.remove.addEventListener('click', async () => {
  const tile = selected;
  if (!tile || tile.item.kind !== 'upload') return;
  try {
    await chat().removeAvatarUpload(tile.item.id);
    tile.button.remove();
    URL.revokeObjectURL(tile.url);
    tiles = tiles.filter((t) => t !== tile);
    refreshUploadsTitle();
    select(null);
    selected = undefined;
    paintAvatar(els.preview, myUrl);
    els.previewName.textContent = myUrl ? 'Imagem atual' : 'Sem imagem';
  } catch (err) {
    els.error.textContent = errorMessage(err);
  }
});

els.none.addEventListener('click', () => select(null));
els.ok.addEventListener('click', () => void confirm());
els.cancel.addEventListener('click', closeDialog);
els.dialog.addEventListener('cancel', (e) => {
  e.preventDefault();
  closeDialog();
});

// Clique (ou Enter/Espaço) em qualquer avatar meu abre o diálogo.
for (const id of MY_AVATAR_CONTAINERS) {
  const node = $(id);
  node.addEventListener('click', () => void openAvatarDialog());
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void openAvatarDialog();
    }
  });
}

/** `status` define a cor da moldura da prévia no diálogo. */
export function initAvatars(status: () => string) {
  getStatus = status;
}
