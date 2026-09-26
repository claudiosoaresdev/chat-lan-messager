// Legibilidade sobre as cenas. O texto do topo usa a cor pelo tom medido da imagem (scene-tone.ts) e, se a
// imagem é agitada, uma faixa translúcida; as mensagens ficam sobre a cena com um véu de --surface, e o fundo
// efetivo delas é a mistura da superfície com a cor média da cena (messageBackground).
import { averageColor, ensureContrast, mixColors } from './color';
import type { Tokens } from './theme-tokens';

type Mode = 'light' | 'dark';

/**
 * Véu (% de --surface por cima da cena) atrás das mensagens. Escolhido pelo teste scene-contrast.test.ts: é o
 * menor que deixa texto, link e destaque de todos os temas acima do mínimo sobre todas as cenas da galeria
 * (no escuro o link pede 92%; no claro 88% basta).
 */
export const SCENE_VEIL: Record<Mode, number> = { light: 88, dark: 92 };

/** Opacidade (%) da faixa atrás do texto do topo quando a cena é agitada: 4,5:1 garantido sobre qualquer pixel. */
export const SCENE_PLATE = 78;

/** Opacidade (%) da placa de --bg atrás dos botões da barra de ferramentas, onde a cena se desfaz no fundo. */
export const SCENE_TOOL_PLATE = 80;

/** Fundo efetivo das mensagens: --surface com o véu sobre a cor média da cena (sem cena, a própria superfície). */
export function messageBackground(surface: string, sceneAverage: string | null, mode: Mode): string {
  const s = averageColor(surface);
  return sceneAverage ? mixColors(s, sceneAverage, SCENE_VEIL[mode] / 100) : s;
}

export interface SceneSecondaryColors {
  /** "Fulano diz:" */
  saidBy: string;
  /** Avisos do sistema na conversa. */
  system: string;
  /** --muted dentro da área das mensagens. */
  muted: string;
}

/**
 * Cores secundárias da conversa sobre o fundo efetivo, com 4,5:1 garantido. Partem do mesmo desenho do CSS sem
 * cena (misturas com --surface) e só escurecem/clareiam o necessário: o --muted dos temas claros fica no limite
 * de 4,5:1 sobre a superfície, então qualquer cena por baixo do véu o derrubaria.
 */
export function sceneSecondaryColors(tokens: Tokens, background: string): SceneSecondaryColors {
  const surface = averageColor(tokens.surface);
  const muted = averageColor(tokens.muted);
  return {
    saidBy: ensureContrast(mixColors(averageColor(tokens['text-strong']), surface, 0.6578), background, 4.5),
    system: ensureContrast(mixColors(muted, surface, 0.9039), background, 4.5),
    muted: ensureContrast(muted, background, 4.5),
  };
}
