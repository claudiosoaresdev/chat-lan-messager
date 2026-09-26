import { describe, expect, it } from 'vitest';
import { EMOTICONS, tokenize, tokenizeRich } from './emoticon-codes';

const ids = (text: string) =>
  tokenize(text).map((t) => ('text' in t ? t.text : `[${t.emoticon.id}]`));

describe('tokenize', () => {
  it('troca atalhos por emoticons no meio do texto', () => {
    expect(ids('oi :) tudo bem (Y)')).toEqual(['oi ', '[sorriso]', ' tudo bem ', '[joinha]']);
  });

  it('reconhece variações e maiúsculas/minúsculas do MSN', () => {
    expect(ids(':-) :D :d (y) (L) <3')).toEqual([
      '[sorriso]',
      ' ',
      '[gargalhada]',
      ' ',
      '[gargalhada]',
      ' ',
      '[joinha]',
      ' ',
      '[coracao]',
      ' ',
      '[coracao]',
    ]);
  });

  it('prefere o atalho mais longo', () => {
    expect(ids(":'(")).toEqual(['[chorando]']);
    expect(ids(':-P')).toEqual(['[lingua]']);
  });

  it('texto sem atalhos continua igual', () => {
    expect(ids('mensagem normal')).toEqual(['mensagem normal']);
    expect(tokenize('')).toEqual([]);
  });

  it('não deixa atalhos duplicados entre emoticons', () => {
    const all = EMOTICONS.flatMap((e) => e.codes);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('tokenizeRich', () => {
  const parts = (text: string) =>
    tokenizeRich(text).map((t) => ('link' in t ? `<${t.link}>` : 'text' in t ? t.text : `[${t.emoticon.id}]`));

  it('links primeiro: nada dentro do link vira emoticon', () => {
    expect(parts('oi :) https://a.com/x:(y)/8)z (Y)')).toEqual([
      'oi ',
      '[sorriso]',
      ' ',
      '<https://a.com/x:(y)/8)z>',
      ' ',
      '[joinha]',
    ]);
  });

  it('texto sem link é igual ao tokenize', () => {
    expect(tokenizeRich('oi :)')).toEqual(tokenize('oi :)'));
  });

  it('guarda o texto original do link para mostrar', () => {
    const [t] = tokenizeRich('www.a.com');
    expect(t).toEqual({ link: 'https://www.a.com/', label: 'www.a.com' });
  });
});
