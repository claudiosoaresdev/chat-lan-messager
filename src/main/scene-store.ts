// Cenas próprias no disco: <userData>/scenes/<16 hex>.jpg, já recortadas e reduzidas pela interface
// (1600×900, JPEG até 400 KB). O nome é o início do SHA-1 dos bytes, então a mesma imagem não duplica.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CustomScene } from '../shared/api';
import { MAX_SCENE_BYTES } from '../shared/scenes';

export { MAX_SCENE_BYTES };
/** Quantas imagens próprias ficam guardadas; ao passar, as mais antigas (fora de uso) são apagadas. */
export const MAX_CUSTOM_SCENES = 12;

const SCENE_ID = /^[0-9a-f]{16}$/;

/** Confere tamanho e assinatura JPEG (FF D8 FF). */
export function validateSceneImage(data: Uint8Array) {
  if (data.byteLength === 0 || data.byteLength > MAX_SCENE_BYTES) throw new Error('Imagem da cena maior que 400 KB');
  if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) throw new Error('A cena precisa ser JPEG');
}

export const isSceneId = (id: unknown): id is string => typeof id === 'string' && SCENE_ID.test(id);

export class SceneStore {
  private readonly dir: string;

  /** `inUse`: ids das imagens próprias que a aparência usa agora, salva ou em prévia (não saem na limpeza). */
  constructor(userData: string, private readonly inUse: () => readonly string[] = () => []) {
    this.dir = path.join(userData, 'scenes');
  }

  private file(id: string) {
    if (!isSceneId(id)) throw new Error('Cena inválida');
    return path.join(this.dir, `${id}.jpg`);
  }

  /** Ids no disco, mais recentes primeiro. */
  private ids(): string[] {
    let files: string[];
    try {
      files = fs.readdirSync(this.dir);
    } catch {
      return [];
    }
    return files
      .map((f) => /^([0-9a-f]{16})\.jpg$/.exec(f)?.[1])
      .filter((id): id is string => !!id)
      .map((id) => {
        try {
          return { id, mtime: fs.statSync(this.file(id)).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((x): x is { id: string; mtime: number } => !!x)
      .sort((a, b) => b.mtime - a.mtime || a.id.localeCompare(b.id))
      .map((x) => x.id);
  }

  has(id: string): boolean {
    return isSceneId(id) && fs.existsSync(this.file(id));
  }

  get(id: string): Uint8Array | null {
    if (!isSceneId(id)) return null;
    try {
      const data = new Uint8Array(fs.readFileSync(this.file(id)));
      validateSceneImage(data);
      return data;
    } catch {
      return null;
    }
  }

  list(): CustomScene[] {
    return this.ids()
      .slice(0, MAX_CUSTOM_SCENES)
      .flatMap((id) => {
        const data = this.get(id);
        return data ? [{ id, data }] : [];
      });
  }

  /** Guarda (sem duplicar; a mesma imagem sobe para o topo) e apaga as mais antigas além do limite. */
  add(data: Uint8Array): { id: string } {
    validateSceneImage(data);
    const id = createHash('sha1').update(data).digest('hex').slice(0, 16);
    fs.mkdirSync(this.dir, { recursive: true });
    const file = this.file(id);
    fs.writeFileSync(file, data);
    // Mesma imagem de novo: o mtime novo a põe na frente.
    const now = new Date();
    fs.utimesSync(file, now, now);

    const all = this.ids();
    const keep = new Set([id, ...this.inUse().filter((x) => all.includes(x))]);
    const extra = all.filter((x) => !keep.has(x)).slice(Math.max(0, MAX_CUSTOM_SCENES - keep.size));
    for (const old of extra) fs.rmSync(this.file(old), { force: true });
    return { id };
  }

  remove(id: string) {
    fs.rmSync(this.file(id), { force: true });
  }
}
