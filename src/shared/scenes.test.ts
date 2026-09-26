import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILTIN_SCENES, findBuiltinScene, validateSceneChoice } from './scenes';
import { THEMES } from './themes';

const DIR = join(__dirname, '..', '..', 'public', 'scenes');

describe('galeria de cenas', () => {
  it('10 cenas, ids únicos, nomes em português', () => {
    expect(BUILTIN_SCENES).toHaveLength(10);
    expect(new Set(BUILTIN_SCENES.map((s) => s.id)).size).toBe(10);
    expect(findBuiltinScene('por-do-sol')?.name).toBe('Pôr do sol');
    expect(findBuiltinScene('nada')).toBeUndefined();
  });

  it('a cena padrão de cada tema existe na galeria', () => {
    for (const t of THEMES) expect(findBuiltinScene(t.scene), t.id).toBeTruthy();
  });

  it.each(BUILTIN_SCENES.map((s) => s.id))('%s.svg existe, é leve e seguro', (id) => {
    const file = join(DIR, `${id}.svg`);
    expect(statSync(file).size).toBeLessThanOrEqual(12 * 1024);
    const svg = readFileSync(file, 'utf8');
    expect(svg).toContain('viewBox="0 0 1600 900"');
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/href="http/i);
    expect(svg).not.toMatch(/<image/i);
    expect(svg).not.toMatch(/<foreignObject/i);
    expect(svg).not.toMatch(/\son[a-z]+=/i);
  });
});

describe('validateSceneChoice', () => {
  it('aceita os formatos válidos', () => {
    expect(validateSceneChoice({ kind: 'none' })).toEqual({ kind: 'none' });
    expect(validateSceneChoice({ kind: 'builtin', id: 'aurora' })).toEqual({ kind: 'builtin', id: 'aurora' });
    expect(validateSceneChoice({ kind: 'custom', id: '0123456789abcdef' })).toEqual({
      kind: 'custom',
      id: '0123456789abcdef',
    });
  });

  it('descarta campos extras', () => {
    expect(validateSceneChoice({ kind: 'none', id: 'x' })).toEqual({ kind: 'none' });
    expect(validateSceneChoice({ kind: 'builtin', id: 'ceu', extra: 1 })).toEqual({ kind: 'builtin', id: 'ceu' });
  });

  it('recusa formatos inválidos', () => {
    for (const v of [
      null,
      undefined,
      'ceu',
      42,
      {},
      { kind: 'builtin' },
      { kind: 'builtin', id: 'nada' },
      { kind: 'builtin', id: 7 },
      { kind: 'custom', id: '0123456789ABCDEF' },
      { kind: 'custom', id: '0123456789abcde' },
      { kind: 'custom', id: '../../etc/passwd' },
      { kind: 'custom', id: '0123456789abcdef0' },
      { kind: 'image', id: '0123456789abcdef' },
    ])
      expect(validateSceneChoice(v), JSON.stringify(v)).toBeNull();
  });
});
