// "O que estou ouvindo": a música tocando no Spotify instalado no computador (sem conta nem internet).
// macOS: AppleScript; Windows: título da janela do Spotify ("Artista - Música"); Linux: MPRIS via playerctl.
// Nada aqui abre o Spotify: se ele está fechado, é "nada tocando".
import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { MAX_LISTENING_LENGTH } from '../shared/protocol';

export interface NowPlaying {
  artist: string;
  title: string;
}

/** Roda um programa (sem shell) e devolve a saída padrão; rejeita em erro ou timeout. */
export type Exec = (file: string, args: string[]) => Promise<string>;

export type NowPlayingReader = { read(): Promise<NowPlaying | null>; stop(): void };

export const POLL_MS = 5_000;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_LISTENING_LENGTH);

export function nowPlaying(artist: string, title: string): NowPlaying | null {
  const a = clean(artist);
  const t = clean(title);
  return t ? { artist: a, title: t } : null;
}

export const sameNowPlaying = (a: NowPlaying | null, b: NowPlaying | null) =>
  a === b || (!!a && !!b && a.artist === b.artist && a.title === b.title);

/** Título da janela do Spotify no Windows: "Artista - Música" tocando; "Spotify", "Spotify Premium"… pausado. */
export function parseSpotifyWindowTitle(title: string): NowPlaying | null {
  const t = title.trim();
  if (!t || /^spotify( (premium|free))?$/i.test(t)) return null;
  const at = t.indexOf(' - ');
  if (at <= 0) return null;
  return nowPlaying(t.slice(0, at), t.slice(at + 3));
}

// ---------------------------------------------------------------- macOS

const MAC_SCRIPT = [
  'tell application "Spotify"',
  'if player state is playing then return (artist of current track) & tab & (name of current track)',
  'end tell',
  'return ""',
];

/**
 * macOS: só chama o AppleScript com o Spotify aberto (`pgrep`), senão o `tell` abriria o app ou perguntaria onde ele
 * está. Na primeira vez o sistema pede permissão de Automação; negada, para de tentar até reiniciar o app.
 */
export function macReader(exec: Exec): NowPlayingReader {
  let denied = false;
  return {
    async read() {
      if (denied) return null;
      try {
        await exec('pgrep', ['-x', 'Spotify']);
      } catch {
        return null; // fechado
      }
      try {
        const out = await exec('osascript', MAC_SCRIPT.flatMap((line) => ['-e', line]));
        const [artist = '', title = ''] = out.replace(/\r?\n$/, '').split('\t');
        return nowPlaying(artist, title);
      } catch (err) {
        // -1743: o usuário não autorizou o controle do Spotify.
        if (/-1743|not authori[sz]ed/i.test(String((err as Error).message))) denied = true;
        return null;
      }
    },
    stop() {
      // nada a liberar
    },
  };
}

// ---------------------------------------------------------------- Linux

export function linuxReader(exec: Exec): NowPlayingReader {
  let missing = false;
  return {
    async read() {
      if (missing) return null;
      try {
        const out = await exec('playerctl', ['-p', 'spotify', 'metadata', '--format', '{{status}}\t{{artist}}\t{{title}}']);
        const [status, artist = '', title = ''] = out.replace(/\r?\n$/, '').split('\t');
        return status === 'Playing' ? nowPlaying(artist, title) : null;
      } catch (err) {
        // Sem playerctl instalado: desiste em silêncio. Spotify fechado também dá erro, mas esse passa.
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') missing = true;
        return null;
      }
    },
    stop() {
      // nada a liberar
    },
  };
}

// ---------------------------------------------------------------- Windows

// Um PowerShell só, que fica rodando e escreve o título quando muda (abrir um a cada 5 s pesaria na CPU).
// Saída em UTF-8 para acentos no nome das músicas.
const WIN_SCRIPT = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  '$last = $null',
  'while ($true) {',
  '  $t = (Get-Process Spotify -ErrorAction SilentlyContinue | Where-Object MainWindowTitle | Select-Object -First 1).MainWindowTitle',
  '  if ($t -ne $last) { [Console]::Out.WriteLine("T:" + $t); [Console]::Out.Flush(); $last = $t }',
  '  Start-Sleep -Seconds 3',
  '}',
].join('\n');

export type Spawn = (file: string, args: string[]) => ChildProcessWithoutNullStreams;

export function windowsReader(spawnImpl: Spawn = (f, a) => spawn(f, a, { windowsHide: true })): NowPlayingReader {
  let child: ChildProcessWithoutNullStreams | null = null;
  let title = '';
  let failures = 0;
  let buffer = '';

  const start = () => {
    if (child || failures >= 3) return;
    const c = spawnImpl('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', WIN_SCRIPT]);
    child = c;
    c.stdout.setEncoding('utf8');
    c.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        if (line.startsWith('T:')) title = line.slice(2);
      }
    });
    c.on('error', () => undefined);
    c.on('exit', () => {
      if (child !== c) return;
      child = null;
      title = '';
      failures++;
    });
  };

  return {
    async read() {
      start();
      return parseSpotifyWindowTitle(title);
    },
    stop() {
      const c = child;
      child = null;
      title = '';
      c?.kill();
    },
  };
}

export function readerFor(platform: NodeJS.Platform, exec: Exec): NowPlayingReader | null {
  if (platform === 'darwin') return macReader(exec);
  if (platform === 'win32') return windowsReader();
  if (platform === 'linux') return linuxReader(exec);
  return null;
}

// ---------------------------------------------------------------- consulta periódica

export interface NowPlayingEvents {
  change: [NowPlaying | null];
}

/** Consulta a cada `intervalMs` e emite `change` só quando a música muda (null = nada tocando). */
export class NowPlayingWatcher extends EventEmitter<NowPlayingEvents> {
  private timer: NodeJS.Timeout | null = null;
  private _current: NowPlaying | null = null;
  private busy = false;

  constructor(
    private readonly reader: NowPlayingReader,
    private readonly intervalMs = POLL_MS,
  ) {
    super();
  }

  get current() {
    return this._current;
  }

  get running() {
    return this.timer !== null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
    void this.poll();
  }

  /** Para a consulta; se havia música, emite `change(null)`. */
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.reader.stop();
    this.set(null);
  }

  async poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      const next = await this.reader.read().catch((): null => null);
      if (this.timer) this.set(next);
    } finally {
      this.busy = false;
    }
  }

  private set(next: NowPlaying | null) {
    if (sameNowPlaying(this._current, next)) return;
    this._current = next;
    this.emit('change', next);
  }
}
