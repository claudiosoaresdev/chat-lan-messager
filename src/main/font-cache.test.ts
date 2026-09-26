import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FontCache, MAX_FILE_BYTES } from './font-cache';

const CSS = (host = 'fonts.gstatic.com') => `
/* latin */
@font-face { font-style: normal; font-weight: 400; src: url(https://${host}/s/lobster/v1/a.woff2) format('woff2'); unicode-range: U+0000-00FF; }
/* latin */
@font-face { font-style: normal; font-weight: 700; src: url(https://${host}/s/lobster/v1/a.woff2) format('woff2'); unicode-range: U+0000-00FF; }
`;

function fakeFetch(css = CSS(), fileBytes = 10) {
  return vi.fn(async (url: string) => {
    if (url.startsWith('https://fonts.googleapis.com/css2')) return new Response(css);
    return new Response(new Uint8Array(fileBytes));
  });
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatlan-fonts-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const bundled = { Roboto: [{ weight: 400, style: 'normal' as const, unicodeRange: 'U+0000-00FF', file: 'roboto/x.woff2' }] };

describe('FontCache', () => {
  it('favorita vem do manifesto embutido, sem rede', async () => {
    const fetch = fakeFetch();
    const cache = new FontCache(dir, bundled, fetch);
    expect(await cache.ensure('Roboto')).toEqual([{ weight: 400, style: 'normal', unicodeRange: 'U+0000-00FF', url: 'fonts/roboto/x.woff2' }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('baixa uma vez, reaproveita arquivo repetido e guarda no disco', async () => {
    const fetch = fakeFetch();
    const cache = new FontCache(dir, {}, fetch);
    const faces = await cache.ensure('Lobster');
    expect(faces).toHaveLength(2);
    expect(faces[0].url).toMatch(/^chatfont:\/\/cache\/lobster\/[0-9a-f]{16}\.woff2$/);
    expect(faces[0].url).toBe(faces[1].url);
    expect(fetch).toHaveBeenCalledTimes(2); // css + 1 arquivo
    // outra instância lê do disco, sem rede
    const fetch2 = fakeFetch();
    expect(await new FontCache(dir, {}, fetch2).ensure('Lobster')).toEqual(faces);
    expect(fetch2).not.toHaveBeenCalled();
  });

  it('pedidos simultâneos da mesma família viram um download', async () => {
    const fetch = fakeFetch();
    const cache = new FontCache(dir, {}, fetch);
    await Promise.all([cache.ensure('Lobster'), cache.ensure('Lobster')]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('recusa família fora do catálogo, arquivo grande demais e CSS sem faces válidas', async () => {
    await expect(new FontCache(dir, {}, fakeFetch()).ensure('../../etc')).rejects.toThrow(/desconhecida/);
    await expect(new FontCache(dir, {}, fakeFetch(CSS(), MAX_FILE_BYTES + 1)).ensure('Lobster')).rejects.toThrow(/grande/);
    await expect(new FontCache(dir, {}, fakeFetch(CSS('evil.example'))).ensure('Lobster')).rejects.toThrow(/Nenhuma/);
  });

  it('resolve caminho do chatfont só dentro da pasta de fontes', () => {
    const cache = new FontCache(dir, {}, fakeFetch());
    expect(cache.resolveFile('chatfont://cache/lobster/0123456789abcdef.woff2')).toBe(path.join(dir, 'lobster', '0123456789abcdef.woff2'));
    expect(cache.resolveFile('chatfont://cache/../secret.woff2')).toBeNull();
    expect(cache.resolveFile('chatfont://cache/lobster/x.exe')).toBeNull();
  });
});
