// Texto da dica do ícone da bandeja (separado do tray.ts para testar sem Electron).
import type { PresenceStatus } from '../shared/protocol';

const STATUS: Record<PresenceStatus, string> = {
  available: 'Disponível',
  away: 'Ausente',
  busy: 'Ocupado',
};

export function trayTooltip(self: { name: string; status: PresenceStatus } | null, updateReady: boolean): string {
  const parts = ['Chat Live Messenger'];
  if (self) parts.push(`${self.name} (${STATUS[self.status]})`);
  if (updateReady) parts.push('Atualização disponível');
  return parts.join(' – ');
}
