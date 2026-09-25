// Imagens de exibição no disco:
//  - padrão: arquivos da pasta public/avatars (qualquer imagem colocada lá aparece na grade);
//  - enviadas: <userData>/avatars/uploads, já recortadas pela interface;
//  - atual: <userData>/avatars/current (a imagem que os contatos veem).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AvatarImage, LibraryAvatar } from '../shared/api';
import { MAX_AVATAR_BYTES, detectImageMime } from '../shared/protocol';

const MAX_UPLOADS = 24;
/** Imagens padrão podem ser maiores (a interface reduz antes de usar), mas com limite. */
const MAX_BUILTIN_BYTES = 2 * 1024 * 1024;

const BUILTIN_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const UPLOAD_ID = /^[a-f0-9]{16}\.(png|jpg|webp|gif)$/;
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Confere tamanho e assinatura; devolve o mime detectado. */
export function validateAvatar(data: Uint8Array): string {
  if (data.byteLength === 0 || data.byteLength > MAX_AVATAR_BYTES) {
    throw new Error('Imagem de exibição maior que 256 KB');
  }
  const mime = detectImageMime(data);
  if (!mime) throw new Error('Formato não suportado (use PNG, JPEG, WebP ou GIF)');
  return mime;
}

/** "girassol-amarelo.svg" → "Girassol amarelo" */
const prettyName = (file: string) => {
  const base = path.parse(file).name.replace(/^\d+[-_ ]*/, '').replace(/[-_]+/g, ' ').trim();
  return base ? base[0].toUpperCase() + base.slice(1) : file;
};

export class AvatarStore {
  private readonly dir: string;
  private readonly uploadsDir: string;

  constructor(userData: string, private readonly builtinDir: string) {
    this.dir = path.join(userData, 'avatars');
    this.uploadsDir = path.join(this.dir, 'uploads');
  }

  getCurrent(): AvatarImage | null {
    try {
      const data = fs.readFileSync(path.join(this.dir, 'current'));
      return { mime: validateAvatar(data), data: new Uint8Array(data) };
    } catch {
      return null;
    }
  }

  setCurrent(data: Uint8Array | null) {
    const file = path.join(this.dir, 'current');
    if (!data) {
      fs.rmSync(file, { force: true });
      return;
    }
    validateAvatar(data);
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(file, data);
  }

  listBuiltin(): LibraryAvatar[] {
    let files: string[];
    try {
      files = fs.readdirSync(this.builtinDir).sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
    const out: LibraryAvatar[] = [];
    for (const file of files) {
      const mime = BUILTIN_TYPES[path.extname(file).toLowerCase()];
      if (!mime) continue;
      try {
        const full = path.join(this.builtinDir, file);
        if (fs.statSync(full).size > MAX_BUILTIN_BYTES) continue;
        out.push({ id: `builtin:${file}`, name: prettyName(file), kind: 'builtin', mime, data: new Uint8Array(fs.readFileSync(full)) });
      } catch {
        // arquivo ilegível: ignora
      }
    }
    return out;
  }

  listUploads(): LibraryAvatar[] {
    let files: string[];
    try {
      files = fs.readdirSync(this.uploadsDir).filter((f) => UPLOAD_ID.test(f));
    } catch {
      return [];
    }
    return files
      .map((file) => ({ file, mtime: fs.statSync(path.join(this.uploadsDir, file)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .flatMap(({ file }) => {
        try {
          const data = fs.readFileSync(path.join(this.uploadsDir, file));
          return [{ id: file, name: 'Minha imagem', kind: 'upload' as const, mime: validateAvatar(data), data: new Uint8Array(data) }];
        } catch {
          return [];
        }
      });
  }

  /** Salva uma imagem enviada (sem duplicar) e mantém só as mais recentes. */
  addUpload(data: Uint8Array): LibraryAvatar {
    const mime = validateAvatar(data);
    const id = `${createHash('sha256').update(data).digest('hex').slice(0, 16)}.${EXT_BY_MIME[mime]}`;
    fs.mkdirSync(this.uploadsDir, { recursive: true });
    const file = path.join(this.uploadsDir, id);
    fs.writeFileSync(file, data);

    const extra = this.listUploads().slice(MAX_UPLOADS);
    for (const old of extra) fs.rmSync(path.join(this.uploadsDir, old.id), { force: true });

    return { id, name: 'Minha imagem', kind: 'upload', mime, data: new Uint8Array(data) };
  }

  removeUpload(id: string) {
    if (!UPLOAD_ID.test(id)) throw new Error('Imagem inválida');
    fs.rmSync(path.join(this.uploadsDir, id), { force: true });
  }
}
