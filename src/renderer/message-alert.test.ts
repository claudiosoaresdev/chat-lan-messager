import { describe, expect, it } from 'vitest';
import type { ConversationItem } from '../shared/api';
import { MIN_SOUND_GAP_MS, shouldPlayMessageSound } from './message-alert';

const text = (self: boolean): ConversationItem => ({
  seq: 1,
  at: 1000,
  kind: 'text',
  message: { from: self ? 'aaa' : 'bbb', fromName: 'X', text: 'oi', ts: 1, self },
});

const base = { item: text(false), fresh: true, focused: false, enabled: true, now: 10_000, lastPlayed: 0 };

describe('shouldPlayMessageSound', () => {
  it('toca para mensagem recebida nova com a conversa fora de foco', () => {
    expect(shouldPlayMessageSound(base)).toBe(true);
  });

  it('não toca com a conversa em foco, silenciado, item velho ou mensagem minha', () => {
    expect(shouldPlayMessageSound({ ...base, focused: true })).toBe(false);
    expect(shouldPlayMessageSound({ ...base, enabled: false })).toBe(false);
    expect(shouldPlayMessageSound({ ...base, fresh: false })).toBe(false);
    expect(shouldPlayMessageSound({ ...base, item: text(true) })).toBe(false);
  });

  it('toca para imagem e wink; não para nudge (tem som próprio) nem aviso do sistema', () => {
    const image: ConversationItem = {
      seq: 2,
      at: 1,
      kind: 'image',
      image: { from: 'bbb', fromName: 'X', name: 'a.png', mime: 'image/png', size: 1, ts: 1, self: false, data: new Uint8Array(1) },
    };
    const wink: ConversationItem = { seq: 3, at: 1, kind: 'wink', wink: { from: 'bbb', fromName: 'X', wink: 'fogos', ts: 1, self: false } };
    const nudge: ConversationItem = { seq: 4, at: 1, kind: 'nudge', nudge: { from: 'bbb', fromName: 'X', ts: 1, self: false } };
    const system: ConversationItem = { seq: 5, at: 1, kind: 'system', text: 'X saiu' };
    expect(shouldPlayMessageSound({ ...base, item: image })).toBe(true);
    expect(shouldPlayMessageSound({ ...base, item: wink })).toBe(true);
    expect(shouldPlayMessageSound({ ...base, item: nudge })).toBe(false);
    expect(shouldPlayMessageSound({ ...base, item: system })).toBe(false);
  });

  it('no máximo um som por intervalo', () => {
    expect(shouldPlayMessageSound({ ...base, lastPlayed: base.now - MIN_SOUND_GAP_MS + 1 })).toBe(false);
    expect(shouldPlayMessageSound({ ...base, lastPlayed: base.now - MIN_SOUND_GAP_MS })).toBe(true);
  });
});
