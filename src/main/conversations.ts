// Histórico da sessão por contato, só em memória (some ao sair, como no MSN).
// Serve para a janela que abre sozinha carregar o que já chegou e para reabrir uma conversa fechada.
// Também limita o total de bytes de imagem por contato, para não segurar dezenas de imagens grandes na memória.
import type { ConversationItem, LinkPreview, NewConversationItem } from '../shared/api';

export const MAX_ITEMS_PER_CONTACT = 200;
export const MAX_IMAGE_BYTES_PER_CONTACT = 50 * 1024 * 1024;

export class Conversations {
  private readonly items = new Map<string, ConversationItem[]>();
  private seq = 0;

  constructor(
    private readonly max = MAX_ITEMS_PER_CONTACT,
    private readonly now: () => number = Date.now,
    private readonly maxImageBytes = MAX_IMAGE_BYTES_PER_CONTACT,
  ) {}

  add(peerId: string, item: NewConversationItem): ConversationItem {
    const saved = { ...item, seq: ++this.seq, at: this.now() } as ConversationItem;
    const list = this.items.get(peerId) ?? [];
    list.push(saved);
    while (list.length > this.max || (list.length > 1 && this.imageBytes(list) > this.maxImageBytes)) {
      list.shift();
    }
    this.items.set(peerId, list);
    return saved;
  }

  private imageBytes(list: ConversationItem[]): number {
    return list.reduce(
      (sum, i) =>
        sum + (i.kind === 'image' ? i.image.data.byteLength : i.kind === 'text' ? i.preview?.image?.data.byteLength ?? 0 : 0),
      0,
    );
  }

  /**
   * Liga a prévia à mensagem de texto `ref` (só a primeira prévia vale). `self`: prévia das minhas mensagens (true)
   * ou das do contato (false) — o contato não consegue pôr prévia numa mensagem minha. Devolve o item ou null.
   */
  attachPreview(peerId: string, ref: string, self: boolean, preview: LinkPreview): ConversationItem | null {
    const list = this.items.get(peerId);
    const item = list?.find((i) => i.kind === 'text' && i.message.id === ref && i.message.self === self);
    if (!list || !item || item.kind !== 'text' || item.preview) return null;
    item.preview = preview;
    while (list.length > 1 && this.imageBytes(list) > this.maxImageBytes) list.shift();
    return list.includes(item) ? item : null;
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
