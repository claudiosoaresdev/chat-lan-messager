import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AvatarStore } from './avatar-store';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]);

let root: string;
let builtin: string;
let store: AvatarStore;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatlan-avatar-'));
  builtin = path.join(root, 'public-avatars');
  fs.mkdirSync(builtin);
  store = new AvatarStore(path.join(root, 'userData'), builtin);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('AvatarStore', () => {
  it('salva, lê e remove a imagem atual', () => {
    expect(store.getCurrent()).toBeNull();
    store.setCurrent(PNG);
    expect(store.getCurrent()).toEqual({ mime: 'image/png', data: PNG });
    store.setCurrent(null);
    expect(store.getCurrent()).toBeNull();
  });

  it('recusa imagem atual inválida', () => {
    expect(() => store.setCurrent(new TextEncoder().encode('<svg/>'))).toThrow(/Formato/);
  });

  it('lista as imagens padrão da pasta, só formatos de imagem, com nome bonito', () => {
    fs.writeFileSync(path.join(builtin, '02-bola-de-futebol.svg'), '<svg/>');
    fs.writeFileSync(path.join(builtin, '01-girassol.png'), PNG);
    fs.writeFileSync(path.join(builtin, 'leia-me.txt'), 'x');
    fs.writeFileSync(path.join(builtin, '.gitkeep'), '');
    const list = store.listBuiltin();
    expect(list.map((a) => [a.id, a.name, a.mime])).toEqual([
      ['builtin:01-girassol.png', 'Girassol', 'image/png'],
      ['builtin:02-bola-de-futebol.svg', 'Bola de futebol', 'image/svg+xml'],
    ]);
  });

  it('pasta de imagens padrão ausente vira lista vazia', () => {
    fs.rmSync(builtin, { recursive: true });
    expect(store.listBuiltin()).toEqual([]);
  });

  it('guarda uploads sem duplicar e remove', () => {
    const a = store.addUpload(PNG);
    store.addUpload(PNG);
    const b = store.addUpload(JPEG);
    expect(a.id).toMatch(/^[a-f0-9]{16}\.png$/);
    expect(b.id).toMatch(/\.jpg$/);
    expect(store.listUploads()).toHaveLength(2);

    store.removeUpload(a.id);
    expect(store.listUploads().map((u) => u.id)).toEqual([b.id]);
  });

  it('não aceita id de upload fora do padrão (evita apagar outros arquivos)', () => {
    expect(() => store.removeUpload('../../settings.json')).toThrow();
  });
});
