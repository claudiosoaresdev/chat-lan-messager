// Entrada do renderer. O mesmo index.html serve a janela principal (login e contatos)
// e as janelas de conversa (?chat=<id do contato>). Sem acesso ao Node: tudo passa por window.chat.
import { $, chat } from './renderer/dom';
import { initAppearance } from './renderer/appearance';
import { expectContactScene } from './renderer/scene';
import { startChatWindow } from './renderer/chat-window';
import { startMainWindow } from './renderer/main-window';
import { startVideoWindow } from './renderer/video-window';

const query = new URLSearchParams(location.search);
const chatWith = query.get('chat');
const video = query.get('video');

// Conversa: a cena pode ser a do contato; espera por ela em vez de piscar a minha.
if (chatWith) expectContactScene();
// Cores do tema antes de qualquer tela.
initAppearance();

// ---------------------------------------------------------------- barra de título (janela sem moldura)

$('win-min').addEventListener('click', () => chat().minimize());
$('win-max').addEventListener('click', () => chat().toggleMaximize());
$('win-close').addEventListener('click', () => chat().close());
$('titlebar').addEventListener('dblclick', (e) => {
  if (!(e.target as HTMLElement).closest('.titlebar-buttons')) chat().toggleMaximize();
});

// ---------------------------------------------------------------- ajuda

const help = $<HTMLDialogElement>('help-dialog');
const openHelp = () => help.showModal();
for (const id of ['login-help', 'login-footer-help']) {
  $(id).addEventListener('click', openHelp);
}
$('help-close').addEventListener('click', () => help.close());

// ---------------------------------------------------------------- papel da janela

if (video) startVideoWindow({ id: video, start: Number(query.get('start')) || 0, peerId: query.get('peer') ?? '' });
else if (chatWith) void startChatWindow(chatWith);
else void startMainWindow(openHelp);
