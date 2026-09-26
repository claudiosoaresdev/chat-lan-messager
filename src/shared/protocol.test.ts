import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  MAX_SCENE_BYTES,
  MAX_TEXT_LENGTH,
  detectImageMime,
  parseMessage,
  shouldInitiate,
  validateFont,
  validateImageBytes,
  validateSceneBytes,
} from './protocol';
import { jpegHeader, pngHeader } from './test-images';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF = new TextEncoder().encode('GIF89a....');
const WEBP = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

describe('parseMessage', () => {
  it('aceita hello, chat e image válidos', () => {
    expect(parseMessage(JSON.stringify({ type: 'hello', id: 'a', name: 'Mac', status: 'busy', message: 'oi' }))).toEqual({
      type: 'hello',
      id: 'a',
      name: 'Mac',
      status: 'busy',
      message: 'oi',
    });
    expect(
      parseMessage(JSON.stringify({ type: 'presence', from: 'a', name: 'Mac', status: 'away', message: '' })),
    ).toEqual({ type: 'presence', from: 'a', name: 'Mac', status: 'away', message: '' });
    expect(parseMessage(JSON.stringify({ type: 'chat', from: 'a', text: 'oi', ts: 1 }))).toEqual({
      type: 'chat',
      from: 'a',
      text: 'oi',
      ts: 1,
    });
    expect(
      parseMessage(JSON.stringify({ type: 'image', from: 'a', name: 'x.png', mime: 'image/png', size: 10, ts: 1 })),
    ).toMatchObject({ type: 'image', size: 10 });
  });

  it('descarta JSON inválido e tipos desconhecidos', () => {
    expect(parseMessage('{')).toBeNull();
    expect(parseMessage('null')).toBeNull();
    expect(parseMessage('[]')).toBeNull();
    expect(parseMessage('"hello"')).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'nope' }))).toBeNull();
  });

  it('descarta campos ausentes ou com tipo errado', () => {
    expect(parseMessage(JSON.stringify({ type: 'hello', id: 'a' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'hello', id: '', name: 'x' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'chat', from: 'a', text: 5, ts: 1 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'chat', from: 'a', text: 'oi', ts: 'now' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'chat', from: 'a', text: '', ts: 1 }))).toBeNull();
  });

  it('aceita fonte na mensagem e descarta só a fonte inválida', () => {
    const font = { family: 'Comic Sans MS', size: 16, bold: true, italic: false, underline: true, color: '#C00000' };
    expect(parseMessage(JSON.stringify({ type: 'chat', from: 'a', text: 'oi', ts: 1, font }))).toEqual({
      type: 'chat',
      from: 'a',
      text: 'oi',
      ts: 1,
      font: { ...font, color: '#c00000', weight: 700 },
    });
    for (const bad of [
      { ...font, family: 'Papyrus; background:url(x)' },
      { ...font, size: 200 },
      { ...font, size: 12.5 },
      { ...font, color: 'red' },
      { ...font, color: '#fff' },
      { ...font, bold: 'sim' },
    ]) {
      expect(parseMessage(JSON.stringify({ type: 'chat', from: 'a', text: 'oi', ts: 1, font: bad }))).toEqual({
        type: 'chat',
        from: 'a',
        text: 'oi',
        ts: 1,
      });
    }
  });

  it('fonte do Google com peso; legado sem peso; peso e família inválidos', () => {
    const base = { size: 14, bold: false, italic: true, underline: false, color: '#000000' };
    expect(validateFont({ ...base, family: 'Roboto', weight: 300 })).toEqual({ ...base, family: 'Roboto', weight: 300 });
    // bold acompanha o peso para versões antigas
    expect(validateFont({ ...base, family: 'Roboto', weight: 800 })).toEqual({ ...base, family: 'Roboto', weight: 800, bold: true });
    expect(validateFont({ ...base, family: 'Arial', bold: true })).toEqual({ ...base, family: 'Arial', bold: true, weight: 700 });
    expect(validateFont({ ...base, family: 'Arial' })).toEqual({ ...base, family: 'Arial', weight: 400 });
    for (const weight of [0, 150, 1000, '400']) expect(validateFont({ ...base, family: 'Roboto', weight })).toBeNull();
    expect(validateFont({ ...base, family: 'Fonte Que Nao Existe', weight: 400 })).toBeNull();
  });

  it('aceita e valida imagem de exibição', () => {
    expect(parseMessage(JSON.stringify({ type: 'avatar', from: 'a', mime: 'image/png', size: 100 }))).toEqual({
      type: 'avatar',
      from: 'a',
      mime: 'image/png',
      size: 100,
    });
    // size 0 = removeu a imagem
    expect(parseMessage(JSON.stringify({ type: 'avatar', from: 'a', size: 0 }))).toEqual({
      type: 'avatar',
      from: 'a',
      mime: null,
      size: 0,
    });
    expect(parseMessage(JSON.stringify({ type: 'avatar', from: 'a', mime: 'image/svg+xml', size: 10 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'avatar', from: 'a', mime: 'image/png', size: 300 * 1024 }))).toBeNull();
  });

  it('aceita os três formatos de cena', () => {
    expect(parseMessage(JSON.stringify({ type: 'scene', from: 'a', kind: 'builtin', id: 'aurora' }))).toEqual({
      type: 'scene',
      from: 'a',
      kind: 'builtin',
      id: 'aurora',
    });
    expect(parseMessage(JSON.stringify({ type: 'scene', from: 'a', kind: 'image', mime: 'image/jpeg', size: 1000 }))).toEqual({
      type: 'scene',
      from: 'a',
      kind: 'image',
      mime: 'image/jpeg',
      size: 1000,
    });
    expect(parseMessage(JSON.stringify({ type: 'scene', from: 'a', kind: 'none' }))).toEqual({
      type: 'scene',
      from: 'a',
      kind: 'none',
    });
  });

  it('descarta campos extras da cena', () => {
    expect(
      parseMessage(JSON.stringify({ type: 'scene', from: 'a', kind: 'none', id: 'aurora', url: 'http://x/' })),
    ).toEqual({ type: 'scene', from: 'a', kind: 'none' });
    expect(
      parseMessage(JSON.stringify({ type: 'scene', from: 'a', kind: 'builtin', id: 'ceu', mime: 'image/png', size: 5 })),
    ).toEqual({ type: 'scene', from: 'a', kind: 'builtin', id: 'ceu' });
  });

  it('rejeita cena inválida', () => {
    const scene = (v: object) => parseMessage(JSON.stringify({ type: 'scene', from: 'a', ...v }));
    // id da galeria desconhecido (ou caminho) é ignorado
    expect(scene({ kind: 'builtin', id: 'nao-existe' })).toBeNull();
    expect(scene({ kind: 'builtin', id: '../../etc/passwd' })).toBeNull();
    expect(scene({ kind: 'builtin' })).toBeNull();
    // só JPEG/PNG, 1 byte a 400 KB
    for (const mime of ['image/gif', 'image/webp', 'image/svg+xml', undefined]) {
      expect(scene({ kind: 'image', mime, size: 10 })).toBeNull();
    }
    for (const size of [0, -1, 1.5, MAX_SCENE_BYTES + 1, '10', undefined]) {
      expect(scene({ kind: 'image', mime: 'image/png', size })).toBeNull();
    }
    expect(scene({ kind: 'image', mime: 'image/png', size: MAX_SCENE_BYTES })).not.toBeNull();
    expect(scene({ kind: 'custom', id: '0123456789abcdef' })).toBeNull();
    expect(scene({})).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'scene', kind: 'none' }))).toBeNull();
  });

  it('mensagem de tipo desconhecido vira null (é assim que versões antigas ignoram a cena)', () => {
    expect(parseMessage(JSON.stringify({ type: 'coisa-nova', from: 'a' }))).toBeNull();
  });

  it('aceita só winks conhecidos', () => {
    expect(parseMessage(JSON.stringify({ type: 'wink', from: 'a', wink: 'beijo', ts: 1 }))).toEqual({
      type: 'wink',
      from: 'a',
      wink: 'beijo',
      ts: 1,
    });
    expect(parseMessage(JSON.stringify({ type: 'wink', from: 'a', wink: 'desconhecido', ts: 1 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'wink', from: 'a', wink: 'beijo' }))).toBeNull();
  });

  it('aceita e valida chamar atenção', () => {
    expect(parseMessage(JSON.stringify({ type: 'nudge', from: 'a', ts: 5 }))).toEqual({ type: 'nudge', from: 'a', ts: 5 });
    expect(parseMessage(JSON.stringify({ type: 'nudge', from: 'a' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'nudge', from: '', ts: 5 }))).toBeNull();
  });

  it('valida status e mensagem pessoal', () => {
    expect(parseMessage(JSON.stringify({ type: 'hello', id: 'a', name: 'b', status: 'dormindo' }))).toBeNull();
    expect(
      parseMessage(JSON.stringify({ type: 'presence', from: 'a', name: 'b', status: 'available', message: 'x'.repeat(129) })),
    ).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'presence', from: 'a', name: 'b', status: 'available' }))).toBeNull();
  });

  it('descarta texto maior que o limite', () => {
    const text = 'x'.repeat(MAX_TEXT_LENGTH + 1);
    expect(parseMessage(JSON.stringify({ type: 'chat', from: 'a', text, ts: 1 }))).toBeNull();
  });

  it('descarta cabeçalho de imagem com mime não suportado ou tamanho inválido', () => {
    const base = { type: 'image', from: 'a', name: 'x', ts: 1 };
    expect(parseMessage(JSON.stringify({ ...base, mime: 'image/svg+xml', size: 10 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...base, mime: 'image/png', size: 0 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...base, mime: 'image/png', size: 1.5 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...base, mime: 'image/png', size: MAX_IMAGE_BYTES + 1 }))).toBeNull();
  });

  it('remove campos extras', () => {
    expect(parseMessage(JSON.stringify({ type: 'hello', id: 'a', name: 'b', evil: '<script>' }))).toEqual({
      type: 'hello',
      id: 'a',
      name: 'b',
      status: 'available',
      message: '',
    });
  });
});

