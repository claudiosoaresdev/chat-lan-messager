// Status de presença (Disponível/Ausente/Ocupado) e o menu suspenso para escolher.
import { PRESENCE_STATUSES, type PresenceStatus } from '../shared/protocol';
import { $, el } from './dom';

export const STATUS_LABEL: Record<PresenceStatus, string> = {
  available: 'Disponível',
  away: 'Ausente',
  busy: 'Ocupado',
};

export interface MenuExtra {
  label: string;
  onSelect(): void;
}

const menu = () => $('status-menu');
let cleanup: (() => void) | null = null;

export function closeMenu() {
  cleanup?.();
  cleanup = null;
  menu().hidden = true;
}

export type MenuEntry = { label: string; status?: PresenceStatus; onSelect(): void } | 'separator';

/** Abre um menu suspenso embaixo do `anchor`, no estilo dos menus do Windows 7. */
export function openMenu(anchor: HTMLElement, entries: MenuEntry[]) {
  closeMenu();
  const m = menu();
  const items: HTMLButtonElement[] = [];

  m.replaceChildren(
    ...entries.map((entry) => {
      if (entry === 'separator') return el('div', 'menu-sep');
      const b = el('button', 'menu-item');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      if (entry.status) {
        const dot = el('span', 'status-dot');
        dot.dataset.status = entry.status;
        b.append(dot);
      }
      b.append(document.createTextNode(entry.label));
      b.addEventListener('click', () => {
        closeMenu();
        entry.onSelect();
      });
      items.push(b);
      return b;
    }),
  );

  const r = anchor.getBoundingClientRect();
  m.hidden = false;
  const left = Math.min(r.left, window.innerWidth - m.offsetWidth - 6);
  m.style.left = `${Math.max(6, left)}px`;
  m.style.top = `${r.bottom + 2}px`;
  items[0]?.focus();

  const onDown = (e: MouseEvent) => {
    if (!m.contains(e.target as Node) && !anchor.contains(e.target as Node)) closeMenu();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeMenu();
      anchor.focus();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    }
  };
  // Adia para não fechar com o próprio clique que abriu.
  window.setTimeout(() => document.addEventListener('mousedown', onDown));
  document.addEventListener('keydown', onKey);
  window.addEventListener('blur', closeMenu);
  cleanup = () => {
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('blur', closeMenu);
  };
}

/** Menu de status (Disponível/Ausente/Ocupado); `extras` vêm depois de um separador (ex.: "Sair"). */
export function openStatusMenu(anchor: HTMLElement, onSelect: (s: PresenceStatus) => void, extras: MenuExtra[] = []) {
  openMenu(anchor, [
    ...PRESENCE_STATUSES.map((s) => ({ label: STATUS_LABEL[s], status: s, onSelect: () => onSelect(s) })),
    ...(extras.length ? (['separator'] as MenuEntry[]) : []),
    ...extras,
  ]);
}
