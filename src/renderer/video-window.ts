// Janela flutuante de vídeo (sempre por cima, arrastável pela faixa de cima): só o player do YouTube.
import type { VideoRequest } from '../shared/api';
import { $, chat } from './dom';
import { YoutubeEmbed } from './youtube-embed';

export function startVideoWindow(first: VideoRequest) {
  document.documentElement.classList.add('video-mode');
  document.title = 'Vídeo - Chat Live Messenger';
  $('video-root').hidden = false;
  const frame = $('video-frame');

  let current = first;
  let embed = new YoutubeEmbed(first.id, first.start);
  frame.append(embed.iframe);

  // Outro vídeo destacado: troca o que está tocando.
  chat().onVideoLoad((v) => {
    embed.destroy();
    current = v;
    embed = new YoutubeEmbed(v.id, v.start);
    frame.append(embed.iframe);
  });

  $('video-back').addEventListener('click', () => chat().videoBack(current.id, embed.currentTime(), current.peerId));
  $('video-close').addEventListener('click', () => chat().close());
}
