// Cartão de vídeo do YouTube na conversa: a miniatura (veio pela rede local, aparece mesmo sem internet) com ▶.
// O ▶ toca ali mesmo; "Destacar" leva o vídeo, do mesmo ponto, para a janela flutuante sempre por cima.
import type { LinkPreview } from '../shared/api';
import { youtubeStart } from '../shared/links';
import { chat, el } from './dom';
import { previewImage, previewText } from './link-card';
import { YoutubeEmbed } from './youtube-embed';

/** Um vídeo tocando por conversa: dar ▶ em outro volta o anterior para a miniatura. */
let active: { card: HTMLElement; embed: YoutubeEmbed } | null = null;

function stopActive() {
  if (!active) return;
  const { card, embed } = active;
  active = null;
  embed.destroy();
  card.classList.remove('is-playing');
}

function button(className: string, label: string, title: string) {
  const b = el('button', className, label);
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  return b;
}

function play(card: HTMLElement, id: string, start: number) {
  stopActive();
  const embed = new YoutubeEmbed(id, start);
  card.querySelector('.yt-box')?.append(embed.iframe);
  card.classList.add('is-playing');
  active = { card, embed };
}

export function youtubeCard(preview: LinkPreview, onLoad: () => void, peerId: () => string): HTMLElement {
  const id = preview.youtube as string;
  const card = el('div', 'link-card is-video');
  card.dataset.yt = id;

  const box = el('div', 'yt-box');
  const thumb = previewImage(preview, 'yt-thumb', onLoad);
  if (thumb) box.append(thumb);
  const playBtn = button('yt-play', '', 'Assistir aqui');
  playBtn.addEventListener('click', () => play(card, id, youtubeStart(preview.url)));
  box.append(playBtn);

  const actions = el('div', 'yt-actions');
  const detach = button('yt-action', 'Destacar', 'Assistir numa janela flutuante, por cima de tudo');
  detach.addEventListener('click', () => {
    if (active?.card !== card) return;
    const at = active.embed.currentTime();
    stopActive();
    chat().openVideo(id, at, peerId());
  });
  const close = button('yt-action', 'Fechar player', 'Parar o vídeo');
  close.addEventListener('click', () => {
    if (active?.card === card) stopActive();
  });
  actions.append(detach, close);

  const link = el('a', 'yt-link');
  link.href = preview.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = `${preview.url}\nAbrir no navegador`;
  link.append(previewText(preview));

  card.append(box, actions, link);
  return card;
}

/** Vídeo voltou da janela flutuante: toca de novo no cartão dele (o mais recente com esse vídeo). */
export function resumeInline(container: HTMLElement, id: string, start: number) {
  const cards = [...container.querySelectorAll<HTMLElement>('.link-card.is-video')].filter((c) => c.dataset.yt === id);
  const card = cards.at(-1);
  if (!card) return;
  play(card, id, start);
  card.scrollIntoView({ block: 'nearest' });
}
