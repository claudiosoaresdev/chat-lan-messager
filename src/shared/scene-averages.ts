// Cor média de cada cena da galeria (tabela gerada). Serve de valor inicial no renderer (o fundo efetivo das
// mensagens já sai certo antes de medir a imagem) e para o teste de contraste sobre todas as cenas.
//
// Como gerar: no Electron, cada public/scenes/<id>.svg é desenhado inteiro num canvas 320×180 e a média sRGB
// dos pixels sai de averagePixels (src/renderer/scene-tone.ts) — a mesma amostragem que o app faz em tempo de
// execução. Refaça ao mudar um SVG (o teste em scene-contrast.test.ts confere que toda cena tem entrada).
export const SCENE_AVERAGES: Readonly<Record<string, string>> = {
  ceu: '#aed1f2',
  folhas: '#d5ecc1',
  petalas: '#fad8e6',
  aurora: '#33346b',
  'por-do-sol': '#ec9268',
  ondas: '#a8e1d3',
  brasas: '#a73129',
  pontilhado: '#8b9097',
  'noite-estrelada': '#212d58',
  montanhas: '#b0cbe6',
};
