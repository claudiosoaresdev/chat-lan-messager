import { describe, expect, it } from 'vitest';
import type { PeerInfo } from '../shared/api';
import { IPC } from '../shared/api';
import { ChatWindows, type ChatWindowHandle } from './chat-windows';
import { Conversations } from './conversations';

class FakeWindow implements ChatWindowHandle {
  destroyed = false;
  focused = false;
  shown: boolean[] = [];
  sent: Array<[string, unknown]> = [];
  shakes = 0;
  constructor(
    readonly peerId: string,
    private readonly onClosed: () => void,
  ) {}
  show(focus: boolean) {
    this.shown.push(focus);
  }
  send(channel: string, payload: unknown) {
    this.sent.push([channel, payload]);
  }
  close() {
    this.destroyed = true;
    this.onClosed();
  }
  shake() {
    this.shakes++;
  }
}

const KNOWN = new Set(['bbb', 'ccc']);

function setup() {
  const created: FakeWindow[] = [];
  const conversations = new Conversations();
  const chats = new ChatWindows(
    (peerId, onClosed) => {
      const w = new FakeWindow(peerId, onClosed);
      created.push(w);
      return w;
    },
    conversations,
    (id) => KNOWN.has(id),
  );
  return { chats, created, conversations };
}

const text = (t: string) => ({
  kind: 'text' as const,
  message: { from: 'bbb', fromName: 'Bia', text: t, ts: 1, self: false },
});

const peer = (online: boolean): PeerInfo => ({
  id: 'bbb',
  name: 'Bia',
  status: 'available',
  message: '',
  address: '10.0.0.2',
  online,
});

describe('ChatWindows', () => {
  it('item recebido sem janela grava no histórico e abre sem foco', () => {
    const { chats, created, conversations } = setup();
    chats.receive('bbb', text('oi'));
    expect(created).toHaveLength(1);
    expect(created[0].shown).toEqual([false]);
    expect(conversations.get('bbb')).toHaveLength(1);
  });

  it('rajada de mensagens abre uma janela só', () => {
    const { chats, created, conversations } = setup();
    chats.receive('bbb', text('1'));
    chats.receive('bbb', text('2'));
    chats.receive('bbb', text('3'));
    expect(created).toHaveLength(1);
    expect(conversations.get('bbb')).toHaveLength(3);
  });

  it('entrega o item à janela aberta', () => {
    const { chats, created } = setup();
    chats.open('bbb', true);
    chats.receive('bbb', text('oi'));
    expect(created).toHaveLength(1);
    expect(created[0].shown).toEqual([true, false]);
    expect(created[0].sent).toEqual([[IPC.chatItem, expect.objectContaining({ kind: 'text', seq: 1 })]]);
  });

  it('contato desconhecido não abre janela nem grava', () => {
    const { chats, created, conversations } = setup();
    expect(chats.open('zzz', true)).toBeNull();
    chats.receive('zzz', text('oi'));
    expect(created).toHaveLength(0);
    expect(conversations.has('zzz')).toBe(false);
  });

  it('chamar atenção sacode a janela do contato', () => {
    const { chats, created } = setup();
    chats.receive('bbb', { kind: 'nudge', nudge: { from: 'bbb', fromName: 'Bia', ts: 1, self: false } });
    expect(created[0].shakes).toBe(1);
  });

  it('depois de fechar, a próxima mensagem abre uma janela nova', () => {
    const { chats, created } = setup();
    chats.open('bbb', true);
    created[0].close();
    expect(chats.get('bbb')).toBeUndefined();
    chats.receive('bbb', text('voltei'));
    expect(created).toHaveLength(2);
  });

  it('record grava o que eu enviei sem abrir janela', () => {
    const { chats, created, conversations } = setup();
    chats.record('bbb', { kind: 'text', message: { from: 'aaa', fromName: 'Eu', text: 'oi', ts: 1, self: true } });
    expect(created).toHaveLength(0);
    expect(conversations.get('bbb')).toHaveLength(1);
  });

  it('presença vai para a janela do contato e avisa entrou/saiu só em conversa existente', () => {
    const { chats, created, conversations } = setup();
    chats.peerChanged(peer(true));
    chats.peerChanged(peer(false));
    expect(conversations.has('bbb')).toBe(false);

    chats.open('bbb', true);
    chats.peerChanged(peer(true));
    chats.peerChanged(peer(true));
    chats.peerChanged(peer(false));
    const texts = conversations.get('bbb').map((i) => (i.kind === 'system' ? i.text : ''));
    expect(texts).toEqual(['Bia entrou na conversa', 'Bia saiu da conversa']);
    const channels = created[0].sent.map(([c]) => c);
    expect(channels.filter((c) => c === IPC.peer)).toHaveLength(3);
    expect(channels.filter((c) => c === IPC.chatItem)).toHaveLength(2);
  });

  it('closeAll fecha todas as janelas', () => {
    const { chats, created } = setup();
    chats.open('bbb', true);
    chats.open('ccc', true);
    chats.closeAll();
    expect(created.every((w) => w.destroyed)).toBe(true);
    expect(chats.get('bbb')).toBeUndefined();
  });
});
