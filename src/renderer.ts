// Entrada do renderer. O mesmo index.html serve a janela principal (login e contatos)
// e as janelas de conversa (?chat=<id do contato>). Sem acesso ao Node: tudo passa por window.chat.
import { $, chat } from './renderer/dom';
import { startChatWindow } from './renderer/chat-window';
import { startMainWindow } from './renderer/main-window';

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

const chatWith = new URLSearchParams(location.search).get('chat');
if (chatWith) void startChatWindow(chatWith);
else void startMainWindow(openHelp);
