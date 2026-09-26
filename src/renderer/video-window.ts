// Janela flutuante de vídeo (sempre por cima): só o player do YouTube e uma faixa em cima, com o título (arrasta a
// janela), "Voltar para a conversa" e fechar. A faixa aparece com o mouse em cima da janela, inclusive sobre o vídeo.
import type { VideoRequest } from '../shared/api';
import { $, chat } from './dom';
import { YoutubeEmbed } from './youtube-embed';

/** Ao abrir (e ao trocar de vídeo) a faixa fica visível um tempo, para mostrar onde fechar e arrastar. */
const INTRO_MS = 3000;
/** Depois que o mouse sai, a faixa ainda fica um pouco (dá tempo de voltar até o botão). */
const LINGER_MS = 1200;

export function startVideoWindow(first: VideoRequest) {
  document.documentElement.classList.add('video-mode');
  const root = $('video-root');
  const frame = $('video-frame');
  const title = $('video-title');
  root.hidden = false;

  let hovering = false;
  let hideTimer = 0;
  const showBar = (ms: number) => {
    root.classList.add('show-bar');
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (!hovering) root.classList.remove('show-bar');
    }, ms);
  };
  chat().onVideoHover((inside) => {
    hovering = inside;
    if (inside) root.classList.add('show-bar');
    else showBar(LINGER_MS);
  });

  let current = first;
  let embed: YoutubeEmbed;
  const load = (v: VideoRequest) => {
    current = v;
    embed = new YoutubeEmbed(v.id, v.start);
    frame.append(embed.iframe);
    title.textContent = v.title || 'Vídeo do YouTube';
    document.title = `${v.title || 'Vídeo'} - Chat Live Messenger`;
    showBar(INTRO_MS);
  };
  load(first);

  // Outro vídeo destacado: troca o que está tocando.
  chat().onVideoLoad((v) => {
    embed.destroy();
    load(v);
  });

  $('video-back').addEventListener('click', () => chat().videoBack(current.id, embed.currentTime(), current.peerId));
  $('video-close').addEventListener('click', () => chat().close());
  // Esc com o foco na faixa (o main cuida do Esc com o foco dentro do vídeo).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.fullscreenElement) chat().close();
  });
}
