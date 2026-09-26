// Cores de cada cena da galeria (tabela gerada): a média e os pixels nos percentis 5 e 95 de luminância.
// O renderer usa esta tabela para as cenas da galeria (runtime e teste veem os mesmos números); imagens
// próprias são medidas na hora com a mesma função.
//
// Como gerar: no Electron, cada public/scenes/<id>.svg é desenhado inteiro num canvas 320×180 e as cores saem
// de sceneColors (src/renderer/scene-tone.ts) — a mesma amostragem que o app faz para imagens próprias.
// Refaça ao mudar um SVG (o teste em scene-contrast.test.ts confere que toda cena tem entrada).

/** Média sRGB e extremos de luminância de uma cena. */
export interface SceneColors {
  average: string;
  /** Pixel no percentil 5 de luminância: a parte escura, que pior contrasta com um fundo claro. */
  dark: string;
  /** Pixel no percentil 95 de luminância: a parte clara, que pior contrasta com um fundo escuro. */
  light: string;
}

export const SCENE_COLORS: Readonly<Record<string, SceneColors>> = {
  ceu: { average: '#aed1f2', dark: '#4991df', light: '#f7fbff' },
  folhas: { average: '#d5ecc1', dark: '#71bb50', light: '#eef8e6' },
  petalas: { average: '#fad8e6', dark: '#f6b2ce', light: '#feeef4' },
  aurora: { average: '#33346b', dark: '#0d0a26', light: '#59aeba' },
  'por-do-sol': { average: '#ec9268', dark: '#c8445a', light: '#ffd187' },
  ondas: { average: '#a8e1d3', dark: '#1c9083', light: '#def6ef' },
  brasas: { average: '#a73129', dark: '#6a1019', light: '#da5334' },
  pontilhado: { average: '#8b9097', dark: '#484e56', light: '#dadde0' },
  'noite-estrelada': { average: '#212d58', dark: '#080f2b', light: '#495782' },
  montanhas: { average: '#b0cbe6', dark: '#85a6cc', light: '#e5eef7' },
};
