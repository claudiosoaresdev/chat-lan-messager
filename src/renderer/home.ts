// Tela principal: eu no topo (status, mensagem pessoal, endereço) e a lista de contatos da rede.
import type { PeerInfo, SavedPeer, SelfInfo } from '../shared/api';
import type { PresenceStatus } from '../shared/protocol';
import { $, chat, copyWithFeedback, el, errorMessage, formatTarget, icon } from './dom';
import { openAppearanceDialog } from './appearance-dialog';
import { onPeerAvatarsChange, peerAvatarUrl } from './avatar';
import { renderRichText } from './emoticons';
import { STATUS_LABEL, openMenu, openStatusMenu } from './status';
import { onPeersChange, state } from './state';

const els = {
  avatar: $('me-avatar'),
  name: $<HTMLInputElement>('me-name'),
  statusBtn: $<HTMLButtonElement>('me-status'),
  statusLabel: $('me-status-label'),
  message: $<HTMLInputElement>('me-message'),
  addr: $<HTMLButtonElement>('me-addr'),
  search: $<HTMLInputElement>('contact-search'),
  addBtn: $<HTMLButtonElement>('add-contact'),
  emptyAdd: $<HTMLButtonElement>('empty-add'),
  listOnline: $<HTMLUListElement>('list-online'),
  listOffline: $<HTMLUListElement>('list-offline'),
  countOnline: $('count-online'),
  countOffline: $('count-offline'),
  groupOffline: $('group-offline'),
  empty: $('contacts-empty'),
  menuBtn: $<HTMLButtonElement>('home-menu'),
  addDialog: $<HTMLDialogElement>('add-dialog'),
  addForm: $<HTMLFormElement>('add-form'),
  addAddress: $<HTMLInputElement>('add-address'),
  addStatus: $('add-status'),
  addSubmit: $<HTMLButtonElement>('add-submit'),
  addClose: $<HTMLButtonElement>('add-close'),
  savedWrap: $('saved-wrap'),
  savedList: $<HTMLUListElement>('saved-list'),
};

interface HomeHandlers {
  openChat(peerId: string): void;
  logout(): void;
  help(): void;
}

let handlers: HomeHandlers = { openChat: () => undefined, logout: () => undefined, help: () => undefined };
let selectedId: string | null = null;
/** Contatos com mensagem não vista: piscam em laranja, como no MSN. */
const unread = new Set<string>();
let soundsOn = true;
let shareListening = true;
let linkPreviews = true;

export function setUnread(peerId: string, isUnread: boolean) {
  if (isUnread) unread.add(peerId);
  else unread.delete(peerId);
  renderContacts();
}

/** Estado inicial ao entrar: descarta o que sobrou de uma sessão anterior (o main limpa sem avisar ao sair). */
export function resetUnread(ids: string[]) {
  unread.clear();
  for (const id of ids) unread.add(id);
  renderContacts();
}

export function setSoundsOn(on: boolean) {
  soundsOn = on;
}

export function setShareListening(on: boolean) {
  shareListening = on;
}

export function setLinkPreviews(on: boolean) {
  linkPreviews = on;
}

// ---------------------------------------------------------------- eu

export function renderSelf(self: SelfInfo) {
  els.avatar.dataset.status = self.status;
  if (document.activeElement !== els.name) els.name.value = self.name;
  els.statusLabel.textContent = STATUS_LABEL[self.status];
  if (document.activeElement !== els.message) els.message.value = self.message;
  const ip = self.addresses[0];
  els.addr.textContent = ip ? `${ip}:${self.port}` : `porta ${self.port} (sem rede)`;
  els.addr.title = ip
    ? `Clique para copiar. Todos os endereços: ${self.addresses.map((a) => `${a}:${self.port}`).join(', ')}`
    : '';
}

async function updatePresence(update: { name?: string; status?: PresenceStatus; message?: string }) {
  try {
    state.self = await chat().setPresence(update);
    renderSelf(state.self);
  } catch (err) {
    console.warn(errorMessage(err));
  }
}

els.statusBtn.addEventListener('click', () =>
  openStatusMenu(els.statusBtn, (s) => void updatePresence({ status: s }), [
    { label: 'Sair', onSelect: () => handlers.logout() },
  ]),
);