describe('detectImageMime', () => {
  it('reconhece as assinaturas suportadas', () => {
    expect(detectImageMime(PNG)).toBe('image/png');
    expect(detectImageMime(JPEG)).toBe('image/jpeg');
    expect(detectImageMime(GIF)).toBe('image/gif');
    expect(detectImageMime(WEBP)).toBe('image/webp');
  });

  it('rejeita SVG, vazio e lixo', () => {
    expect(detectImageMime(SVG)).toBeNull();
    expect(detectImageMime(new Uint8Array())).toBeNull();
    expect(detectImageMime(Uint8Array.from([1, 2, 3]))).toBeNull();
    expect(detectImageMime(new TextEncoder().encode('RIFF\0\0\0\0WAVE'))).toBeNull();
  });
});

describe('validateImageBytes', () => {
  it('confere mime declarado contra a assinatura', () => {
    expect(validateImageBytes(PNG, 'image/png')).toBe(true);
    expect(validateImageBytes(PNG, 'image/jpeg')).toBe(false);
  });

  it('confere tamanho declarado', () => {
    expect(validateImageBytes(PNG, 'image/png', PNG.length)).toBe(true);
    expect(validateImageBytes(PNG, 'image/png', PNG.length + 1)).toBe(false);
  });

  it('rejeita acima de 10 MB', () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    expect(validateImageBytes(big, 'image/png')).toBe(false);
  });
});

