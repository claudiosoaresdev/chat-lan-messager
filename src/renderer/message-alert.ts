// Quando tocar o som de nova mensagem (issue #7): regra pura, testável sem navegador.
import type { ConversationItem } from '../shared/api';

/** Rajada de mensagens toca um som só. */
export const MIN_SOUND_GAP_MS = 1000;

export interface MessageSoundInput {
  item: ConversationItem;
  /** Item ao vivo, ou do histórico recente (foi ele que abriu a janela). */
  fresh: boolean;
  /** A janela da conversa está em foco. */
  focused: boolean;
  /** Opção "Sons de mensagem" ligada. */
  enabled: boolean;
  now: number;
  /** Quando tocou o último som (0 = nunca). */
  lastPlayed: number;
}

export function shouldPlayMessageSound(i: MessageSoundInput): boolean {
  if (!i.enabled || i.focused || !i.fresh) return false;
  if (i.now - i.lastPlayed < MIN_SOUND_GAP_MS) return false;
  const { item } = i;
  if (item.kind === 'text') return !item.message.self;
  if (item.kind === 'image') return !item.image.self;
  return false; // nudge e wink têm som próprio; aviso do sistema não toca
}
