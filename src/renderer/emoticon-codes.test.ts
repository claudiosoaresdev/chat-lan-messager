import { describe, expect, it } from 'vitest';
import { EMOTICONS, tokenize } from './emoticon-codes';

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
