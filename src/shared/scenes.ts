// Cenas da galeria embutida: SVGs em public/scenes/<id>.svg (1600×900, sem texto nem scripts).

/** Imagens próprias: recorte 16:9 reduzido para 1600×900, JPEG até 400 KB. */
export const SCENE_WIDTH = 1600;
export const SCENE_HEIGHT = 900;
export const MAX_SCENE_BYTES = 400 * 1024;
/** Maior cena aceita (lida do cabeçalho): folga sobre 1600×900, barra bombas de descompressão. */
export const MAX_SCENE_WIDTH = 2048;
export const MAX_SCENE_HEIGHT = 1152;

/** Dimensões dentro do limite das cenas (e não zero). */
export const isSceneSize = (s: { width: number; height: number } | null): boolean =>
  !!s && s.width > 0 && s.height > 0 && s.width <= MAX_SCENE_WIDTH && s.height <= MAX_SCENE_HEIGHT;

export interface BuiltinScene {
  id: string;
  name: string;
}

/** As 8 primeiras são as cenas padrão dos temas (THEMES[].scene), na mesma ordem. */
export const BUILTIN_SCENES: readonly BuiltinScene[] = [
  { id: 'ceu', name: 'Céu' },
  { id: 'folhas', name: 'Folhas' },
  { id: 'petalas', name: 'Pétalas' },
  { id: 'aurora', name: 'Aurora' },
  { id: 'por-do-sol', name: 'Pôr do sol' },
  { id: 'ondas', name: 'Ondas' },
  { id: 'brasas', name: 'Brasas' },
  { id: 'pontilhado', name: 'Pontilhado' },
  { id: 'noite-estrelada', name: 'Noite estrelada' },
  { id: 'montanhas', name: 'Montanhas' },
];

export function findBuiltinScene(id: string): BuiltinScene | undefined {
  return BUILTIN_SCENES.find((s) => s.id === id);
}

/** Cena escolhida: da galeria, imagem própria (id do arquivo) ou nenhuma. null em Appearance = padrão do tema. */
export type SceneChoice = { kind: 'builtin'; id: string } | { kind: 'custom'; id: string } | { kind: 'none' };

/** Nome de arquivo de uma imagem própria: 16 dígitos hexadecimais (início do SHA-1). */
const CUSTOM_ID = /^[0-9a-f]{16}$/;

/** Valida uma escolha de cena vinda do disco ou da IPC; null se inválida. */
export function validateSceneChoice(v: unknown): SceneChoice | null {
  const c = v as { kind?: unknown; id?: unknown } | null;
  if (!c || typeof c !== 'object') return null;
  if (c.kind === 'none') return { kind: 'none' };
  if (typeof c.id !== 'string') return null;
  if (c.kind === 'builtin') return findBuiltinScene(c.id) ? { kind: 'builtin', id: c.id } : null;
  if (c.kind === 'custom') return CUSTOM_ID.test(c.id) ? { kind: 'custom', id: c.id } : null;
  return null;
}
