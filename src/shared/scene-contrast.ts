// Legibilidade sobre as cenas. O texto do topo usa a cor pelo tom medido da imagem (scene-tone.ts) e, se a
// imagem é agitada, uma faixa translúcida; as mensagens ficam sobre a cena com um véu de --surface, e as cores
// delas são conferidas contra o PIOR trecho da cena sob o véu (messageBackground): no claro, o pixel escuro do
// percentil 5 de luminância; no escuro, o claro do percentil 95. Só 5% da imagem pode ser ainda mais desfavorável.
import { averageColor, ensureContrast, mixColors } from './color';
import type { SceneColors } from './scene-averages';
import type { Tokens } from './theme-tokens';

type Mode = 'light' | 'dark';

/**
 * Véu (% de --surface por cima da cena) atrás das mensagens. Escolhido pelo teste scene-contrast.test.ts: com ele,
 * texto, link e destaque de todos os temas passam do mínimo sobre o pior trecho (p5/p95) de todas as cenas da
 * galeria e de uma imagem metade preta, metade branca (no escuro o link do Roxo pede 94%; no claro 88% basta).
 * Cores de mensagem fora do tema e as secundárias são ajustadas contra esse mesmo fundo (messageColor,
 * sceneSecondaryColors). Garantia vale para o pior trecho medido; os 5% de pixels além do percentil podem
 * ficar um pouco abaixo.
 */
export const SCENE_VEIL: Record<Mode, number> = { light: 88, dark: 94 };

/**
 * Véu sobre a cena de um contato (fase 3): mais forte, porque a imagem foi escolhida por outra pessoa e pode ser
 * qualquer coisa. As cores continuam conferidas contra o pior trecho sob este véu (messageBackground).
 */
export const CONTACT_SCENE_VEIL: Record<Mode, number> = { light: 92, dark: 96 };

/**
 * Véu efetivo (%) atrás das mensagens: o escolhido na janela Aparência ou, sem escolha, o padrão (mais forte na
 * cena do contato). As cores das mensagens são conferidas contra o fundo com este véu, então valem para qualquer um.
 */
export function chatVeil(chatOpacity: number | null, contact: boolean, mode: Mode): number {
  return chatOpacity ?? (contact ? CONTACT_SCENE_VEIL : SCENE_VEIL)[mode];
}

/** Opacidade (%) da faixa atrás do texto do topo quando a cena é agitada: 4,5:1 garantido sobre qualquer pixel. */
export const SCENE_PLATE = 78;

/** Opacidade (%) da placa de --bg atrás dos botões da barra de ferramentas, onde a cena se desfaz no fundo. */
export const SCENE_TOOL_PLATE = 80;

/** Cor da cena que pior contrasta com o texto do modo: a escura (p5) no claro, a clara (p95) no escuro. */
export const worstSceneColor = (colors: SceneColors, mode: Mode) => (mode === 'light' ? colors.dark : colors.light);

/**
 * Fundo efetivo das mensagens para conferir contraste: --surface com o véu sobre o pior trecho da cena
 * (worstSceneColor); sem cena, a própria superfície.
 */
export function messageBackground(
  surface: string,
  colors: SceneColors | null,
  mode: Mode,
  veil: Record<Mode, number> = SCENE_VEIL,
): string {
  const s = averageColor(surface);
  return colors ? mixColors(s, worstSceneColor(colors, mode), veil[mode] / 100) : s;
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
 * Cores secundárias da conversa com 4,5:1 sobre o fundo conferido (messageBackground: o pior trecho da cena sob o
 * véu). Partem do mesmo desenho do CSS sem
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