describe('validateSceneBytes', () => {
  const SJPEG = jpegHeader(1600, 900);
  const SPNG = pngHeader(1600, 900);

  it('aceita JPEG/PNG com assinatura, tamanho e dimensões conferindo', () => {
    expect(validateSceneBytes(SJPEG, 'image/jpeg', SJPEG.length)).toBe(true);
    expect(validateSceneBytes(SPNG, 'image/png', SPNG.length)).toBe(true);
    const max = pngHeader(2048, 1152);
    expect(validateSceneBytes(max, 'image/png', max.length)).toBe(true);
  });

  it('rejeita assinatura diferente do mime, tamanho divergente, vazio e acima do limite', () => {
    expect(validateSceneBytes(SPNG, 'image/jpeg', SPNG.length)).toBe(false);
    expect(validateSceneBytes(SVG, 'image/png', SVG.length)).toBe(false);
    expect(validateSceneBytes(GIF, 'image/png', GIF.length)).toBe(false);
    expect(validateSceneBytes(SPNG, 'image/png', SPNG.length + 1)).toBe(false);
    expect(validateSceneBytes(new Uint8Array(), 'image/png', 0)).toBe(false);
    const big = new Uint8Array(MAX_SCENE_BYTES + 1);
    big.set(SJPEG);
    expect(validateSceneBytes(big, 'image/jpeg', big.length)).toBe(false);
  });

  it('rejeita bomba de descompressão e dimensões zero ou acima de 2048×1152', () => {
    const bomb = pngHeader(10000, 10000);
    expect(bomb.length).toBeLessThan(1024);
    expect(validateSceneBytes(bomb, 'image/png', bomb.length)).toBe(false);
    for (const [w, h] of [[2049, 900], [1600, 1153], [0, 900], [1600, 0]]) {
      const p = pngHeader(w, h);
      const j = jpegHeader(w, h);
      expect(validateSceneBytes(p, 'image/png', p.length)).toBe(false);
      expect(validateSceneBytes(j, 'image/jpeg', j.length)).toBe(false);
    }
  });

  it('rejeita cabeçalho cortado ou embaralhado (sem dimensões)', () => {
    expect(validateSceneBytes(PNG, 'image/png', PNG.length)).toBe(false);
    expect(validateSceneBytes(JPEG, 'image/jpeg', JPEG.length)).toBe(false);
    const cut = SJPEG.slice(0, 26);
    expect(validateSceneBytes(cut, 'image/jpeg', cut.length)).toBe(false);
  });
});

describe('shouldInitiate', () => {
  it('só o ID menor inicia', () => {
    expect(shouldInitiate('a', 'b')).toBe(true);
    expect(shouldInitiate('b', 'a')).toBe(false);
    expect(shouldInitiate('a', 'a')).toBe(false);
  });
});
