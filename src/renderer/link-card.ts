// Cartão da prévia de link embaixo da mensagem: miniatura, site, título e descrição (como no WhatsApp).
// O cartão inteiro é um link que abre no navegador. Vídeos do YouTube ganham o botão ▶ (youtube-player.ts).
import type { LinkPreview } from '../shared/api';
import { el } from './dom';

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Miniatura em blob: (liberada junto com as imagens quando a mensagem sai da tela). */
export function previewImage(preview: LinkPreview, className: string, onLoad: () => void): HTMLImageElement | null {
  if (!preview.image) return null;
  const url = URL.createObjectURL(new Blob([preview.image.data as Uint8Array<ArrayBuffer>], { type: preview.image.mime }));
  const img = el('img', className);
  img.alt = '';
  img.src = url;
  img.addEventListener('load', onLoad);
  img.addEventListener('error', () => {
    URL.revokeObjectURL(url);
    img.remove();
  });
  return img;
}

/** Textos do cartão: site, título (2 linhas) e descrição (2 linhas). */
export function previewText(preview: LinkPreview): HTMLElement {
  const text = el('span', 'link-card-text');
  text.append(el('span', 'link-card-site', preview.siteName || hostOf(preview.url)));
  text.append(el('span', 'link-card-title', preview.title));
  if (preview.description) text.append(el('span', 'link-card-desc', preview.description));
  return text;
}

export function linkCard(preview: LinkPreview, onLoad: () => void): HTMLElement {
  const card = el('a', 'link-card');
  card.href = preview.url;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.title = preview.url;
  const img = previewImage(preview, 'link-card-image', onLoad);
  if (img) card.append(img);
  card.append(previewText(preview));
  return card;
}
