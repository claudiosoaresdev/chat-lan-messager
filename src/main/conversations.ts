// Histórico da sessão por contato, só em memória (some ao sair, como no MSN).
// Serve para a janela que abre sozinha carregar o que já chegou e para reabrir uma conversa fechada.
import type { ConversationItem, NewConversationItem } from '../shared/api';

export const MAX_ITEMS_PER_CONTACT = 200;

export class Conversations {
  private readonly items = new Map<string, ConversationItem[]>();
  private seq = 0;

  constructor(
    private readonly max = MAX_ITEMS_PER_CONTACT,
    private readonly now: () => number = Date.now,
  ) {}

  add(peerId: string, item: NewConversationItem): ConversationItem {
    const saved = { ...item, seq: ++this.seq, at: this.now() } as ConversationItem;
    const list = this.items.get(peerId) ?? [];
    list.push(saved);
    if (list.length > this.max) list.splice(0, list.length - this.max);
    this.items.set(peerId, list);
    return saved;
  }

  has(peerId: string): boolean {
    return this.items.has(peerId);
  }

  get(peerId: string): ConversationItem[] {
    return [...(this.items.get(peerId) ?? [])];
  }

  clear() {
    this.items.clear();
  }
}
