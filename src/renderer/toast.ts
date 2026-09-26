// Aviso no canto da janela quando chega mensagem fora da conversa, no clima do popup do MSN.
import { $, el, icon } from './dom';
import { renderRichText } from './emoticons';

const MAX_TOASTS = 3;
const TOAST_MS = 5000;

/** `heading` padrão é "Fulano diz:"; passe outro texto para avisos como "chamou a sua atenção". */
export function showToast(from: string, text: string, onClick: () => void, heading = `${from} diz:`) {
  const box = $('toasts');
  const toast = el('div', 'toast');
  const title = el('div', 'toast-title');
  title.append(icon('butterfly'), document.createTextNode('Chat Live Messenger'));
  const body = el('div', 'toast-body');
  body.append(el('div', 'toast-from', heading));
  if (text) {
    const t = el('div', 'toast-text');
    renderRichText(t, text, { links: false });
    body.append(t);
  }
  toast.append(title, body);

  const dismiss = () => toast.remove();
  toast.addEventListener('click', () => {
    dismiss();
    onClick();
  });
  window.setTimeout(dismiss, TOAST_MS);

  box.append(toast);
  while (box.children.length > MAX_TOASTS) box.firstElementChild?.remove();
}

export function clearToasts() {
  $('toasts').replaceChildren();
}
