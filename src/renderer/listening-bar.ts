// Barra acima da conversa: letreiro com a música que o contato está ouvindo no Spotify (ou a minha, se ele não
// estiver ouvindo nada), como o "O que estou ouvindo" do WLM. Nada tocando dos dois lados: a barra some.
import type { Listening } from '../shared/api';
import { $, chat, el } from './dom';

/** Velocidade do letreiro: igual para músicas de nome curto ou longo. */
const PX_PER_SECOND = 45;
/** Espaço entre o fim do texto e o começo da cópia seguinte. */
const GAP_PX = 48;
const FADE_MS = 160;

const els = {
  bar: $('chat-toolbar'),
  button: $<HTMLButtonElement>('listening'),
  marquee: $('listening-marquee'),
  track: $('listening-track'),
};

let mine: Listening | null = null;
let theirs: Listening | null = null;
let peerName = '';
let shownText = '';
let fadeTimer = 0;

const song = (l: Listening) => (l.artist ? `${l.artist} – ${l.title}` : l.title);

function current(): { text: string; query: string } | null {
  if (theirs) return { text: `${peerName || 'Contato'} está ouvindo: ${song(theirs)}`, query: song(theirs).replace(' – ', ' ') };
  if (mine) return { text: `Você está ouvindo: ${song(mine)}`, query: song(mine).replace(' – ', ' ') };
  return null;
}

/** Mede o texto: se couber, fica parado; senão, duas cópias rolando sem emenda. */
function layout() {
  const text = shownText;
  const copy = el('span', 'marquee-copy', text);
  els.track.replaceChildren(copy);
  els.marquee.classList.remove('is-scrolling');
  els.track.style.removeProperty('--marquee-distance');
  els.track.style.removeProperty('--marquee-duration');
  if (!text || copy.offsetWidth <= els.marquee.clientWidth) return;
  const distance = copy.offsetWidth + GAP_PX;
  const twin = el('span', 'marquee-copy', text);
  twin.setAttribute('aria-hidden', 'true');
  els.track.append(twin);
  els.track.style.setProperty('--marquee-gap', `${GAP_PX}px`);
  els.track.style.setProperty('--marquee-distance', `${distance}px`);
  els.track.style.setProperty('--marquee-duration', `${(distance / PX_PER_SECOND).toFixed(2)}s`);
  els.marquee.classList.add('is-scrolling');
}

function render() {
  const next = current();
  els.bar.hidden = !next;
  const text = next?.text ?? '';
  els.button.title = next ? `${next.text}\nClique para procurar no Spotify` : '';
  els.button.dataset.query = next?.query ?? '';
  // Mesma música: não reinicia a animação.
  if (text === shownText) return;
  shownText = text;
  window.clearTimeout(fadeTimer);
  if (!next) {
    els.track.replaceChildren();
    return;
  }
  els.marquee.classList.add('is-changing');
  fadeTimer = window.setTimeout(() => {
    layout();
    els.marquee.classList.remove('is-changing');
  }, els.track.childElementCount ? FADE_MS : 0);
}

/** Nome do contato mudou (aparece no texto). */
export function setListeningPeerName(name: string) {
  if (name === peerName) return;
  peerName = name;
  render();
}

export async function startListeningBar(peerId: string) {
  chat().onMyListening((l) => {
    mine = l;
    render();
  });
  chat().onPeerListening((l) => {
    if (l.id !== peerId) return;
    theirs = l.listening;
    render();
  });
  // Janela mudou de largura: o texto pode passar a caber (ou não).
  let lastWidth = 0;
  new ResizeObserver(() => {
    const w = els.marquee.clientWidth;
    if (w === lastWidth || !shownText) return;
    lastWidth = w;
    layout();
  }).observe(els.marquee);
  els.button.addEventListener('click', () => {
    const q = els.button.dataset.query;
    if (q) window.open(`https://open.spotify.com/search/${encodeURIComponent(q)}`, '_blank', 'noopener');
  });
  try {
    const now = await chat().getListening(peerId);
    mine = now.mine;
    theirs = now.peer;
  } catch {
    // sem música: barra escondida
  }
  render();
}
