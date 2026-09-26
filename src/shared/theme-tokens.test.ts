import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLASSIC_LIGHT, STATUS_COLORS, TOKEN_NAMES } from './theme-tokens';

const CSS = readFileSync(join(__dirname, '..', 'index.css'), 'utf8');
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

const squash = (v: string) => v.replace(/\s+/g, ' ').trim();

/** Troca comentários por espaços (mantém as posições) e devolve as linhas marcadas com cor-fixa. */
function stripComments(css: string) {
  const fixed = new Set<number>();
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c, offset: number) => {
    if (c.includes('cor-fixa')) fixed.add(lineAt(css, offset));
    return c.replace(/[^\n]/g, ' ');
  });
  return { text, fixed };
}

function lineAt(text: string, offset: number) {
  return text.slice(0, offset).split('\n').length;
}

function rootBlock(text: string) {
  const start = text.indexOf(':root {');
  const end = text.indexOf('}', start);
  return { start, end, body: text.slice(start + ':root {'.length, end) };
}

function declarations(text: string) {
  return [...text.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)].map((m) => ({
    name: m[1],
    value: m[2],
    from: lineAt(text, m.index ?? 0),
    to: lineAt(text, (m.index ?? 0) + m[0].length),
  }));
}

describe('tokens de cor', () => {
  const { text, fixed } = stripComments(CSS);
  const root = rootBlock(text);

  it('o :root declara exatamente os tokens, com os valores do Azul clássico claro', () => {
    const declared = Object.fromEntries(
      declarations(root.body)
        .filter((d) => d.name.startsWith('--'))
        .map((d) => [d.name.slice(2), squash(d.value)]),
    );
    const expected = Object.fromEntries(
      [...TOKEN_NAMES.map((n) => [n, CLASSIC_LIGHT[n]]), ...Object.entries(STATUS_COLORS)].map(([n, v]) => [n, squash(v)]),
    );
    expect(declared).toEqual(expected);
  });

  it('nomes de token são únicos e em kebab-case', () => {
    expect(new Set(TOKEN_NAMES).size).toBe(TOKEN_NAMES.length);
    for (const n of TOKEN_NAMES) expect(n).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('fora do :root não há cor literal (salvo linhas com /* cor-fixa */)', () => {
    const outside = text.slice(0, root.start) + text.slice(root.start, root.end + 1).replace(/[^\n]/g, ' ') + text.slice(root.end + 1);
    const offenders = declarations(outside)
      .filter((d) => LITERAL.test(d.value))
      .filter((d) => {
        for (let l = d.from; l <= d.to; l++) if (fixed.has(l)) return false;
        return true;
      })
      .map((d) => `${d.from}: ${d.name}: ${squash(d.value)}`);
    expect(offenders).toEqual([]);
  });
});
