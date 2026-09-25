// Utilitários de DOM. Conteúdo vindo da rede entra sempre por textContent (nunca innerHTML).
import type { ChatApi } from '../shared/api';

declare global {
  interface Window {
    chat: ChatApi;
  }
}

export const chat = (): ChatApi => window.chat;

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} não encontrado`);
  return node as T;
};

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** <svg><use href="#i-nome"/></svg> usando os símbolos definidos no index.html. */
export function icon(name: string, className?: string) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  if (className) svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export const formatTarget = (host: string, port: number) => (host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`);

/** Copia o texto e mostra "Copiado!" no próprio botão por um instante. */
export async function copyWithFeedback(button: HTMLElement, text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return;
  }
  const prev = button.textContent;
  button.textContent = 'Copiado!';
  window.setTimeout(() => (button.textContent = prev), 1200);
}
