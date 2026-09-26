import { describe, expect, it } from 'vitest';
import { css2Url, fontSlug, parseFontFaces, weightsOf } from './google-css';

const CSS = `
/* cyrillic */
@font-face {
  font-family: 'Roboto';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/roboto/v1/cyr.woff2) format('woff2');
  unicode-range: U+0460-052F;
}
/* latin-ext */
@font-face {
  font-family: 'Roboto';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/roboto/v1/ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+1E00-1EFF;
}
/* latin */
@font-face {
  font-family: 'Roboto';
  font-style: italic;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/roboto/v1/lat.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+2000-206F;
}
/* latin */
@font-face {
  font-family: 'Roboto';
  font-style: normal;
  font-weight: 400;
  src: url(https://evil.example/x.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
`;

describe('google-css', () => {
  it('lê só latin e latin-ext, só do fonts.gstatic.com', () => {
    expect(parseFontFaces(CSS)).toEqual([
      { weight: 400, style: 'normal', unicodeRange: 'U+0100-02BA, U+1E00-1EFF', src: 'https://fonts.gstatic.com/s/roboto/v1/ext.woff2' },
      { weight: 700, style: 'italic', unicodeRange: 'U+0000-00FF, U+2000-206F', src: 'https://fonts.gstatic.com/s/roboto/v1/lat.woff2' },
    ]);
  });

  it('bloco sem comentário de subconjunto é aceito (fonte só latina)', () => {
    const css = `@font-face { font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/p/v1/a.woff2) format('woff2'); }`;
    expect(parseFontFaces(css)).toEqual([{ weight: 400, style: 'normal', unicodeRange: '', src: 'https://fonts.gstatic.com/s/p/v1/a.woff2' }]);
  });

  it('fonte tipo CJK (Noto Sans JP): fatias numeradas sem comentário útil são descartadas quando há blocos com subconjunto nomeado', () => {
    // Formato real do Google para fontes com muitos subconjuntos: dezenas de fatias, algumas sem
    // comentário e outras com `/* [n] */` (não é um nome de subconjunto), e os nomeados no fim.
    const numbered = Array.from(
      { length: 3 },
      (_, i) => `
/* [${i}] */
@font-face { font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/notosansjp/v1/slice${i}.woff2) format('woff2'); unicode-range: U+3000-303F; }`,
    ).join('\n');
    const unlabelled = `@font-face { font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/notosansjp/v1/nolabel.woff2) format('woff2'); }`;
    const css = `
${numbered}
${unlabelled}
/* vietnamese */
@font-face { font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/notosansjp/v1/vi.woff2) format('woff2'); unicode-range: U+0102-0103; }
/* latin-ext */
@font-face { font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/notosansjp/v1/ext.woff2) format('woff2'); unicode-range: U+0100-024F; }
/* latin */
@font-face { font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/notosansjp/v1/lat.woff2) format('woff2'); unicode-range: U+0000-00FF; }
`;
    expect(parseFontFaces(css)).toEqual([
      { weight: 400, style: 'normal', unicodeRange: 'U+0100-024F', src: 'https://fonts.gstatic.com/s/notosansjp/v1/ext.woff2' },
      { weight: 400, style: 'normal', unicodeRange: 'U+0000-00FF', src: 'https://fonts.gstatic.com/s/notosansjp/v1/lat.woff2' },
    ]);
  });

  it('pesos pela máscara de bits', () => {
    expect(weightsOf(0b000001000)).toEqual([400]);
    expect(weightsOf(0b101001101)).toEqual([100, 300, 400, 700, 900]);
  });

  it('monta a URL do css2 com itálico e pesos em ordem', () => {
    expect(css2Url(['Open Sans', 'sans', 0b001001000, 1])).toBe(
      'https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap',
    );
    expect(css2Url(['Pacifico', 'handwriting', 0b000001000, 0])).toBe(
      'https://fonts.googleapis.com/css2?family=Pacifico:ital,wght@0,400&display=swap',
    );
  });

  it('slug seguro para pasta', () => {
    expect(fontSlug('Open Sans')).toBe('open-sans');
    expect(fontSlug('M PLUS 1p')).toBe('m-plus-1p');
    expect(fontSlug('../Evil Font')).toBe('evil-font');
  });
});
