// Cartão de vídeo do YouTube na conversa: a miniatura (veio pela rede local, aparece mesmo sem internet) com ▶.
// O ▶ toca ali mesmo; "Destacar" leva o vídeo, do mesmo ponto, para a janela flutuante sempre por cima; "Ouvir junto"
// chama o contato para tocar o mesmo vídeo sincronizado (together.ts).
import type { LinkPreview } from '../shared/api';
import { youtubeStart } from '../shared/links';
import { chat, el } from './dom';
import { previewImage, previewText } from './link-card';
import { YoutubeEmbed } from './youtube-embed';

export interface ActiveVideo {
  card: HTMLElement;
  embed: YoutubeEmbed;
  id: string;
  title?: string;
}

/** Um vídeo tocando por conversa: dar ▶ em outro volta o anterior para a miniatura. */
let active: ActiveVideo | null = null;

const stopListeners: Array<(stopped: ActiveVideo) => void> = [];

/** O vídeo tocando na conversa (null se nenhum). */
export const activeVideo = () => active;

/** Avisa quando o vídeo tocando para (fechado, trocado por outro, destacado para a janela flutuante). */
export function onVideoStopped(fn: (stopped: ActiveVideo) => void) {
  stopListeners.push(fn);
}

export function stopActive() {
  if (!active) return;
  const stopped = active;
  active = null;
  stopped.embed.destroy();
  stopped.card.classList.remove('is-playing');
  stopListeners.forEach((fn) => fn(stopped));
}

function button(className: string, label: string, title: string) {
  const b = el('button', className, label);
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  return b;
}

/** Toca o vídeo no cartão, a partir de `start` segundos (para o que estiver tocando). */
export function playCard(card: HTMLElement, start: number): ActiveVideo | null {
  const id = card.dataset.yt;
  if (!id) return null;
  stopActive();
  const embed = new YoutubeEmbed(id, start);
  card.querySelector('.yt-box')?.append(embed.iframe);
  card.classList.add('is-playing');
  active = { card, embed, id, ...(card.dataset.title ? { title: card.dataset.title } : {}) };
  return active;
}

/** "Ouvir junto": quem trata o clique (together.ts), para não haver import circular. */
let onTogether: ((video: ActiveVideo) => void) | null = null;
export function setTogetherHandler(fn: (video: ActiveVideo) => void) {
  onTogether = fn;
}

export function youtubeCard(preview: LinkPreview, onLoad: () => void, peerId: () => string): HTMLElement {
  const id = preview.youtube as string;
  const card = el('div', 'link-card is-video');
  card.dataset.yt = id;
  if (preview.title) card.dataset.title = preview.title;

  const box = el('div', 'yt-box');
  const thumb = previewImage(preview, 'yt-thumb', onLoad);
  if (thumb) box.append(thumb);
  const playBtn = button('yt-play', '', 'Assistir aqui');
  playBtn.addEventListener('click', () => playCard(card, youtubeStart(preview.url)));
  box.append(playBtn);

  const actions = el('div', 'yt-actions');
  const together = button('yt-action yt-together', 'Ouvir junto', 'Chamar o contato para ouvir/assistir junto, sincronizado');
  together.addEventListener('click', () => {
    if (active?.card === card) onTogether?.(active);
  });
  const detach = button('yt-action', 'Destacar', 'Assistir numa janela flutuante, por cima de tudo');
  detach.addEventListener('click', () => {
    if (active?.card !== card) return;
    const at = active.embed.currentTime();
    stopActive();
    chat().openVideo(id, at, peerId(), preview.title);
  });
  const close = button('yt-action', 'Fechar player', 'Parar o vídeo');
  close.addEventListener('click', () => {
    if (active?.card === card) stopActive();
  });
  const badge = el('span', 'yt-together-badge');
  actions.append(together, detach, close, badge);

  const link = el('a', 'yt-link');
  link.href = preview.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = `${preview.url}\nAbrir no navegador`;
  link.append(previewText(preview));

  card.append(box, actions, link);
  return card;
}

/** Cartão mais recente com esse vídeo na conversa. */
export function findVideoCard(container: HTMLElement, id: string): HTMLElement | null {
  const cards = [...container.querySelectorAll<HTMLElement>('.link-card.is-video')].filter((c) => c.dataset.yt === id);
  return cards.at(-1) ?? null;
}

/** Vídeo voltou da janela flutuante: toca de novo no cartão dele (o mais recente com esse vídeo). */
export function resumeInline(container: HTMLElement, id: string, start: number) {
  const card = findVideoCard(container, id);
  if (!card) return;
  playCard(card, start);
  card.scrollIntoView({ block: 'nearest' });
}
