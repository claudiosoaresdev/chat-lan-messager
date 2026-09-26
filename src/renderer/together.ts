// "Ouvir junto" (#13): os dois tocam o mesmo vídeo do YouTube na conversa, sincronizados. Quem chama manda um convite;
// quem entra começa no mesmo ponto. Depois, tocar, pausar e pular num lado vale para o outro, e quem chamou manda a
// posição de tempos em tempos para corrigir a diferença. Fechar o player (ou destacar, ou tocar outro) sai.
import type { PeerTogether, TogetherState, UiTogetherInvite } from '../shared/api';
import { isYoutubeId } from '../shared/links';
import { chat, el, errorMessage, timeFmt } from './dom';
import { addLine, addSystem, messagesList, peerName, peerOnline } from './chat';
import { activeVideo, findVideoCard, onVideoStopped, playCard, setTogetherHandler, youtubeCard, type ActiveVideo } from './youtube-card';
import type { YoutubeEmbed } from './youtube-embed';

/** Diferença (s) a partir da qual o player pula para a posição do outro lado (tocando; pausado alinha quase exato). */
const DRIFT_S = 1;
const DRIFT_PAUSED_S = 0.3;
/** Depois de aplicar o estado do outro lado, mudanças do player nesse tempo são efeito disso (não se reenviam). */
const APPLY_QUIET_MS = 1500;
/** Quem chamou manda a posição com esta frequência enquanto toca (corrige a diferença entre os dois). */
const HEARTBEAT_MS = 5000;

interface Session {
  video: string;
  title?: string;
  /** Quem chamou: manda a posição periodicamente. */
  leader: boolean;
  /** Os dois estão juntos (o outro entrou, ou eu entrei). */
  together: boolean;
  quietUntil: number;
  heartbeat: number;
}

let peerId = '';
let session: Session | null = null;
/** Último estado do contato por vídeo (para entrar no ponto certo, mesmo com o convite antigo). */
const remote = new Map<string, TogetherState & { at: number }>();

function send(state: TogetherState) {
  if (!peerId) return;
  chat()
    .sendTogether(peerId, state)
    .catch((err) => addSystem(errorMessage(err)));
}

function setBadge(text: string) {
  const v = activeVideo();
  if (!v) return;
  v.card.classList.toggle('is-together', !!text);
  const badge = v.card.querySelector('.yt-together-badge');
  if (badge) badge.textContent = text;
}

function refreshBadge() {
  if (!session) return setBadge('');
  setBadge(session.together ? `♫ Junto com ${peerName()}` : `Esperando ${peerName()} entrar…`);
}

/** Posição esperada agora a partir de um estado recebido. */
const positionNow = (s: TogetherState & { at: number }) => s.position + (s.playing ? (Date.now() - s.at) / 1000 : 0);

function wire(embed: YoutubeEmbed) {
  embed.onChange((c) => {
    if (!session || embed !== activeVideo()?.embed || Date.now() < session.quietUntil) return;
    send({ video: session.video, playing: c.playing, position: c.time });
  });
}

function startHeartbeat() {
  if (!session) return;
  window.clearInterval(session.heartbeat);
  session.heartbeat = window.setInterval(() => {
    const v = activeVideo();
    if (!session?.together || !v || v.id !== session.video || !v.embed.isPlaying) return;
    send({ video: session.video, playing: true, position: v.embed.currentTime() });
  }, HEARTBEAT_MS);
}

function end() {
  if (session) window.clearInterval(session.heartbeat);
  session = null;
  setBadge('');
}

/** "Ouvir junto" no cartão que está tocando: manda o convite. */
function invite(v: ActiveVideo) {
  if (!peerOnline()) {
    addSystem(`${peerName()} está offline.`);
    return;
  }
  if (session?.video === v.id) return;
  if (session) leave();
  session = { video: v.id, ...(v.title ? { title: v.title } : {}), leader: true, together: false, quietUntil: 0, heartbeat: 0 };
  wire(v.embed);
  const position = v.embed.currentTime();
  send({ video: v.id, ...(v.title ? { title: v.title } : {}), playing: true, position, invite: true });
  addTogetherInvite({ from: '', fromName: '', video: v.id, ...(v.title ? { title: v.title } : {}), position, ts: Date.now(), self: true });
  refreshBadge();
  startHeartbeat();
}

