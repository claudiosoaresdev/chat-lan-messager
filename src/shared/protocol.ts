// Protocolo de mensagens entre peers do Chat LAN.
// Frames de texto carregam JSON; o conteúdo de uma imagem vai no frame
// binário logo após o cabeçalho `image`.

import { findGoogleFont } from './google-fonts';
import { imageSize } from './image-size';
import { MAX_SCENE_BYTES, findBuiltinScene, isSceneSize } from './scenes';

export { MAX_SCENE_BYTES };

export const SERVICE_TYPE = 'chatlan';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Imagem de exibição: pequena, vai para todos ao conectar. */
export const MAX_AVATAR_BYTES = 256 * 1024;
export const MAX_TEXT_LENGTH = 5000;
export const MAX_NAME_LENGTH = 64;
export const MAX_FILE_NAME_LENGTH = 255;
export const MAX_ID_LENGTH = 64;
export const MAX_PERSONAL_MESSAGE_LENGTH = 128;

export const PRESENCE_STATUSES = ['available', 'away', 'busy'] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type ImageMime = (typeof IMAGE_MIME_TYPES)[number];

export interface HelloMessage {
  type: 'hello';
  id: string;
  name: string;
  status: PresenceStatus;
  message: string;
}

/** Mudança de nome, status ou mensagem pessoal depois do hello. */
export interface PresenceMessage {
  type: 'presence';
  from: string;
  name: string;
  status: PresenceStatus;
  message: string;
}

/** Fontes clássicas (as que existem ou têm equivalente no Windows e no Mac). */
export const CLASSIC_FONTS = [
  'Segoe UI',
  'Arial',
  'Calibri',
  'Comic Sans MS',
  'Courier New',
  'Georgia',
  'Impact',
  'Lucida Console',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
] as const;
export type ClassicFont = (typeof CLASSIC_FONTS)[number];
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 24;

/** Fonte das mensagens, como no "Alterar fonte" do MSN. Tamanho em px. */
export interface MessageFont {
  /** Clássica (CLASSIC_FONTS) ou família do catálogo do Google Fonts. */
  family: string;
  size: number;
  /** 100–900. `bold` acompanha (peso ≥ 600) para versões antigas, que só conhecem negrito. */
  weight: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** #rrggbb */
  color: string;
}

export const DEFAULT_FONT: MessageFont = {
  family: 'Segoe UI',
  size: 13,
  weight: 400,
  bold: false,
  italic: false,
  underline: false,
  color: '#000000',
};

export interface ChatMessage {
  type: 'chat';
  from: string;
  text: string;
  ts: number;
  /** Opcional: fonte de quem enviou. */
  font?: MessageFont;
}

export interface ImageHeader {
  type: 'image';
  from: string;
  name: string;
  mime: ImageMime;
  size: number;
  ts: number;
}

/** Winks (animações) disponíveis; o id viaja na mensagem e é validado contra esta lista. */
export const WINK_IDS = ['beijo', 'coracoes', 'risada', 'fogos', 'parabens', 'estrelas'] as const;
export type WinkId = (typeof WINK_IDS)[number];

export const isWinkId = (v: unknown): v is WinkId => typeof v === 'string' && (WINK_IDS as readonly string[]).includes(v);

/** Wink: animação que toca por cima da conversa de quem recebe. */
export interface WinkMessage {
  type: 'wink';
  from: string;
  wink: WinkId;
  ts: number;
}

/** "Chamar atenção": faz a janela de quem recebe tremer. */
export interface NudgeMessage {
  type: 'nudge';
  from: string;
  ts: number;
}

/**
 * Imagem de exibição. Com `size` > 0, o próximo frame binário é a imagem;
 * com `size` 0, o contato removeu a imagem (sem frame binário).
 */
export interface AvatarHeader {
  type: 'avatar';
  from: string;
  mime: ImageMime | null;
  size: number;
}

export const SCENE_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
export type SceneMime = (typeof SCENE_MIME_TYPES)[number];

/**
 * Cena (plano de fundo da conversa) de quem envia, como no WLM. `builtin` é uma cena da galeria
 * (id validado contra a lista local); `image` é seguida por um frame binário com os bytes
 * (JPEG/PNG, até MAX_SCENE_BYTES); `none` = sem cena. Versões antigas ignoram a mensagem.
 */
export type SceneHeader =
  | { type: 'scene'; from: string; kind: 'builtin'; id: string }
  | { type: 'scene'; from: string; kind: 'image'; mime: SceneMime; size: number }
  | { type: 'scene'; from: string; kind: 'none' };

