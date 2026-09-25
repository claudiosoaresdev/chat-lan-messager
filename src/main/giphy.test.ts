import { describe, expect, it, vi } from 'vitest';
import { GiphyClient, isGiphyKey, isGiphyMediaUrl, parseSearchResponse } from './giphy';

const item = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: `GIF ${id}`,
  images: {
    fixed_width_small: { url: `https://media1.giphy.com/media/${id}/100w.gif` },
    downsized: { url: `https://media1.giphy.com/media/${id}/giphy-downsized.gif` },
    fixed_height: { url: `https://media1.giphy.com/media/${id}/200.gif` },
  },
  ...overrides,
});

describe('isGiphyMediaUrl', () => {
  it('aceita só https em domínios do GIPHY', () => {
    expect(isGiphyMediaUrl('https://media2.giphy.com/media/x/giphy.gif')).toBe(true);
    expect(isGiphyMediaUrl('https://i.giphy.com/x.gif')).toBe(true);
    expect(isGiphyMediaUrl('http://media2.giphy.com/x.gif')).toBe(false);
    expect(isGiphyMediaUrl('https://giphy.com.evil.com/x.gif')).toBe(false);
    expect(isGiphyMediaUrl('https://evilgiphy.com/x.gif')).toBe(false);
    expect(isGiphyMediaUrl('file:///etc/passwd')).toBe(false);
    expect(isGiphyMediaUrl(42)).toBe(false);
  });
});

describe('isGiphyKey', () => {
  it('valida o formato da chave', () => {
    expect(isGiphyKey('abcDEF1234567890abcd')).toBe(true);
    expect(isGiphyKey('curta')).toBe(false);
    expect(isGiphyKey('com espaço 1234567890')).toBe(false);
  });
});

describe('parseSearchResponse', () => {
  it('extrai prévia e versão de envio e calcula a próxima página', () => {
    const page = parseSearchResponse(
      { data: [item('a1'), item('b2')], pagination: { total_count: 10, count: 2, offset: 0 } },
      0,
    );
    expect(page.results.map((r) => r.id)).toEqual(['a1', 'b2']);
    expect(page.results[0]).toMatchObject({
      title: 'GIF a1',
      previewUrl: 'https://media1.giphy.com/media/a1/100w.gif',
      sendUrl: 'https://media1.giphy.com/media/a1/200.gif',
    });
    expect(page.next).toBe(2);
  });

  it('última página não tem próxima', () => {
    expect(parseSearchResponse({ data: [item('a1')], pagination: { total_count: 1 } }, 0).next).toBeNull();
  });

  it('descarta itens com URL fora do GIPHY ou id estranho', () => {
    const page = parseSearchResponse(
      {
        data: [
          item('ok1'),
          item('bad1', {
            images: {
              fixed_width_small: { url: 'https://evil.com/x.gif' },
              downsized: { url: 'https://evil.com/y.gif' },
              fixed_height: { url: 'https://evil.com/z.gif' },
            },
          }),
          item('../x'),
        ],
        pagination: { total_count: 3 },
      },
      0,
    );
    expect(page.results.map((r) => r.id)).toEqual(['ok1']);
  });

  it('resposta inesperada vira lista vazia', () => {
    expect(parseSearchResponse(null, 0)).toEqual({ results: [], next: null });
    expect(parseSearchResponse({ data: 'x' }, 0)).toEqual({ results: [], next: null });
  });
});

describe('GiphyClient', () => {
  const GIF = Uint8Array.from([...new TextEncoder().encode('GIF89a'), 1, 2, 3]);

  it('busca, baixa as prévias e baixa o GIF para enviar (fetch simulado)', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.startsWith('https://api.giphy.com/')) {
        return new Response(JSON.stringify({ data: [item('a1'), item('b2')], pagination: { total_count: 50 } }), { status: 200 });
      }
      return new Response(GIF, { status: 200 });
    });
    try {
      const client = new GiphyClient(() => 'abcDEF1234567890abcd');
      const page = await client.search('gato');
      expect(page.items.map((i) => i.id)).toEqual(['a1', 'b2']);
      expect(page.next).toBe(2);
      expect(calls[0]).toContain('/search?');
      expect(calls[0]).toContain('q=gato');

      const gif = await client.fetchForSending('a1');
      expect(gif.data).toEqual(GIF);
      await expect(client.fetchForSending('nunca-visto')).rejects.toThrow(/Busque de novo/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sem chave não busca; chave recusada vira mensagem clara', async () => {
    await expect(new GiphyClient(() => null).search('x')).rejects.toThrow(/chave de API/);
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    try {
      await expect(new GiphyClient(() => 'abcDEF1234567890abcd').search('x')).rejects.toThrow(/inválida/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('recusa arquivo que não é GIF', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.startsWith('https://api.giphy.com/')
        ? new Response(JSON.stringify({ data: [item('a1')], pagination: { total_count: 1 } }), { status: 200 })
        : new Response('<html>nope</html>', { status: 200 }),
    );
    try {
      const client = new GiphyClient(() => 'abcDEF1234567890abcd');
      expect((await client.search('')).items).toEqual([]); // prévia inválida é pulada
      await expect(client.fetchForSending('a1')).rejects.toThrow(/não é GIF/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
