import { describe, expect, it } from 'vitest';
import { findLinks, normalizeUrl, youtubeId, youtubeStart } from './links';

const urls = (text: string) => findLinks(text).map((l) => l.url);
const spans = (text: string) => findLinks(text).map((l) => text.slice(l.start, l.end));

describe('findLinks', () => {
  it('acha link no meio da frase', () => {
    expect(spans('olha https://example.com/a?b=1 que legal')).toEqual(['https://example.com/a?b=1']);
  });

  it('acha vários links', () => {
    expect(urls('http://a.com e https://b.com/x')).toEqual(['http://a.com/', 'https://b.com/x']);
  });

  it('deixa a pontuação final fora', () => {
    expect(spans('veja https://a.com/x. E https://b.com, ok? https://c.com!')).toEqual([
      'https://a.com/x',
      'https://b.com',
      'https://c.com',
    ]);
  });

  it('parênteses: mantém os balanceados e tira o que fecha a frase', () => {
    expect(spans('(ver https://pt.wikipedia.org/wiki/Rio_(cidade))')).toEqual(['https://pt.wikipedia.org/wiki/Rio_(cidade)']);
    expect(spans('(ver https://a.com/x)')).toEqual(['https://a.com/x']);
  });

  it('www. vira https', () => {
    expect(urls('www.example.com/p')).toEqual(['https://www.example.com/p']);
  });

  it('aceita IP da LAN com porta', () => {
    expect(urls('abre http://192.168.0.10:3000/app')).toEqual(['http://192.168.0.10:3000/app']);
  });

  it('não reconhece outros esquemas', () => {
    expect(urls('javascript:alert(1) file:///etc/passwd data:text/html,oi')).toEqual([]);
  });

  it('texto sem link', () => {
    expect(findLinks('só texto :) www')).toEqual([]);
  });
});

describe('normalizeUrl', () => {
  it('recusa usuário e senha, esquemas e tamanho', () => {
    expect(normalizeUrl('https://user:pw@a.com')).toBeNull();
    expect(normalizeUrl('ftp://a.com')).toBeNull();
    expect(normalizeUrl(`https://a.com/${'x'.repeat(3000)}`)).toBeNull();
    expect(normalizeUrl(42)).toBeNull();
    expect(normalizeUrl('https://a.com')).toBe('https://a.com/');
  });
});

describe('youtubeId', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ&t=10',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?t=42',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
  ])('%s', (url) => expect(youtubeId(url)).toBe('dQw4w9WgXcQ'));

  it('outros links e ids inválidos', () => {
    expect(youtubeId('https://www.youtube.com/channel/abc')).toBeNull();
    expect(youtubeId('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeId('https://youtu.be/curto')).toBeNull();
    expect(youtubeId('não é url')).toBeNull();
  });
});

describe('youtubeStart', () => {
  it('lê os formatos de tempo', () => {
    expect(youtubeStart('https://youtu.be/dQw4w9WgXcQ?t=90')).toBe(90);
    expect(youtubeStart('https://youtu.be/dQw4w9WgXcQ?t=90s')).toBe(90);
    expect(youtubeStart('https://youtu.be/dQw4w9WgXcQ?t=1m30s')).toBe(90);
    expect(youtubeStart('https://youtu.be/dQw4w9WgXcQ?t=1h0m1s')).toBe(3601);
    expect(youtubeStart('https://www.youtube.com/embed/dQw4w9WgXcQ?start=5')).toBe(5);
    expect(youtubeStart('https://youtu.be/dQw4w9WgXcQ')).toBe(0);
    expect(youtubeStart('https://youtu.be/dQw4w9WgXcQ?t=abc')).toBe(0);
  });
});