export const isSceneMime = (v: unknown): v is SceneMime =>
  typeof v === 'string' && (SCENE_MIME_TYPES as readonly string[]).includes(v);

/** Tamanho máximo do artista e do nome da música em `listening`. */
export const MAX_LISTENING_LENGTH = 128;

/**
 * "O que estou ouvindo" (como no WLM): música tocando no Spotify de quem envia; `artist` e `title` null = nada tocando
 * (ou a pessoa desligou o compartilhamento). Versões antigas ignoram a mensagem.
 */
export interface ListeningMessage {
  type: 'listening';
  from: string;
  artist: string | null;
  title: string | null;
}

export type WireMessage =
  | HelloMessage
  | PresenceMessage
  | ChatMessage
  | ImageHeader
  | NudgeMessage
  | AvatarHeader
  | SceneHeader
  | ListeningMessage
  | WinkMessage;

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

const isBoundedString = (v: unknown, max: number, min = 1): v is string =>
  typeof v === 'string' && v.length >= min && v.length <= max;

const isTimestamp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export const isKnownFont = (family: string) =>
  (CLASSIC_FONTS as readonly string[]).includes(family) || !!findGoogleFont(family);

/** Valida a fonte; qualquer campo fora do permitido invalida a fonte inteira. */
export function validateFont(v: unknown): MessageFont | null {
  if (!isObject(v)) return null;
  if (typeof v.family !== 'string' || !isKnownFont(v.family)) return null;
  if (typeof v.size !== 'number' || !Number.isInteger(v.size) || v.size < MIN_FONT_SIZE || v.size > MAX_FONT_SIZE) return null;
  if (typeof v.bold !== 'boolean' || typeof v.italic !== 'boolean' || typeof v.underline !== 'boolean') return null;
  if (typeof v.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v.color)) return null;
  // Versões antigas não mandam peso: deduz do negrito.
  const weight = v.weight === undefined ? (v.bold ? 700 : 400) : v.weight;
  if (typeof weight !== 'number' || !Number.isInteger(weight) || weight < 100 || weight > 900 || weight % 100 !== 0) return null;
  return {
    family: v.family,
    size: v.size,
    weight,
    bold: weight >= 600,
    italic: v.italic,
    underline: v.underline,
    color: v.color.toLowerCase(),
  };
}

export const isPresenceStatus = (v: unknown): v is PresenceStatus =>
  typeof v === 'string' && (PRESENCE_STATUSES as readonly string[]).includes(v);

const isPersonalMessage = (v: unknown): v is string => isBoundedString(v, MAX_PERSONAL_MESSAGE_LENGTH, 0);

export const isImageMime = (v: unknown): v is ImageMime =>
  typeof v === 'string' && (IMAGE_MIME_TYPES as readonly string[]).includes(v);

