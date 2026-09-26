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
  return vi.fn(async (url: string, init?: RequestInit) => {
    void init; // só para bater com a assinatura de FetchLike (o teste de timeout confere as chamadas)
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

  it('ensure de nome herdado do Object.prototype rejeita (sem lançar síncrono) em vez de "achar" a família', () => {
    const cache = new FontCache(dir, {}, fakeFetch());
    const p = cache.ensure('constructor');
    expect(p).toBeInstanceOf(Promise);
    return expect(p).rejects.toThrow(/desconhecida/);
  });

  it('toda requisição de rede leva timeout e trava redirecionamento', async () => {
    const fetch = fakeFetch();
    const cache = new FontCache(dir, {}, fetch);
    await cache.ensure('Lobster');
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const call of fetch.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('rejeita pelo content-length antes de ler o corpo, sem gravar nada', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.startsWith('https://fonts.googleapis.com/css2')) return new Response(CSS());
      return new Response(new Uint8Array(10), { headers: { 'content-length': String(MAX_FILE_BYTES + 1) } });
    });
    const cache = new FontCache(dir, {}, fetch);
    await expect(cache.ensure('Lobster')).rejects.toThrow(/grande/);
    expect(fs.existsSync(path.join(dir, 'lobster'))).toBe(false);
  });

  it('remove a pasta da família se o download falhar no meio do caminho', async () => {
    const cssTwoFiles = `
/* latin */
@font-face { font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/x/v1/a.woff2) format('woff2'); }
/* latin */
@font-face { font-style: normal; font-weight: 700; src: url(https://fonts.gstatic.com/s/x/v1/b.woff2) format('woff2'); }
`;
    let fileCalls = 0;
    const fetch = vi.fn(async (url: string) => {
      if (url.startsWith('https://fonts.googleapis.com/css2')) return new Response(cssTwoFiles);
      fileCalls++;
      if (fileCalls === 1) return new Response(new Uint8Array(10));
      return new Response(null, { status: 500 });
    });
    const cache = new FontCache(dir, {}, fetch);
    await expect(cache.ensure('Lobster')).rejects.toThrow(/falhou/);
    expect(fs.existsSync(path.join(dir, 'lobster'))).toBe(false);
  });

  it('memória de falha: rejeita rápido por 10 minutos, sem rede; depois do prazo tenta de novo', async () => {
    let clock = 0;
    const fetch = vi.fn(async (url: string) => {
      if (url.startsWith('https://fonts.googleapis.com/css2')) return new Response('sem faces válidas');
      return new Response(new Uint8Array(10));
    });
    const cache = new FontCache(dir, {}, fetch, { now: () => clock });

    await expect(cache.ensure('Lobster')).rejects.toThrow(/Nenhuma/);
    expect(fetch).toHaveBeenCalledTimes(1);

    // Dentro da janela de 10 minutos: rejeita sem nova chamada de rede.
    clock += 5 * 60 * 1000;
    await expect(cache.ensure('Lobster')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);

    // Passado o prazo: tenta de novo (e agora com CSS válido, funciona).
    clock += 5 * 60 * 1000 + 1;
    fetch.mockImplementation(async (url: string) => {
      if (url.startsWith('https://fonts.googleapis.com/css2')) return new Response(CSS());
      return new Response(new Uint8Array(10));
    });
    const faces = await cache.ensure('Lobster');
    expect(faces).toHaveLength(2);
  });

  it('fila global: no máximo 2 famílias baixam ao mesmo tempo, o resto espera', async () => {
    let active = 0;
    let maxActive = 0;
    const pending: Array<() => void> = [];
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith('https://fonts.googleapis.com/css2')) {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => pending.push(resolve));
        active--;
        return new Response(CSS());
      }
      return new Response(new Uint8Array(10));
    });
    const cache = new FontCache(dir, {}, fetchImpl, { maxConcurrent: 2 });

    const p1 = cache.ensure('ABeeZee');
    const p2 = cache.ensure('Abel');
    const p3 = cache.ensure('Aboreto');

    // Libera uma família de cada vez; nunca deve haver mais de 2 em voo simultaneamente.
    for (let i = 0; i < 3; i++) {
      while (!pending.length) await new Promise((r) => setTimeout(r, 0));
      const release = pending.shift();
      release?.();
    }
    await Promise.all([p1, p2, p3]);
    expect(maxActive).toBe(2);
  });

  it('capacidade total do disco: descarta a família menos usada quando passa do limite, mas nunca a recém-baixada', async () => {
    const fetch = fakeFetch();
    const cache = new FontCache(dir, {}, fetch, { maxCacheBytes: 1 });
    await cache.ensure('ABeeZee');
    expect(fs.existsSync(path.join(dir, 'abeezee'))).toBe(true);
    await cache.ensure('Abel');
    // Estourou o limite: a mais antiga (ABeeZee) sai, a recém-baixada (Abel) fica.
    expect(fs.existsSync(path.join(dir, 'abeezee'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'abel'))).toBe(true);
  });
});
