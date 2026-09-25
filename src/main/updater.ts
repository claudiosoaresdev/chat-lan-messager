// Atualização automática a partir dos releases do GitHub (servidos pelo update.electronjs.org).
// No Windows o Squirrel baixa e aplica a versão nova em segundo plano; o app só reinicia quando o usuário pede.
import type { UpdateStatus } from '../shared/api';

const REPO = 'claudiosoaresdev/chat-lan-messager';
export const CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function feedUrl(platform: string, arch: string, version: string): string {
  return `https://update.electronjs.org/${REPO}/${platform}-${arch}/${version}`;
}

/** O pedaço do `autoUpdater` do Electron que usamos (permite testar sem Electron). */
export interface NativeUpdater {
  setFeedURL(options: { url: string }): void;
  checkForUpdates(): void;
  quitAndInstall(): void;
  on(event: 'update-available', listener: () => void): unknown;
  on(event: 'update-downloaded', listener: (event: unknown, notes: unknown, name: unknown) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
}

export class Updater {
  private status: UpdateStatus = { state: 'idle' };
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private readonly native: NativeUpdater,
    private readonly onStatus: (status: UpdateStatus) => void,
  ) {
    native.on('update-available', () => this.set({ state: 'downloading' }));
    native.on('update-downloaded', (_e, _notes, name) =>
      this.set({ state: 'ready', version: typeof name === 'string' && name.trim() ? name.trim() : null }),
    );
    native.on('error', (err) => {
      console.warn('[chat-lan] atualização:', err?.message ?? err);
      // Sem internet é normal numa rede local: a checagem em segundo plano falha em silêncio.
      // Só vira aviso se havia um download em andamento ou se o usuário pediu para instalar.
      if (this.status.state === 'downloading' || this.status.state === 'installing') {
        this.set({ state: 'error', message: 'Não foi possível baixar a atualização.' });
      }
    });
  }

  start(url: string, firstCheckDelayMs: number) {
    this.native.setFeedURL({ url });
    this.timers.push(setTimeout(() => this.check(), firstCheckDelayMs));
    this.timers.push(setInterval(() => this.check(), CHECK_INTERVAL_MS));
  }

  stop() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }

  getStatus(): UpdateStatus {
    return this.status;
  }

  /** Procura versão nova. Ignorado enquanto já está baixando ou com uma versão pronta. */
  check() {
    const s = this.status.state;
    if (s === 'downloading' || s === 'ready' || s === 'installing') return;
    try {
      this.native.checkForUpdates();
    } catch (err) {
      console.warn('[chat-lan] atualização:', (err as Error).message);
    }
  }

  /** Fecha o app e abre a versão nova já baixada. */
  install() {
    if (this.status.state !== 'ready') throw new Error('Nenhuma atualização pronta para instalar.');
    this.set({ state: 'installing' });
    this.native.quitAndInstall();
  }

  private set(status: UpdateStatus) {
    this.status = status;
    this.onStatus(status);
  }
}
