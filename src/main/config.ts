// Configuração de inicialização: flags de linha de comando e peers manuais salvos.
import fs from 'node:fs';
import path from 'node:path';
import type { SavedProfile } from '../shared/api';
import {
  MAX_NAME_LENGTH,
  MAX_PERSONAL_MESSAGE_LENGTH,
  isPresenceStatus,
  validateFont,
  type MessageFont,
} from '../shared/protocol';
import { DEFAULT_APPEARANCE, validateAppearance, type Appearance } from '../shared/themes';
import { parseBounds, type Rect } from './video-window';

/** Porta padrão do servidor. Evita a 5000 (AirPlay Receiver no Mac). */
export const DEFAULT_PORT = 47800;
const MAX_SAVED_PEERS = 10;

export interface HostPort {
  host: string;
  port: number;
}

export interface LaunchOptions {
  port?: number;
  connect: HostPort[];
}

export interface Settings {
  manualPeers: HostPort[];
  profile: SavedProfile | null;
  /** Fonte das mensagens; null = padrão. */
  font: MessageFont | null;
  /** Chave de API do GIPHY (opcional). */
  giphyKey: string | null;
  /** Som de nova mensagem (menu ☰ da home). Padrão: ligado. */
  sounds: boolean;
  /** Modo (sistema/claro/escuro) e tema de cor. */
  appearance: Appearance;
  /** Mostra aos contatos a música tocando no Spotify (menu ☰ da home). Padrão: ligado. */
  shareListening: boolean;
  /** Busca a prévia (título, imagem) dos links que eu envio (menu ☰ da home). Padrão: ligado. */
  linkPreviews: boolean;
  /** Posição e tamanho da janela flutuante de vídeo; null = canto inferior direito. */
  videoBounds: Rect | null;
}

const isPort = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 65535;

/** Valida o perfil lido do disco; qualquer campo inválido descarta o perfil. */
export function parseProfile(raw: unknown): SavedProfile | null {
  const p = raw as Partial<SavedProfile> | null;
  if (!p || typeof p !== 'object') return null;
  if (typeof p.name !== 'string' || p.name.length > MAX_NAME_LENGTH) return null;
  if (!isPresenceStatus(p.status) || !isPort(p.port)) return null;
  if (typeof p.message !== 'string' || p.message.length > MAX_PERSONAL_MESSAGE_LENGTH) return null;
  if (typeof p.connectTo !== 'string' || p.connectTo.length > 300) return null;
  return {
    name: p.name,
    status: p.status,
    message: p.message,
    port: p.port,
    connectTo: p.connectTo,
    remember: p.remember === true,
    autoLogin: p.remember === true && p.autoLogin === true,
  };
}

/** Aceita `192.168.0.10:47800`, `meu-pc.local:47800` e `[fe80::1]:47800`. Sem porta usa a padrão. */
export function parseHostPort(value: string, defaultPort = DEFAULT_PORT): HostPort | null {
  const v = value.trim();
  if (!v) return null;
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(v);
  const plain = /^([^:\s]+)(?::(\d+))?$/.exec(v);
  const m = bracketed ?? plain;
  if (!m) return null;
  const port = m[2] === undefined ? defaultPort : Number(m[2]);
  return isPort(port) ? { host: m[1], port } : null;
}

/**
 * Lê `--port=N` e `--connect=host:porta` (pode repetir, ou separar por vírgula).
 * Também aceita a forma com espaço: `--port N`, `--connect host:porta`.
 */
export function parseArgs(argv: string[]): LaunchOptions {
  const out: LaunchOptions = { connect: [] };
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(port|connect)(?:=(.*))?$/.exec(argv[i]);
    if (!m) continue;
    const value = m[2] ?? argv[++i] ?? '';
    if (m[1] === 'port') {
      const port = Number(value);
      if (isPort(port)) out.port = port;
    } else {
      for (const part of value.split(',')) {
        const hp = parseHostPort(part);
        if (hp) out.connect.push(hp);
      }
    }
  }
  return out;
}

export const sameTarget = (a: HostPort, b: HostPort) => a.host === b.host && a.port === b.port;

/** Coloca o alvo no topo da lista, sem duplicar, com limite de tamanho. */
export function rememberPeer(list: HostPort[], target: HostPort): HostPort[] {
  return [target, ...list.filter((p) => !sameTarget(p, target))].slice(0, MAX_SAVED_PEERS);
}

export const defaultSettings = (): Settings => ({
  manualPeers: [],
  profile: null,
  font: null,
  giphyKey: null,
  sounds: true,
  appearance: { ...DEFAULT_APPEARANCE },
  shareListening: true,
  linkPreviews: true,
  videoBounds: null,
});

export class SettingsStore {
  private readonly file: string;

  constructor(dir: string) {
    this.file = path.join(dir, 'settings.json');
  }

  load(): Settings {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const manualPeers = Array.isArray(raw?.manualPeers)
        ? raw.manualPeers
            .filter((p: unknown): p is HostPort => {
              const hp = p as HostPort;
              return typeof hp?.host === 'string' && hp.host.length > 0 && isPort(hp.port);
            })
            .slice(0, MAX_SAVED_PEERS)
        : [];
      const giphyKey = typeof raw?.giphyKey === 'string' && /^[A-Za-z0-9]{16,64}$/.test(raw.giphyKey) ? raw.giphyKey : null;
      return {
        manualPeers,
        profile: parseProfile(raw?.profile),
        font: validateFont(raw?.font),
        giphyKey,
        sounds: raw?.sounds !== false,
        appearance: validateAppearance(raw?.appearance) ?? { ...DEFAULT_APPEARANCE },
        shareListening: raw?.shareListening !== false,
        linkPreviews: raw?.linkPreviews !== false,
        videoBounds: parseBounds(raw?.videoBounds),
      };
    } catch {
      return defaultSettings();
    }
  }

  save(settings: Settings) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(settings, null, 2));
    } catch (err) {
      console.warn('[settings] não foi possível salvar', err);
    }
  }
}
