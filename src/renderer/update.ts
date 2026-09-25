// Barra fixa de atualização: aparece quando há versão nova e só some quando o app reinicia atualizado.
import type { UpdateStatus } from '../shared/api';
import { $, chat, errorMessage } from './dom';

let current: UpdateStatus = { state: 'idle' };

function render(status: UpdateStatus) {
  current = status;
  const bar = $<HTMLButtonElement>('update-bar');
  const text = $('update-bar-text');
  const action = $('update-bar-action');

  bar.hidden = status.state === 'idle';
  bar.classList.toggle('is-error', status.state === 'error');
  bar.disabled = status.state === 'downloading' || status.state === 'installing';

  switch (status.state) {
    case 'downloading':
      text.textContent = 'Baixando uma nova versão do Chat...';
      action.textContent = '';
      break;
    case 'ready':
      text.textContent = status.version ? `Nova versão disponível (${status.version}).` : 'Nova versão disponível.';
      action.textContent = 'Atualizar';
      break;
    case 'installing':
      text.textContent = 'Atualizando... o Chat vai reiniciar.';
      action.textContent = '';
      break;
    case 'error':
      text.textContent = status.message;
      action.textContent = 'Tentar de novo';
      break;
    default:
      text.textContent = '';
      action.textContent = '';
  }
}

async function onClick() {
  try {
    if (current.state === 'ready') await chat().installUpdate();
    else if (current.state === 'error') {
      render({ state: 'idle' });
      await chat().checkForUpdates();
    }
  } catch (err) {
    render({ state: 'error', message: errorMessage(err) });
  }
}

export function initUpdate() {
  $('update-bar').addEventListener('click', () => void onClick());
  chat().onUpdateStatus(render);
  void chat()
    .getUpdateStatus()
    .then(render)
    .catch((): void => undefined);
}
