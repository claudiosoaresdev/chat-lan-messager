import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_CUSTOM_SCENES, MAX_SCENE_BYTES, SceneStore } from './scene-store';
import { jpegHeader } from '../shared/test-images';

/** JPEG 1600×900 (só cabeçalho), com bytes finais diferentes por n. */
const jpeg = (n: number) => jpegHeader(1600, 900, [n & 0xff, (n >> 8) & 0xff]);

let root: string;
let inUse: string[];
let store: SceneStore;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatlan-scenes-'));
  inUse = [];
  store = new SceneStore(root, () => inUse);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** Deixa o arquivo com um mtime conhecido (a ordem não depende da velocidade do disco). */
const age = (id: string, seconds: number) => {
  const t = new Date(Date.UTC(2026, 0, 1) + seconds * 1000);
  fs.utimesSync(path.join(root, 'scenes', `${id}.jpg`), t, t);
};

describe('SceneStore', () => {
  it('guarda JPEG com id de 16 hex, lê, lista e remove', () => {
    expect(store.list()).toEqual([]);
    const { id } = store.add(jpeg(1));
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(fs.existsSync(path.join(root, 'scenes', `${id}.jpg`))).toBe(true);
    expect(store.get(id)).toEqual(jpeg(1));
    expect(store.has(id)).toBe(true);
    expect(store.list()).toEqual([{ id, data: jpeg(1) }]);
    store.remove(id);
    expect(store.get(id)).toBeNull();
    expect(store.has(id)).toBe(false);
  });

  it('a mesma imagem não duplica', () => {
    const a = store.add(jpeg(1));
    const b = store.add(jpeg(1));
    expect(a).toEqual(b);
    expect(store.list()).toHaveLength(1);
  });

  it('recusa o que não é JPEG e o que passa de 400 KB', () => {
    expect(() => store.add(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toThrow(/JPEG/);
    expect(() => store.add(new Uint8Array(0))).toThrow(/400 KB/);
    const big = new Uint8Array(MAX_SCENE_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(() => store.add(big)).toThrow(/400 KB/);
  });

  it('recusa JPEG com dimensões acima de 2048×1152, zero ou ilegíveis', () => {
    expect(() => store.add(jpegHeader(10000, 10000))).toThrow(/Dimensões/);
    expect(() => store.add(jpegHeader(1600, 0))).toThrow(/Dimensões/);
    expect(() => store.add(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]))).toThrow(/Dimensões/);
    expect(store.list()).toEqual([]);
  });

  it('ids fora do formato são recusados (nada de caminho)', () => {
    expect(() => store.remove('../settings')).toThrow(/inválida/);
    expect(store.get('../settings')).toBeNull();
    expect(store.has('ABCDEF0123456789')).toBe(false);
  });

  it('lista as mais recentes primeiro e ignora arquivos estranhos', () => {
    const a = store.add(jpeg(1)).id;
    const b = store.add(jpeg(2)).id;
    age(a, 10);
    age(b, 5);
    fs.writeFileSync(path.join(root, 'scenes', 'leia-me.txt'), 'x');
    fs.writeFileSync(path.join(root, 'scenes', '0123456789abcdef.jpg'), 'não é jpeg');
    age('0123456789abcdef', 20);
    expect(store.list().map((s) => s.id)).toEqual([a, b]);
  });

  it(`mantém no máximo ${MAX_CUSTOM_SCENES}, apagando as mais antigas fora de uso`, () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_CUSTOM_SCENES; i++) {
      ids.push(store.add(jpeg(i)).id);
      age(ids[i], i);
    }
    // a mais antiga está em uso: sai a segunda mais antiga
    inUse = [ids[0]];
    const extra = store.add(jpeg(100)).id;
    const left = store.list().map((s) => s.id);
    expect(left).toHaveLength(MAX_CUSTOM_SCENES);
    expect(left[0]).toBe(extra);
    expect(left).toContain(ids[0]);
    expect(left).not.toContain(ids[1]);
  });
});