// Nome: clique para editar, Enter salva, Esc desfaz. Vazio volta ao nome atual.
function commitName() {
  const name = els.name.value.trim();
  if (!state.self) return;
  if (!name || name === state.self.name) {
    els.name.value = state.self.name;
    return;
  }
  void updatePresence({ name });
}

els.name.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') els.name.blur();
  if (e.key === 'Escape') {
    els.name.value = state.self?.name ?? '';
    els.name.blur();
  }
});
els.name.addEventListener('focus', () => els.name.select());
els.name.addEventListener('blur', commitName);

function commitMessage() {
  const message = els.message.value.trim();
  if (state.self && message !== state.self.message) void updatePresence({ message });
}

els.message.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') els.message.blur();
  if (e.key === 'Escape') {
    els.message.value = state.self?.message ?? '';
    els.message.blur();
  }
});
els.message.addEventListener('blur', commitMessage);

els.addr.addEventListener('click', () => {
  const ip = state.self?.addresses[0];
  if (ip && state.self) void copyWithFeedback(els.addr, `${ip}:${state.self.port}`);
});

// ---------------------------------------------------------------- contatos

function contactRow(p: PeerInfo) {
  const li = el('li', `contact ${p.online ? 'online' : 'offline'}`);
  li.dataset.status = p.online ? p.status : 'offline';
  li.dataset.id = p.id;
  li.tabIndex = 0;
  li.title = `${p.name} — ${p.online ? STATUS_LABEL[p.status] : 'Offline'}\n${p.address}\nClique duas vezes para abrir a conversa`;
  if (p.id === selectedId) li.classList.add('is-selected');
  if (unread.has(p.id)) {
    li.classList.add('is-unread');
    // Ciclo de 2 s (1 s ida e volta): mesma fase em qualquer re-render, o pulso não recomeça.
    li.style.animationDelay = `${-(Date.now() % 2000)}ms`;
    li.title += '\nNova mensagem';
  }

  const extra = [p.online && p.status !== 'available' ? `(${STATUS_LABEL[p.status]})` : '', p.message ? `- ${p.message}` : '']
    .filter(Boolean)
    .join(' ');

  // Com imagem de exibição: miniatura com moldura na cor do status; sem: o bonequinho.
  const url = peerAvatarUrl(p.id);
  if (url) {
    const mini = el('span', 'mini-avatar');
    const img = el('img');
    img.alt = '';
    img.src = url;
    mini.append(img);
    li.append(mini);
  } else {
    li.append(icon('buddy', 'buddy'));
  }
  li.append(el('span', 'contact-name', p.name));
  if (extra) {
    // Mensagem pessoal com emoticons, como no MSN.
    const span = el('span', 'contact-extra');
    renderRichText(span, extra, { links: false });
    li.append(span);
  }
  return li;
}

export function renderContacts() {
  const query = els.search.value.trim().toLowerCase();
  const all = [...state.peers.values()].sort((a, b) => a.name.localeCompare(b.name));
  const matches = (p: PeerInfo) =>
    !query || p.name.toLowerCase().includes(query) || p.message.toLowerCase().includes(query) || p.address.includes(query);

  const online = all.filter((p) => p.online && matches(p));
  const offline = all.filter((p) => !p.online && matches(p));

  els.listOnline.replaceChildren(...online.map(contactRow));
  els.listOffline.replaceChildren(...offline.map(contactRow));
  els.countOnline.textContent = String(online.length);
  els.countOffline.textContent = String(offline.length);
  els.groupOffline.hidden = offline.length === 0;
  els.empty.hidden = all.length > 0;
}

onPeersChange(renderContacts);
onPeerAvatarsChange(renderContacts);
els.search.addEventListener('input', renderContacts);

for (const list of [els.listOnline, els.listOffline]) {
  list.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.contact');
    selectedId = row?.dataset.id ?? null;
    document.querySelectorAll('.contact.is-selected').forEach((n) => n.classList.remove('is-selected'));
    row?.classList.add('is-selected');
  });
  list.addEventListener('dblclick', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('.contact')?.dataset.id;
    if (id) handlers.openChat(id);
  });
  list.addEventListener('keydown', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('.contact')?.dataset.id;
    if (e.key === 'Enter' && id) handlers.openChat(id);
  });
}

