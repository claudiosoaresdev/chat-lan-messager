import { describe, expect, it, vi } from 'vitest';
import { LinkPreviewer, decodeEntities, parseHead, type MakeThumbnail } from './link-preview';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 6]);

type Route = { status?: number; type?: string; body: string | Uint8Array; url?: string };

function fakeFetch(routes: Record<string, Route>) {
  return vi.fn(async (url: string) => {
    const r = routes[url];
    if (!r) throw new Error(`sem rota: ${url}`);
    const res = new Response(r.body as BodyInit, { status: r.status ?? 200, headers: { 'content-type': r.type ?? 'text/html; charset=utf-8' } });
    Object.defineProperty(res, 'url', { value: r.url ?? url });
    return res;
  });
}

const thumb: MakeThumbnail = () => ({ mime: 'image/jpeg', data: JPEG });

describe('parseHead', () => {
  it('prefere og:, cai para twitter: e <title>', () => {
    const html = `<html><head>
      <title>Título da aba</title>
      <meta name="twitter:title" content="Twitter">
      <meta property="og:title" content="Open &amp; Graph">
      <meta name="description" content="Desc &quot;normal&quot;">
      <meta property="og:site_name" content='Site'>
      <meta property="og:image" content="/img/capa.jpg">
      </head><body><meta property="og:title" content="no corpo"></body></html>`;
    expect(parseHead(html, 'https://a.com/post/1')).toEqual({
      title: 'Open & Graph',
      description: 'Desc "normal"',
      siteName: 'Site',
      image: 'https://a.com/img/capa.jpg',
    });
  });

  it('só <title>; imagem com esquema estranho é ignorada; textos longos cortados', () => {
    const html = `<title>  Só\n o   título </title><meta property="og:image" content="javascript:alert(1)"><meta name="description" content="${'x'.repeat(400)}">`;
    const head = parseHead(html, 'https://a.com/');
    expect(head.title).toBe('Só o título');
    expect(head.image).toBeUndefined();
    expect(head.description?.length).toBe(300);
    expect(head.description?.endsWith('…')).toBe(true);
  });

  it('entidades numéricas', () => {
    expect(decodeEntities('&#65;&#x42;&lt;&nbsp;&desconhecida;')).toBe('AB< &desconhecida;');
  });
});

describe('LinkPreviewer', () => {
  it('página com Open Graph e imagem reduzida', async () => {
    const fetch = fakeFetch({
      'https://a.com/x': {
        body: '<head><meta property="og:title" content="Olá"><meta property="og:image" content="https://cdn.a.com/i.png"></head>',
        url: 'https://www.a.com/x',
      },
      'https://cdn.a.com/i.png': { type: 'image/png', body: PNG },
    });
    const makeThumb = vi.fn(thumb);
    const p = await new LinkPreviewer(fetch, makeThumb).get('https://a.com/x');
    expect(p).toEqual({ url: 'https://a.com/x', title: 'Olá', siteName: 'a.com', image: { mime: 'image/jpeg', data: JPEG } });
    expect(makeThumb).toHaveBeenCalledWith(expect.any(Uint8Array));
  });

  it('imagem que não é imagem: prévia sem imagem', async () => {
    const fetch = fakeFetch({
      'https://a.com/': { body: '<title>T</title><meta property="og:image" content="https://a.com/i">' },
      'https://a.com/i': { type: 'image/png', body: '<svg></svg>' },
    });
    expect(await new LinkPreviewer(fetch, thumb).get('https://a.com/')).toEqual({ url: 'https://a.com/', title: 'T', siteName: 'a.com' });
  });

  it('formato que o redutor não abre vai original se for pequeno', async () => {
    const fetch = fakeFetch({
      'https://a.com/': { body: '<title>T</title><meta property="og:image" content="https://a.com/i">' },
      'https://a.com/i': { type: 'image/png', body: PNG },
    });
    const p = await new LinkPreviewer(fetch, () => null).get('https://a.com/');
    expect(p?.image).toEqual({ mime: 'image/png', data: PNG });
  });

  it('sem título, erro HTTP, tipo errado ou fora do ar → null', async () => {
    const fetch = fakeFetch({
      'https://a.com/sem': { body: '<head></head>' },
      'https://a.com/404': { status: 404, body: '<title>x</title>' },
      'https://a.com/pdf': { type: 'application/pdf', body: '%PDF' },
    });
    const pv = new LinkPreviewer(fetch, thumb);
    expect(await pv.get('https://a.com/sem')).toBeNull();
    expect(await pv.get('https://a.com/404')).toBeNull();
    expect(await pv.get('https://a.com/pdf')).toBeNull();
    expect(await pv.get('https://fora.do.ar/')).toBeNull();
    expect(await pv.get('javascript:alert(1)')).toBeNull();
  });

  it('HTML gigante: lê só o começo', async () => {
    const big = `<title>Grande</title>${'x'.repeat(2 * 1024 * 1024)}`;
    const fetch = fakeFetch({ 'https://a.com/': { body: big } });
    expect((await new LinkPreviewer(fetch, thumb).get('https://a.com/'))?.title).toBe('Grande');
  });

  it('cache: o mesmo link não busca de novo', async () => {
    const fetch = fakeFetch({ 'https://a.com/': { body: '<title>T</title>' } });
    const pv = new LinkPreviewer(fetch, thumb);
    await Promise.all([pv.get('https://a.com/'), pv.get('https://a.com')]);
    await pv.get('https://a.com/');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('YouTube: oEmbed + miniatura oficial', async () => {
    const fetch = fakeFetch({
      'https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ': {
        type: 'application/json',
        body: JSON.stringify({ title: 'Never Gonna Give You Up', author_name: 'Rick Astley' }),
      },
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg': { type: 'image/jpeg', body: JPEG },
    });
    expect(await new LinkPreviewer(fetch, thumb).get('https://youtu.be/dQw4w9WgXcQ?t=10')).toEqual({
      url: 'https://youtu.be/dQw4w9WgXcQ?t=10',
      title: 'Never Gonna Give You Up',
      description: 'Rick Astley',
      siteName: 'YouTube',
      youtube: 'dQw4w9WgXcQ',
      image: { mime: 'image/jpeg', data: JPEG },
    });
  });

  it('YouTube sem oEmbed ainda vira player', async () => {
    const fetch = fakeFetch({});
    const p = await new LinkPreviewer(fetch, thumb).get('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(p).toMatchObject({ title: 'Vídeo do YouTube', youtube: 'dQw4w9WgXcQ', siteName: 'YouTube' });
    expect(p?.image).toBeUndefined();
  });
});
