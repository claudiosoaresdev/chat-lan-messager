import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NowPlayingWatcher,
  linuxReader,
  macReader,
  parseSpotifyWindowTitle,
  windowsReader,
  type Exec,
  type NowPlaying,
  type NowPlayingReader,
} from './now-playing';

const fail = (message: string, code?: string) => Promise.reject(Object.assign(new Error(message), { code }));

describe('parseSpotifyWindowTitle', () => {
  it('separa artista e música no primeiro " - "', () => {
    expect(parseSpotifyWindowTitle('Legião Urbana - Tempo Perdido')).toEqual({ artist: 'Legião Urbana', title: 'Tempo Perdido' });
    expect(parseSpotifyWindowTitle('Queen - Bohemian Rhapsody - Remastered 2011')).toEqual({
      artist: 'Queen',
      title: 'Bohemian Rhapsody - Remastered 2011',
    });
  });

  it('pausado ou sem música', () => {
    for (const t of ['Spotify', 'Spotify Premium', 'Spotify Free', '', 'N/A', 'Advertisement']) {
      expect(parseSpotifyWindowTitle(t)).toBeNull();
    }
  });

  it('corta textos enormes', () => {
    const np = parseSpotifyWindowTitle(`${'a'.repeat(300)} - ${'b'.repeat(300)}`);
    expect(np?.artist.length).toBe(128);
    expect(np?.title.length).toBe(128);
  });
});

describe('macReader', () => {
  it('Spotify fechado: não chama o AppleScript', async () => {
    const exec = vi.fn<Exec>((file) => (file === 'pgrep' ? fail('exit 1') : Promise.resolve('')));
    expect(await macReader(exec).read()).toBeNull();
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('tocando e pausado', async () => {
    let out = 'Daft Punk\tOne More Time\n';
    const exec: Exec = (file) => Promise.resolve(file === 'pgrep' ? '123\n' : out);
    const reader = macReader(exec);
    expect(await reader.read()).toEqual({ artist: 'Daft Punk', title: 'One More Time' });
    out = '\n';
    expect(await reader.read()).toBeNull();
  });

  it('permissão negada: para de tentar', async () => {
    const exec = vi.fn<Exec>((file) =>
      file === 'pgrep' ? Promise.resolve('1') : fail('execution error: Not authorized to send Apple events to Spotify. (-1743)'),
    );
    const reader = macReader(exec);
    expect(await reader.read()).toBeNull();
    expect(await reader.read()).toBeNull();
    expect(exec).toHaveBeenCalledTimes(2);
  });
});

describe('linuxReader', () => {
  it('só "Playing" conta', async () => {
    let out = 'Playing\tAC/DC\tThunderstruck\n';
    const reader = linuxReader(() => Promise.resolve(out));
    expect(await reader.read()).toEqual({ artist: 'AC/DC', title: 'Thunderstruck' });
    out = 'Paused\tAC/DC\tThunderstruck\n';
    expect(await reader.read()).toBeNull();
  });

  it('sem playerctl: desiste', async () => {
    const exec = vi.fn<Exec>(() => fail('spawn playerctl ENOENT', 'ENOENT'));
    const reader = linuxReader(exec);
    await reader.read();
    await reader.read();
    expect(exec).toHaveBeenCalledTimes(1);
  });
});

describe('windowsReader', () => {
  function fakeChild() {
    const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams & { stdout: PassThrough };
    Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: vi.fn() });
    return child;
  }

  it('lê o título que o PowerShell escreve e abre um processo só', async () => {
    const child = fakeChild();
    const spawnImpl = vi.fn(() => child);
    const reader = windowsReader(spawnImpl);
    expect(await reader.read()).toBeNull();
    child.stdout.write('T:Titãs - Epitáfio\r\n');
    await new Promise((r) => setImmediate(r));
    expect(await reader.read()).toEqual({ artist: 'Titãs', title: 'Epitáfio' });
    child.stdout.write('T:Spotify Premium\r\n');
    await new Promise((r) => setImmediate(r));
    expect(await reader.read()).toBeNull();
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    reader.stop();
    expect(child.kill).toHaveBeenCalled();
  });
});

describe('NowPlayingWatcher', () => {
  afterEach(() => vi.useRealTimers());

  it('emite só quando muda e null ao parar', async () => {
    vi.useFakeTimers();
    let value: NowPlaying | null = { artist: 'A', title: 'B' };
    const reader: NowPlayingReader = { read: () => Promise.resolve(value), stop: vi.fn() };
    const w = new NowPlayingWatcher(reader, 1000);
    const changes: Array<NowPlaying | null> = [];
    w.on('change', (np) => changes.push(np));
    w.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(changes).toEqual([{ artist: 'A', title: 'B' }]);
    value = { artist: 'A', title: 'C' };
    await vi.advanceTimersByTimeAsync(1000);
    expect(changes).toEqual([{ artist: 'A', title: 'B' }, { artist: 'A', title: 'C' }]);
    w.stop();
    expect(changes.at(-1)).toBeNull();
    expect(w.running).toBe(false);
    expect(reader.stop).toHaveBeenCalled();
  });

  it('erro do leitor vira "nada tocando"', async () => {
    const reader: NowPlayingReader = { read: () => Promise.reject(new Error('x')), stop: () => undefined };
    const w = new NowPlayingWatcher(reader, 1000);
    w.start();
    await w.poll();
    expect(w.current).toBeNull();
    w.stop();
  });
});
