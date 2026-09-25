// Tela "Entrar no Chat LAN": em vez de e-mail e senha, nome, status, IP para conectar e porta.
import type { LocalInfo, SelfInfo } from '../shared/api';
import type { PresenceStatus } from '../shared/protocol';
import { $, chat, copyWithFeedback, errorMessage } from './dom';
import { STATUS_LABEL, openStatusMenu } from './status';

const els = {
  form: $<HTMLFormElement>('login-form'),
  avatar: $('login-avatar'),
  name: $<HTMLInputElement>('login-name'),
  connect: $<HTMLInputElement>('login-connect'),
  addr: $<HTMLButtonElement>('login-addr'),
  statusBtn: $<HTMLButtonElement>('login-status'),
  statusDot: $('login-status-dot'),
  statusLabel: $('login-status-label'),
  remember: $<HTMLInputElement>('login-remember'),
  auto: $<HTMLInputElement>('login-auto'),
  optionsBtn: $<HTMLButtonElement>('login-options'),
  optionsPanel: $('login-options-panel'),
  port: $<HTMLInputElement>('login-port'),
  error: $('login-error'),
  submit: $<HTMLButtonElement>('login-submit'),
  cancel: $<HTMLButtonElement>('login-cancel'),
};

let info: LocalInfo | null = null;
let status: PresenceStatus = 'available';
let attempt = 0;
let onLoggedIn: (self: SelfInfo) => void = () => undefined;

function setStatus(s: PresenceStatus) {
  status = s;
  els.avatar.dataset.status = s;
  els.statusDot.dataset.status = s;
  els.statusLabel.textContent = STATUS_LABEL[s];
}

function portValue(): number {
  const raw = els.port.value.trim();
  return raw ? Number(raw) : (info?.defaultPort ?? 47800);
}

function renderAddress() {
  const ip = info?.addresses[0];
  els.addr.textContent = ip ? `${ip}:${portValue()}` : 'sem rede';
  els.addr.disabled = !ip;
}

function setBusy(busy: boolean) {
  els.form.classList.toggle('is-busy', busy);
  els.submit.disabled = busy;
  els.submit.textContent = busy ? 'Entrando…' : 'Entrar';
  els.cancel.disabled = !busy;
}

async function submit() {
  els.error.textContent = '';
  const port = portValue();
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    els.error.textContent = 'Porta inválida (use um número entre 1 e 65535).';
    els.optionsPanel.hidden = false;
    els.port.focus();
    return;
  }

  const current = ++attempt;
  setBusy(true);
  try {
    const self = await chat().login({
      name: els.name.value.trim(),
      status,
      port,
      connectTo: els.connect.value.trim(),
      remember: els.remember.checked,
      autoLogin: els.remember.checked && els.auto.checked,
    });
    if (current !== attempt) {
      // Cancelado enquanto entrava.
      await chat().logout();
      return;
    }
    onLoggedIn(self);
  } catch (err) {
    if (current === attempt) els.error.textContent = errorMessage(err);
  } finally {
    if (current === attempt) setBusy(false);
  }
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  void submit();
});

els.cancel.addEventListener('click', () => {
  attempt++;
  setBusy(false);
});

els.statusBtn.addEventListener('click', () => openStatusMenu(els.statusBtn, setStatus));

els.remember.addEventListener('change', () => {
  if (!els.remember.checked) els.auto.checked = false;
  els.auto.disabled = !els.remember.checked;
});

els.auto.addEventListener('change', () => {
  // Entrar automaticamente exige lembrar as informações, como no MSN.
  if (els.auto.checked) els.remember.checked = true;
  els.auto.disabled = false;
});

els.optionsBtn.addEventListener('click', () => {
  els.optionsPanel.hidden = !els.optionsPanel.hidden;
  els.optionsBtn.setAttribute('aria-expanded', String(!els.optionsPanel.hidden));
  if (!els.optionsPanel.hidden) els.port.focus();
});

els.port.addEventListener('input', () => {
  els.port.value = els.port.value.replace(/\D/g, '');
  renderAddress();
});

els.addr.addEventListener('click', () => void copyWithFeedback(els.addr, els.addr.textContent ?? ''));

export function initLogin(handler: (self: SelfInfo) => void) {
  onLoggedIn = handler;
}

/** Prepara a tela com o perfil salvo. Com `allowAuto`, entra sozinho se "Entrar automaticamente" estiver marcado. */
export async function prepareLogin(allowAuto: boolean) {
  const [local, profile] = await Promise.all([chat().getLocalInfo(), chat().getSavedProfile()]);
  info = local;

  els.name.value = profile?.name || local.computerName;
  els.name.placeholder = local.computerName;
  els.connect.value = profile?.connectTo ?? '';
  els.port.value = String(profile?.port ?? local.defaultPort);
  els.port.placeholder = String(local.defaultPort);
  els.remember.checked = profile?.remember ?? false;
  els.auto.checked = profile?.autoLogin ?? false;
  els.auto.disabled = !els.remember.checked;
  els.optionsPanel.hidden = !profile || profile.port === local.defaultPort;
  els.error.textContent = '';
  setStatus(profile?.status ?? 'available');
  setBusy(false);
  renderAddress();

  if (allowAuto && profile?.autoLogin) {
    void submit();
  } else {
    els.name.focus();
    els.name.select();
  }
}