/** Sai (avisa o outro lado). */
function leave() {
  if (!session) return;
  send({ video: null, playing: false, position: 0 });
  end();
}

/** Entrar no convite: toca o vídeo no ponto em que o outro está. */
function join(video: string, title: string | undefined, fallback: number, line: HTMLElement) {
  if (!peerOnline()) {
    addSystem(`${peerName()} está offline.`);
    return;
  }
  // Sem o cartão (a prévia não chegou): monta um só com o título, dentro da própria linha do convite.
  let card = findVideoCard(messagesList(), video);
  if (!card) {
    card = youtubeCard({ url: `https://www.youtube.com/watch?v=${video}`, title: title ?? 'Vídeo do YouTube', siteName: 'YouTube', youtube: video }, () => undefined, () => peerId);
    const wrap = el('div', 'link-card-wrap');
    wrap.append(card);
    line.append(wrap);
  }
  if (session) leave();
  const st = remote.get(video);
  const position = st ? positionNow(st) : fallback;
  const v = playCard(card, position);
  if (!v) return;
  session = { video, ...(title ? { title } : {}), leader: false, together: true, quietUntil: Date.now() + APPLY_QUIET_MS, heartbeat: 0 };
  wire(v.embed);
  if (st && !st.playing) v.embed.pause();
  send({ video, playing: st?.playing ?? true, position });
  card.scrollIntoView({ block: 'nearest' });
  addSystem(`Você entrou para ouvir junto com ${peerName()}.`);
  refreshBadge();
}

/** Estado do contato: aplica no player se estamos juntos no mesmo vídeo. */
function receive(t: PeerTogether) {
  if (t.video === null) {
    remote.clear();
    if (session) {
      end();
      addSystem(`${t.fromName} saiu do ouvir junto.`);
    }
    return;
  }
  remote.set(t.video, { ...t, at: Date.now() });
  if (!session || session.video !== t.video) return;
  if (!session.together) {
    session.together = true;
    addSystem(`${t.fromName} entrou para ouvir junto.`);
    refreshBadge();
  }
  const v = activeVideo();
  if (!v || v.id !== t.video) return;
  session.quietUntil = Date.now() + APPLY_QUIET_MS;
  if (t.playing && !v.embed.isPlaying) v.embed.play();
  if (!t.playing && v.embed.isPlaying) v.embed.pause();
  if (Math.abs(t.position - v.embed.currentTime()) > (t.playing ? DRIFT_S : DRIFT_PAUSED_S)) v.embed.seekTo(t.position);
}

/** Convite na conversa (meu ou do contato), com "Entrar" nos do contato. */
export function addTogetherInvite(inv: UiTogetherInvite) {
  if (!isYoutubeId(inv.video)) return;
  if (!inv.self && !remote.has(inv.video)) remote.set(inv.video, { video: inv.video, playing: true, position: inv.position, at: inv.ts });
  const li = el('li', 'together-line');
  li.title = timeFmt.format(inv.ts);
  const what = inv.title ? `: ${inv.title}` : '';
  li.append(el('span', 'together-icon', '♫'));
  li.append(el('span', 'together-text', inv.self ? `Você chamou ${peerName()} para ouvir junto${what}` : `${inv.fromName} chamou você para ouvir junto${what}`));
  if (!inv.self) {
    const btn = el('button', 'link together-join', 'Entrar');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      join(inv.video, inv.title, inv.position, li);
      if (session?.video === inv.video) btn.disabled = true;
    });
    li.append(btn);
  }
  addLine(li, inv.self, inv.ts);
}

/** Contato ficou offline: a sessão acaba sem aviso de rede. */
export function togetherPeerOffline() {
  if (!session) return;
  end();
  addSystem('O ouvir junto terminou (contato offline).');
}

export function initTogether(id: string) {
  peerId = id;
  setTogetherHandler(invite);
  onVideoStopped((stopped) => {
    if (session?.video !== stopped.id) return;
    leave();
    addSystem('Você saiu do ouvir junto.');
  });
  chat().onPeerTogether((t) => {
    if (t.from === peerId) receive(t);
  });
}
