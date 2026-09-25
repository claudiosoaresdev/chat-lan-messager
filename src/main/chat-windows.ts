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

export interface ChatWindowEvents {
  onClosed(): void;
  /** A janela ganhou o foco (o usuário viu a conversa). */
  onFocused(): void;
}

export type CreateChatWindow = (peerId: string, events: ChatWindowEvents) => ChatWindowHandle;

export class ChatWindows {
  private readonly windows = new Map<string, ChatWindowHandle>();
  private readonly lastOnline = new Map<string, boolean>();
  private readonly unread = new Set<string>();

  constructor(
    private readonly create: CreateChatWindow,
    private readonly conversations: Conversations,
    private readonly isKnownPeer: (peerId: string) => boolean,
    /** Avisa a home para piscar (true) ou parar (false) o contato na lista. */
    private readonly onUnreadChanged: (peerId: string, unread: boolean) => void = () => undefined,
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
      const created: ChatWindowHandle = this.create(peerId, {
        onClosed: () => {
          if (this.windows.get(peerId) !== created) return;
          this.windows.delete(peerId);
          this.setUnread(peerId, false);
        },
        onFocused: () => {
          if (this.windows.get(peerId) === created) this.setUnread(peerId, false);
        },
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
    // Fora de foco: pisca o contato na lista até a conversa ser vista.
    if (!w?.focused) this.setUnread(peerId, true);
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

  /** Contatos com item não visto (estado inicial da home). */
  unreadIds(): string[] {
    return [...this.unread];
  }

  private setUnread(peerId: string, unread: boolean) {
    if (this.unread.has(peerId) === unread) return;
    if (unread) this.unread.add(peerId);
    else this.unread.delete(peerId);
    this.onUnreadChanged(peerId, unread);
  }

  closeAll(): void {
    // Limpa antes de fechar: os onClosed seguintes não avisam a home, que volta ao login.
    this.unread.clear();
    for (const w of this.windows.values()) if (!w.destroyed) w.close();
    this.windows.clear();
    this.lastOnline.clear();
  }
}
