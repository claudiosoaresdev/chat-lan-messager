import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, SettingsStore, defaultSettings, parseArgs, parseHostPort, parseProfile, rememberPeer } from './config';

describe('parseHostPort', () => {
  it('lê host e porta', () => {
    expect(parseHostPort('192.168.0.10:5001')).toEqual({ host: '192.168.0.10', port: 5001 });
    expect(parseHostPort(' meu-pc.local:80 ')).toEqual({ host: 'meu-pc.local', port: 80 });
    expect(parseHostPort('[fe80::1]:9000')).toEqual({ host: 'fe80::1', port: 9000 });
  });

  it('usa a porta padrão quando omitida', () => {
    expect(parseHostPort('192.168.0.10')).toEqual({ host: '192.168.0.10', port: DEFAULT_PORT });
  });

  it('rejeita entradas inválidas', () => {
    expect(parseHostPort('')).toBeNull();
    expect(parseHostPort('1.2.3.4:0')).toBeNull();
    expect(parseHostPort('1.2.3.4:70000')).toBeNull();
    expect(parseHostPort('1.2.3.4:abc')).toBeNull();
  });
});

describe('parseArgs', () => {
  it('lê --port e --connect nas duas formas', () => {
    expect(parseArgs(['electron', '.', '--port=5001', '--connect', '10.0.0.2:5001'])).toEqual({
      port: 5001,
      connect: [{ host: '10.0.0.2', port: 5001 }],
    });
  });

  it('aceita vários --connect e lista separada por vírgula', () => {
    expect(parseArgs(['--connect=10.0.0.2,10.0.0.3:6000', '--connect=10.0.0.4']).connect).toEqual([
      { host: '10.0.0.2', port: DEFAULT_PORT },
      { host: '10.0.0.3', port: 6000 },
      { host: '10.0.0.4', port: DEFAULT_PORT },
    ]);
  });

  it('ignora flags desconhecidas e porta inválida', () => {
    expect(parseArgs(['--inspect', '--port=abc', '--portx=1'])).toEqual({ connect: [] });
  });
});

describe('rememberPeer', () => {
  it('coloca no topo sem duplicar e limita a 10', () => {
    const a = { host: 'a', port: 1 };
    const b = { host: 'b', port: 1 };
    expect(rememberPeer([a, b], b)).toEqual([b, a]);
    const many = Array.from({ length: 12 }, (_, i) => ({ host: `h${i}`, port: 1 }));
    expect(rememberPeer(many, a)).toHaveLength(10);
  });
});

describe('SettingsStore', () => {
  it('salva e carrega; arquivo ausente ou corrompido vira padrão', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatlan-'));
    const store = new SettingsStore(dir);
    expect(store.load()).toEqual(defaultSettings());

    const font = {
      family: 'Georgia',
      size: 14,
      weight: 400,
      bold: false,
      italic: true,
      underline: false,
      color: '#004080',
    } as const;
    store.save({
      manualPeers: [{ host: '10.0.0.2', port: 47800 }],
      profile: null,
      font,
      giphyKey: 'abcDEF1234567890abcd',
      sounds: false,
      appearance: { mode: 'dark', theme: 'roxo', scene: { kind: 'builtin', id: 'montanhas' }, showContactScenes: false },
    });
    expect(store.load()).toEqual({
      manualPeers: [{ host: '10.0.0.2', port: 47800 }],
      profile: null,
      font,
      giphyKey: 'abcDEF1234567890abcd',
      sounds: false,
      appearance: { mode: 'dark', theme: 'roxo', scene: { kind: 'builtin', id: 'montanhas' }, showContactScenes: false },
    });

    fs.writeFileSync(path.join(dir, 'settings.json'), '{ lixo');
    expect(store.load()).toEqual(defaultSettings());

    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ manualPeers: [{ host: 1 }, { host: 'x', port: 2 }] }));
    expect(store.load()).toEqual({
      manualPeers: [{ host: 'x', port: 2 }],
      profile: null,
      font: null,
      giphyKey: null,
      sounds: true,
      appearance: { mode: 'system', theme: 'azul-classico', scene: null, showContactScenes: true },
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sons ficam ligados por padrão em arquivo antigo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatlan-'));
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ manualPeers: [] }));
    expect(new SettingsStore(dir).load().sounds).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('aparência', () => {
  const load = (appearance: unknown) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatlan-'));
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ appearance }));
    const out = new SettingsStore(dir).load().appearance;
    fs.rmSync(dir, { recursive: true, force: true });
    return out;
  };

  const DEFAULT = { mode: 'system', theme: 'azul-classico', scene: null as unknown, showContactScenes: true };

  it('padrão: seguir o sistema com o Azul clássico e a cena do tema', () => {
    expect(load(undefined)).toEqual(DEFAULT);
  });

  it('lê modo e tema válidos; arquivo antigo sem cena fica com a do tema (null)', () => {
    expect(load({ mode: 'light', theme: 'verde' })).toEqual({ mode: 'light', theme: 'verde', scene: null, showContactScenes: true });
  });

  it('lê a opção de mostrar cenas dos contatos; ausente ou inválida = ligada', () => {
    expect(load({ mode: 'light', theme: 'verde', showContactScenes: false }).showContactScenes).toBe(false);
    expect(load({ mode: 'light', theme: 'verde', showContactScenes: true }).showContactScenes).toBe(true);
    expect(load({ mode: 'light', theme: 'verde', showContactScenes: 'nao' }).showContactScenes).toBe(true);
  });

  it('lê a cena escolhida', () => {
    for (const scene of [{ kind: 'builtin', id: 'aurora' }, { kind: 'custom', id: '0123456789abcdef' }, { kind: 'none' }])
      expect(load({ mode: 'dark', theme: 'roxo', scene }).scene).toEqual(scene);
  });

  it('cena inválida vira a do tema, sem perder modo e tema', () => {
    expect(load({ mode: 'dark', theme: 'roxo', scene: { kind: 'builtin', id: 'nada' } })).toEqual({
      mode: 'dark',
      theme: 'roxo',
      scene: null,
      showContactScenes: true,
    });
    expect(load({ mode: 'dark', theme: 'roxo', scene: { kind: 'custom', id: '../x' } }).scene).toBeNull();
  });

  it('valores inválidos voltam ao padrão', () => {
    expect(load({ mode: 'noite', theme: 'verde' })).toEqual(DEFAULT);
    expect(load({ mode: 'dark', theme: 'inexistente' })).toEqual(DEFAULT);
    expect(load('dark')).toEqual(DEFAULT);
  });
});

describe('parseProfile', () => {
  const valid = {
    name: 'Claudio',
    status: 'away',
    message: 'oi',
    port: 47800,
    connectTo: '',
    remember: true,
    autoLogin: true,
  };

  it('aceita perfil válido', () => {
    expect(parseProfile(valid)).toEqual(valid);
  });

  it('entrar automaticamente exige lembrar', () => {
    expect(parseProfile({ ...valid, remember: false })).toMatchObject({ remember: false, autoLogin: false });
  });

  it('descarta perfil inválido', () => {
    expect(parseProfile(null)).toBeNull();
    expect(parseProfile({ ...valid, status: 'x' })).toBeNull();
    expect(parseProfile({ ...valid, port: 0 })).toBeNull();
    expect(parseProfile({ ...valid, name: 5 })).toBeNull();
  });
});
