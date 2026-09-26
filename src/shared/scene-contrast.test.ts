import { describe, expect, it } from 'vitest';
import { averageColor, contrast, isDarkNeutral, luminance, messageColor, mixColors } from './color';
import { SCENE_COLORS, type SceneColors } from './scene-averages';
import {
  CONTACT_SCENE_VEIL,
  SCENE_PLATE,
  SCENE_TOOL_PLATE,
  SCENE_VEIL,
  messageBackground,
  sceneSecondaryColors,
} from './scene-contrast';
import { BUILTIN_SCENES } from './scenes';
import { CLASSIC_DARK, CLASSIC_LIGHT } from './theme-tokens';
import { THEMES, themeTokens, type ThemeMode } from './themes';

const MODES: ThemeMode[] = ['light', 'dark'];
const WHITE = '#ffffff';
const BLACK = '#000000';
/** Paleta do "Alterar fonte" (as mesmas cores do teste de messageColor). */
const PALETTE = ['#000000', '#595959', '#800000', '#d40000', '#e46c0a', '#7f4f1f', '#808000', '#008000', '#008080',
  '#006d8f', '#000080', '#0050c8', '#5b2c9f', '#800080', '#c000c0', '#d6337f'];

const c = (tokens: Record<string, string>, name: string) => averageColor(tokens[name]);

describe('tabela de cores médias', () => {
  it('toda cena da galeria tem cores (média e extremos), e só elas', () => {
    expect(Object.keys(SCENE_COLORS).sort()).toEqual(BUILTIN_SCENES.map((s) => s.id).sort());
    for (const v of Object.values(SCENE_COLORS)) {
      for (const hex of [v.average, v.dark, v.light]) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      // o escuro é mais escuro que a média, que é mais escura que o claro
      expect(luminance(v.dark)).toBeLessThanOrEqual(luminance(v.average));
      expect(luminance(v.average)).toBeLessThanOrEqual(luminance(v.light));
    }
  });

  it('o fundo conferido é o pior trecho: escuro no claro, claro no escuro', () => {
    const colors = { average: '#808080', dark: '#000000', light: '#ffffff' };
    expect(messageBackground('#ffffff', colors, 'light')).toBe(mixColors('#ffffff', '#000000', SCENE_VEIL.light / 100));
    expect(messageBackground('#20262f', colors, 'dark')).toBe(mixColors('#20262f', '#ffffff', SCENE_VEIL.dark / 100));
  });

  it('sem cena, o fundo das mensagens é a própria superfície', () => {
    expect(messageBackground('#20262f', null, 'dark')).toBe('#20262f');
  });

  it('cena de contato: véu mais forte, e o fundo conferido usa esse véu', () => {
    for (const mode of ['light', 'dark'] as const) expect(CONTACT_SCENE_VEIL[mode]).toBeGreaterThan(SCENE_VEIL[mode]);
    const colors = { average: '#808080', dark: '#000000', light: '#ffffff' };
    expect(messageBackground('#ffffff', colors, 'light', CONTACT_SCENE_VEIL)).toBe(
      mixColors('#ffffff', '#000000', CONTACT_SCENE_VEIL.light / 100),
    );
  });

  it('véu mais forte que o do plano original (88/82) onde precisou', () => {
    expect(SCENE_VEIL.light).toBeGreaterThanOrEqual(88);
    expect(SCENE_VEIL.dark).toBeGreaterThanOrEqual(82);
  });
});

/** Imagem própria sintética: metade preta, metade branca (média cinza, extremos puros). */
const HALF: SceneColors = { average: '#808080', dark: '#000000', light: '#ffffff' };
const SCENES: Record<string, SceneColors> = { ...SCENE_COLORS, 'meio-preto-meio-branco': HALF };

// Fundo conferido = mistura sRGB de --surface (véu%) com o pior trecho da cena (p5 no claro, p95 no escuro), o
// mesmo que o renderer usa.
const cases = THEMES.flatMap((t) => MODES.flatMap((m) => Object.keys(SCENES).map((s) => [t.id, m, s] as const)));

describe.each(cases)('mensagens: %s / %s / cena %s', (theme, mode, scene) => {
  const tokens = themeTokens(theme, mode);
  const bg = messageBackground(tokens.surface, SCENES[scene], mode);
  const colorMin = mode === 'dark' ? 4.5 : 3;

  it('texto do tema ≥ 4,5', () => expect(contrast(c(tokens, 'text'), bg)).toBeGreaterThanOrEqual(4.5));
  it(`link e destaque ≥ ${colorMin}`, () => {
    expect(contrast(c(tokens, 'link'), bg)).toBeGreaterThanOrEqual(colorMin);
    expect(contrast(c(tokens, 'accent'), bg)).toBeGreaterThanOrEqual(colorMin);
  });
  it('secundárias ("diz:", avisos, muted) ≥ 4,5', () => {
    const sec = sceneSecondaryColors(tokens, bg);
    for (const [name, v] of Object.entries(sec)) expect(contrast(v, bg), name).toBeGreaterThanOrEqual(4.5);
  });
  it('cores das mensagens (messageColor com o fundo efetivo)', () => {
    for (const hex of PALETTE) {
      if (mode === 'dark' && isDarkNeutral(hex)) {
        expect(messageColor(hex, bg, mode, 'var(--text)')).toBe('var(--text)');
        continue;
      }
      expect(contrast(messageColor(hex, bg, mode, 'var(--text)'), bg), hex).toBeGreaterThanOrEqual(colorMin);
    }
  });
});

describe('garantias que não dependem da imagem', () => {
  it.each(THEMES.flatMap((t) => MODES.map((m) => [t.id, m] as const)))(
    'texto do tema sobre o véu, mesmo num pixel preto ou branco: %s / %s',
    (theme, mode) => {
      const tokens = themeTokens(theme, mode);
      const surface = c(tokens, 'surface');
      for (const px of [BLACK, WHITE]) {
        const bg = mixColors(surface, px, SCENE_VEIL[mode] / 100);
        expect(contrast(c(tokens, 'text'), bg), px).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('faixa translúcida do topo: 4,5:1 sobre qualquer pixel', () => {
    for (const tokens of [CLASSIC_LIGHT, CLASSIC_DARK])
      for (const tone of ['dark', 'light'] as const)
        for (const px of [BLACK, WHITE, '#808080']) {
          const plate = mixColors(c(tokens, `scene-shade-on-${tone}`), px, SCENE_PLATE / 100);
          expect(contrast(c(tokens, `scene-text-on-${tone}`), plate), `${tone} ${px}`).toBeGreaterThanOrEqual(4.5);
        }
  });

  it.each(THEMES.flatMap((t) => MODES.map((m) => [t.id, m] as const)))(
    'botões na transição da cena (placa de --bg): %s / %s',
    (theme, mode) => {
      const tokens = themeTokens(theme, mode);
      for (const px of [BLACK, WHITE]) {
        const plate = mixColors(c(tokens, 'bg'), px, SCENE_TOOL_PLATE / 100);
        expect(contrast(c(tokens, 'text-strong'), plate), px).toBeGreaterThanOrEqual(4.5);
        // ícones (o "+" usa o link): 3:1
        expect(contrast(c(tokens, 'link'), plate), px).toBeGreaterThanOrEqual(3);
      }
    },
  );
});
