import { describe, expect, it } from 'vitest';
import { trayTooltip } from './tray-text';

describe('trayTooltip', () => {
  it('fora de sessão mostra só o nome do app', () => {
    expect(trayTooltip(null, false)).toBe('Chat Live Messenger');
  });

  it('logado mostra nome e status', () => {
    expect(trayTooltip({ name: 'Claudio', status: 'busy' }, false)).toBe('Chat Live Messenger – Claudio (Ocupado)');
  });

  it('avisa quando há atualização pronta', () => {
    expect(trayTooltip({ name: 'Claudio', status: 'available' }, true)).toBe(
      'Chat Live Messenger – Claudio (Disponível) – Atualização disponível',
    );
    expect(trayTooltip(null, true)).toBe('Chat Live Messenger – Atualização disponível');
  });
});