// Grupos Online/Offline recolhíveis
document.querySelectorAll<HTMLButtonElement>('.group-header').forEach((btn) =>
  btn.addEventListener('click', () => {
    btn.setAttribute('aria-expanded', String(btn.getAttribute('aria-expanded') !== 'true'));
  }),
);

els.menuBtn.addEventListener('click', () =>
  openMenu(els.menuBtn, [
    { label: 'Adicionar contato por IP...', onSelect: () => void openAddDialog() },
    { label: 'Aparência...', onSelect: () => void openAppearanceDialog() },
    {
      label: `${soundsOn ? '✓ ' : ''}Sons de mensagem`,
      onSelect: () =>
        void chat()
          .setSounds(!soundsOn)
          .then(setSoundsOn)
          .catch((err) => console.warn(errorMessage(err))),
    },
    {
      label: `${linkPreviews ? '✓ ' : ''}Prévia dos links que eu envio`,
      onSelect: () =>
        void chat()
          .setLinkPreviews(!linkPreviews)
          .then(setLinkPreviews)
          .catch((err) => console.warn(errorMessage(err))),
    },
    {
      label: `${shareListening ? '✓ ' : ''}Mostrar o que estou ouvindo (Spotify)`,
      onSelect: () =>
        void chat()
          .setShareListening(!shareListening)
          .then(setShareListening)
          .catch((err) => console.warn(errorMessage(err))),
    },
    { label: 'Ajuda de rede', onSelect: () => handlers.help() },
    'separator',
    { label: 'Sair', onSelect: () => handlers.logout() },
  ]),
);

// ---------------------------------------------------------------- adicionar contato por IP

function renderSaved(list: SavedPeer[]) {
  els.savedWrap.hidden = list.length === 0;
  els.savedList.replaceChildren(
    ...list.map((t) => {
      const li = el('li', 'saved-item');
      const addr = el('button', 'link mono', formatTarget(t.host, t.port));
      addr.type = 'button';
      addr.title = 'Conectar';
      addr.addEventListener('click', () => {
        els.addAddress.value = formatTarget(t.host, t.port);
        void connectFromDialog();
      });
      const remove = el('button', 'saved-remove', '×');
      remove.type = 'button';
      remove.title = 'Esquecer este endereço';
      remove.addEventListener('click', async () => renderSaved(await chat().forget(t.host, t.port)));
      li.append(addr, remove);
      return li;
    }),
  );
}

function setAddStatus(text: string, kind: '' | 'ok' | 'error' = '') {
  els.addStatus.textContent = text;
  els.addStatus.className = `form-status ${kind}`;
}

async function connectFromDialog() {
  const raw = els.addAddress.value.trim();
  const m = /^\[?([^\]\s]+?)\]?(?::(\d+))?$/.exec(raw);
  if (!raw || !m) {
    setAddStatus('Digite o endereço no formato 192.168.0.10:47800', 'error');
    return;
  }
  const host = m[1];
  const port = m[2] ? Number(m[2]) : 47800;
  els.addSubmit.disabled = true;
  setAddStatus(`Conectando a ${formatTarget(host, port)}…`);
  try {
    await chat().connect(host, port);
    setAddStatus('Conectado!', 'ok');
    els.addAddress.value = '';
  } catch (err) {
    const msg = errorMessage(err);
    setAddStatus(/próprio computador/.test(msg) ? msg : `${msg}. Vou continuar tentando sozinho.`, 'error');
  } finally {
    els.addSubmit.disabled = false;
    renderSaved(await chat().getSaved());
  }
}

export async function openAddDialog() {
  setAddStatus('');
  renderSaved(await chat().getSaved());
  els.addDialog.showModal();
  els.addAddress.focus();
}

els.addBtn.addEventListener('click', () => void openAddDialog());
els.emptyAdd.addEventListener('click', () => void openAddDialog());
els.addClose.addEventListener('click', () => els.addDialog.close());
els.addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  void connectFromDialog();
});

// ---------------------------------------------------------------- init

export function initHome(h: HomeHandlers) {
  handlers = h;
}

export function enterHome(self: SelfInfo) {
  renderSelf(self);
  renderContacts();
}