export function validateMessage(value: unknown): WireMessage | null {
  if (!isObject(value)) return null;

  switch (value.type) {
    case 'hello':
      if (!isBoundedString(value.id, MAX_ID_LENGTH) || !isBoundedString(value.name, MAX_NAME_LENGTH)) return null;
      // status e message são opcionais no hello (compatível com versões sem presença).
      if (value.status !== undefined && !isPresenceStatus(value.status)) return null;
      if (value.message !== undefined && !isPersonalMessage(value.message)) return null;
      return {
        type: 'hello',
        id: value.id,
        name: value.name,
        status: (value.status as PresenceStatus | undefined) ?? 'available',
        message: (value.message as string | undefined) ?? '',
      };

    case 'presence':
      if (
        !isBoundedString(value.from, MAX_ID_LENGTH) ||
        !isBoundedString(value.name, MAX_NAME_LENGTH) ||
        !isPresenceStatus(value.status) ||
        !isPersonalMessage(value.message)
      )
        return null;
      return { type: 'presence', from: value.from, name: value.name, status: value.status, message: value.message };

    case 'chat': {
      if (
        !isBoundedString(value.from, MAX_ID_LENGTH) ||
        !isBoundedString(value.text, MAX_TEXT_LENGTH) ||
        !isTimestamp(value.ts)
      )
        return null;
      // Fonte inválida não derruba a mensagem: ela chega sem formatação.
      const font = validateFont(value.font);
      return font
        ? { type: 'chat', from: value.from, text: value.text, ts: value.ts, font }
        : { type: 'chat', from: value.from, text: value.text, ts: value.ts };
    }

    case 'avatar': {
      if (!isBoundedString(value.from, MAX_ID_LENGTH)) return null;
      if (typeof value.size !== 'number' || !Number.isInteger(value.size)) return null;
      if (value.size === 0) return { type: 'avatar', from: value.from, mime: null, size: 0 };
      if (value.size < 0 || value.size > MAX_AVATAR_BYTES || !isImageMime(value.mime)) return null;
      return { type: 'avatar', from: value.from, mime: value.mime, size: value.size };
    }

    case 'scene': {
      if (!isBoundedString(value.from, MAX_ID_LENGTH)) return null;
      if (value.kind === 'none') return { type: 'scene', from: value.from, kind: 'none' };
      if (value.kind === 'builtin') {
        if (typeof value.id !== 'string' || !findBuiltinScene(value.id)) return null;
        return { type: 'scene', from: value.from, kind: 'builtin', id: value.id };
      }
      if (value.kind === 'image') {
        if (!isSceneMime(value.mime)) return null;
        if (typeof value.size !== 'number' || !Number.isInteger(value.size)) return null;
        if (value.size < 1 || value.size > MAX_SCENE_BYTES) return null;
        return { type: 'scene', from: value.from, kind: 'image', mime: value.mime, size: value.size };
      }
      return null;
    }

    case 'listening': {
      if (!isBoundedString(value.from, MAX_ID_LENGTH)) return null;
      if (value.artist === null && value.title === null) return { type: 'listening', from: value.from, artist: null, title: null };
      // Artista pode vir vazio (podcast, arquivo local); a música não.
      if (!isBoundedString(value.artist, MAX_LISTENING_LENGTH, 0) || !isBoundedString(value.title, MAX_LISTENING_LENGTH)) return null;
      return { type: 'listening', from: value.from, artist: value.artist, title: value.title };
    }

    case 'wink':
      if (!isBoundedString(value.from, MAX_ID_LENGTH) || !isWinkId(value.wink) || !isTimestamp(value.ts)) return null;
      return { type: 'wink', from: value.from, wink: value.wink, ts: value.ts };

    case 'nudge':
      if (!isBoundedString(value.from, MAX_ID_LENGTH) || !isTimestamp(value.ts)) return null;
      return { type: 'nudge', from: value.from, ts: value.ts };

    case 'image':
      if (
        !isBoundedString(value.from, MAX_ID_LENGTH) ||
        !isBoundedString(value.name, MAX_FILE_NAME_LENGTH) ||
        !isImageMime(value.mime) ||
        typeof value.size !== 'number' ||
        !Number.isInteger(value.size) ||
        value.size <= 0 ||
        value.size > MAX_IMAGE_BYTES ||
        !isTimestamp(value.ts)
      )
        return null;
      return { type: 'image', from: value.from, name: value.name, mime: value.mime, size: value.size, ts: value.ts };

    default:
      return null;
  }
}

/** Faz JSON.parse + validação. Qualquer frame inválido vira `null` e deve ser descartado. */
export function parseMessage(raw: string): WireMessage | null {
  try {
    return validateMessage(JSON.parse(raw));
  } catch {
    return null;
  }
}

export const encodeMessage = (msg: WireMessage): string => JSON.stringify(msg);

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) =>
  bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** Detecta o tipo da imagem pelos primeiros bytes (assinatura). SVG e outros formatos retornam `null`. */
export function detectImageMime(bytes: Uint8Array): ImageMime | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

/** Confere tamanho e assinatura do conteúdo contra o mime declarado. */
export function validateImageBytes(bytes: Uint8Array, declaredMime: ImageMime, declaredSize?: number): boolean {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return false;
  if (declaredSize !== undefined && bytes.length !== declaredSize) return false;
  return detectImageMime(bytes) === declaredMime;
}

/**
 * Confere os bytes de uma cena: tamanho declarado, limite, assinatura JPEG/PNG e dimensões do cabeçalho (até
 * 2048×1152, sem zero). Sem dimensões legíveis, recusa.
 */
export function validateSceneBytes(bytes: Uint8Array, declaredMime: SceneMime, declaredSize: number): boolean {
  if (bytes.length === 0 || bytes.length > MAX_SCENE_BYTES || bytes.length !== declaredSize) return false;
  if (detectImageMime(bytes) !== declaredMime) return false;
  return isSceneSize(imageSize(bytes, declaredMime));
}

/** Regra anti-duplicação: só o lado com o ID menor inicia a conexão. */
export const shouldInitiate = (localId: string, remoteId: string): boolean => localId < remoteId;
