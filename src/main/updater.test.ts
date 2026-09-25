import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '../shared/api';
import { CHECK_INTERVAL_MS, Updater, feedUrl } from './updater';

class FakeNative extends EventEmitter {
  setFeedURL = vi.fn();
  checkForUpdates = vi.fn();
  quitAndInstall = vi.fn();
}

let native: FakeNative;
let updates: UpdateStatus[];
let updater: Updater;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  native = new FakeNative();
  updates = [];
  updater = new Updater(native, (s) => updates.push(s));
});

afterEach(() => {
  updater.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('feedUrl', () => {
  it('aponta para o update.electronjs.org do repositório', () => {
    expect(feedUrl('win32', 'x64', '1.0.3')).toBe(
      'https://update.electronjs.org/claudiosoaresdev/chat-lan-messager/win32-x64/1.0.3',
    );
  });
});

describe('Updater', () => {
  it('configura o feed e checa depois do atraso inicial e a cada intervalo', () => {
    updater.start('https://feed', 10_000);
    expect(native.setFeedURL).toHaveBeenCalledWith({ url: 'https://feed' });
    expect(native.checkForUpdates).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(native.checkForUpdates).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(CHECK_INTERVAL_MS);
    expect(native.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('avisa baixando e depois pronto com a versão', () => {
    native.emit('update-available');
    native.emit('update-downloaded', {}, '', 'v1.0.7');
    expect(updates).toEqual([{ state: 'downloading' }, { state: 'ready', version: 'v1.0.7' }]);
  });

  it('versão desconhecida vira null', () => {
    native.emit('update-downloaded', {}, '', '');
    expect(updater.getStatus()).toEqual({ state: 'ready', version: null });
  });

  it('não checa de novo enquanto baixa ou com versão pronta', () => {
    native.emit('update-available');
    updater.check();
    native.emit('update-downloaded', {}, '', 'v2');
    updater.check();
    expect(native.checkForUpdates).not.toHaveBeenCalled();
  });

  it('erro na checagem em segundo plano (sem internet) não aparece para o usuário', () => {
    native.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'));
    expect(updates).toEqual([]);
    expect(updater.getStatus()).toEqual({ state: 'idle' });
  });

  it('erro durante o download vira aviso e permite tentar de novo', () => {
    native.emit('update-available');
    native.emit('error', new Error('falhou'));
    expect(updater.getStatus()).toEqual({ state: 'error', message: 'Não foi possível baixar a atualização.' });
    updater.check();
    expect(native.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('instala só quando há versão pronta', () => {
    expect(() => updater.install()).toThrow('Nenhuma atualização pronta');
    native.emit('update-downloaded', {}, '', 'v3');
    updater.install();
    expect(updater.getStatus()).toEqual({ state: 'installing' });
    expect(native.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('erro ao instalar vira aviso', () => {
    native.emit('update-downloaded', {}, '', 'v3');
    updater.install();
    native.emit('error', new Error('Update.exe'));
    expect(updater.getStatus().state).toBe('error');
  });
});
