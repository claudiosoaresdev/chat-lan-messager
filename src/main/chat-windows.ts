// Janelas de conversa (uma por contato) e o roteamento dos eventos da rede até elas.
// Não depende do Electron: a janela real vem de uma fábrica injetada pelo main.ts.
import { IPC, type ConversationItem, type NewConversationItem, type PeerInfo } from '../shared/api';
import type { Conversations } from './conversations';

export interface ChatWindowHandle {
  readonly destroyed: boolean;
  readonly focused: boolean;
  /** `focus: false` mostra sem roubar o foco e pisca na barra de tarefas. */
  show(focus: boolean): void;
  send(channel: string, payload: unknown): void;
  close(): void;
  shake(): void;
}

export type CreateChatWindow = (peerId: string, onClosed: () => void) => ChatWindowHandle;

export class ChatWindows {
  private readonly windows = new Map<string, ChatWindowHandle>();
  private readonly lastOnline = new Map<string, boolean>();

  constructor(
    private readonly create: CreateChatWindow,
    private readonly conversations: Conversations,
    private readonly isKnownPeer: (peerId: string) => boolean,
  ) {}

  get(peerId: string): ChatWindowHandle | undefined {
    const w = this.windows.get(peerId);
    return w && !w.destroyed ? w : undefined;
  }

  /** Abre a conversa (ou reaproveita a janela existente). Contato desconhecido: null. */
  open(peerId: string, focus: boolean): ChatWindowHandle | null {
    if (!this.isKnownPeer(peerId)) return null;
    let w = this.get(peerId);
    if (!w) {
      const created: ChatWindowHandle = this.create(peerId, () => {
        if (this.windows.get(peerId) === created) this.windows.delete(peerId);
      });
      this.windows.set(peerId, created);
      w = created;
    }
    w.show(focus);
    return w;
  }

  /**
   * Item vindo do contato: grava no histórico, entrega à janela dele e, se não houver
   * janela, abre uma sem foco. Uma janela recém-criada lê o item do histórico ao carregar.
   */
  receive(peerId: string, item: NewConversationItem): void {
    if (!this.isKnownPeer(peerId)) return;
    const saved = this.conversations.add(peerId, item);
    const w = this.open(peerId, false);
    w?.send(IPC.chatItem, saved);
    if (item.kind === 'nudge') w?.shake();
  }

  /** Item que eu enviei: só histórico; a janela que enviou já mostrou. */
  record(peerId: string, item: NewConversationItem): ConversationItem {
    return this.conversations.add(peerId, item);
  }

  /** Presença do contato: vai para a janela dele e vira aviso "entrou/saiu" se a conversa existe. */
  peerChanged(peer: PeerInfo): void {
    const was = this.lastOnline.get(peer.id);
    this.lastOnline.set(peer.id, peer.online);
    const w = this.get(peer.id);
    w?.send(IPC.peer, peer);
    if (was === undefined || was === peer.online) return;
    if (!w && !this.conversations.has(peer.id)) return;
    const saved = this.conversations.add(peer.id, {
      kind: 'system',
      text: `${peer.name} ${peer.online ? 'entrou na conversa' : 'saiu da conversa'}`,
    });
    w?.send(IPC.chatItem, saved);
  }

  closeAll(): void {
    for (const w of this.windows.values()) if (!w.destroyed) w.close();
    this.windows.clear();
    this.lastOnline.clear();
  }
}
