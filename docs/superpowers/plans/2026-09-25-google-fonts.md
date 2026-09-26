# Fontes do Google Fonts: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O diálogo "Alterar fonte" oferece todas as fontes latinas do Google Fonts (com busca, favoritas embutidas e pesos), e quem recebe a mensagem vê a mesma fonte.

**Architecture:** Catálogo embutido (`src/shared/google-fonts.json`) + favoritas embutidas (`public/fonts`); o main baixa as demais sob demanda para `userData/fonts` e as serve por `chatfont://`; o renderer registra as faces com a API `FontFace`; `MessageFont` ganha `weight`.

**Tech Stack:** Electron 44 (Forge + Vite), TypeScript (CommonJS, `resolveJsonModule`), vitest, Node 24 (roda `.ts` direto com type stripping).

**Spec:** [docs/superpowers/specs/2026-09-25-google-fonts-design.md](../specs/2026-09-25-google-fonts-design.md)

**Comandos:** `npm test`, `npm run typecheck`, `npm run lint`; um arquivo: `npx vitest run <arquivo>`.

Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. As issues não são fechadas por commit.

**Tipos:** a Task 2 muda `MessageFont.family` para `string` e adiciona `weight`; o renderer (`font.ts`) pode ficar com erro de tipo até a Task 6. Cada task roda só os testes indicados e confere que os arquivos dela compilam.

---

### Task 1: Leitura do CSS do Google, catálogo e favoritas embutidas

**Files:**
- Create: `src/main/google-css.ts`, `src/main/google-css.test.ts`
- Create: `scripts/update-google-fonts.mjs`
- Create (gerados): `src/shared/google-fonts.json`, `public/fonts/manifest.json`, `public/fonts/<slug>/*.woff2`
- Create: `src/shared/google-fonts.ts`, `src/shared/google-fonts.test.ts`

- [ ] **Step 1: Teste do leitor de CSS.** Crie `src/main/google-css.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { css2Url, fontSlug, parseFontFaces, weightsOf } from './google-css';

const CSS = `
/* cyrillic */
@font-face {
  font-family: 'Roboto';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/roboto/v1/cyr.woff2) format('woff2');
  unicode-range: U+0460-052F;
}
/* latin-ext */
@font-face {
  font-family: 'Roboto';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/roboto/v1/ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+1E00-1EFF;
}
/* latin */
@font-face {
  font-family: 'Roboto';
  font-style: italic;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/roboto/v1/lat.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+2000-206F;
}
/* latin */
@font-face {
  font-family: 'Roboto';
  font-style: normal;
  font-weight: 400;
  src: url(https://evil.example/x.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
`;

describe('google-css', () => {
  it('lê só latin e latin-ext, só do fonts.gstatic.com', () => {
    expect(parseFontFaces(CSS)).toEqual([
      { weight: 400, style: 'normal', unicodeRange: 'U+0100-02BA, U+1E00-1EFF', src: 'https://fonts.gstatic.com/s/roboto/v1/ext.woff2' },
      { weight: 700, style: 'italic', unicodeRange: 'U+0000-00FF, U+2000-206F', src: 'https://fonts.gstatic.com/s/roboto/v1/lat.woff2' },
    ]);
  });

  it('bloco sem comentário de subconjunto é aceito (fonte só latina)', () => {
    const css = `@font-face { font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/p/v1/a.woff2) format('woff2'); }`;
    expect(parseFontFaces(css)).toEqual([{ weight: 400, style: 'normal', unicodeRange: '', src: 'https://fonts.gstatic.com/s/p/v1/a.woff2' }]);
  });

  it('pesos pela máscara de bits', () => {
    expect(weightsOf(0b000001000)).toEqual([400]);
    expect(weightsOf(0b101001101)).toEqual([100, 300, 400, 700, 900]);
  });

  it('monta a URL do css2 com itálico e pesos em ordem', () => {
    expect(css2Url(['Open Sans', 'sans', 0b001001000, 1])).toBe(
      'https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap',
    );
    expect(css2Url(['Pacifico', 'handwriting', 0b000001000, 0])).toBe(
      'https://fonts.googleapis.com/css2?family=Pacifico:ital,wght@0,400&display=swap',
    );
  });

  it('slug seguro para pasta', () => {
    expect(fontSlug('Open Sans')).toBe('open-sans');
    expect(fontSlug('M PLUS 1p')).toBe('m-plus-1p');
    expect(fontSlug('../Evil Font')).toBe('evil-font');
  });
});
```

- [ ] **Step 2:** `npx vitest run src/main/google-css.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar** `src/main/google-css.ts` (sem imports de valor: o script de atualização o importa direto pelo Node):

```ts
// CSS do Google Fonts (API css2): monta a URL e lê as @font-face.
// Sem dependências: usado pelo main (FontCache) e por scripts/update-google-fonts.mjs (Node roda .ts direto).

export type FontCategory = 'sans' | 'serif' | 'display' | 'handwriting' | 'mono';
/** [família, categoria, máscara de pesos (bit 0 = 100 … bit 8 = 900), tem itálico] */
export type FontEntry = [family: string, category: FontCategory, weightMask: number, italic: 0 | 1];

export interface FontFaceSource {
  weight: number;
  style: 'normal' | 'italic';
  unicodeRange: string;
  /** https://fonts.gstatic.com/… .woff2 */
  src: string;
}

/** Navegador moderno: o Google só manda woff2 (e com unicode-range) para esses. */
export const GOOGLE_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** Subconjuntos guardados: português e demais línguas latinas. */
const KEEP_SUBSETS = new Set(['latin', 'latin-ext']);

export function weightsOf(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 9; i++) if (mask & (1 << i)) out.push((i + 1) * 100);
  return out;
}

export function fontSlug(family: string): string {
  return family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function css2Url([family, , mask, italic]: FontEntry): string {
  const specs: string[] = [];
  for (const ital of italic ? [0, 1] : [0]) for (const w of weightsOf(mask)) specs.push(`${ital},${w}`);
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:ital,wght@${specs.join(';')}&display=swap`;
}

export function parseFontFaces(css: string): FontFaceSource[] {
  const out: FontFaceSource[] = [];
  const blocks = /(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
  for (const [, subset, body] of css.matchAll(blocks)) {
    if (subset && !KEEP_SUBSETS.has(subset)) continue;
    const weight = Number(/font-weight:\s*(\d{3})\s*;/.exec(body)?.[1]);
    const style = /font-style:\s*italic/.test(body) ? 'italic' : 'normal';
    const src = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[A-Za-z0-9._\/-]+\.woff2)\)/.exec(body)?.[1];
    const unicodeRange = /unicode-range:\s*([U+0-9A-Fa-f?,\s-]+);/.exec(body)?.[1].trim() ?? '';
    if (!src || !(weight >= 100 && weight <= 900)) continue;
    out.push({ weight, style, unicodeRange, src });
  }
  return out;
}
```

- [ ] **Step 4:** `npx vitest run src/main/google-css.test.ts` → PASS.

- [ ] **Step 5: Script de atualização.** Crie `scripts/update-google-fonts.mjs`:

```js
// Atualiza o catálogo do Google Fonts (src/shared/google-fonts.json) e as favoritas embutidas (public/fonts).
// Uso: node scripts/update-google-fonts.mjs   (precisa de internet; Node 24 importa o .ts direto)
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { GOOGLE_USER_AGENT, css2Url, fontSlug, parseFontFaces } from '../src/main/google-css.ts';

const FAVORITES = 20;
const CATEGORY = { 'Sans Serif': 'sans', Serif: 'serif', Display: 'display', Handwriting: 'handwriting', Monospace: 'mono' };

const res = await fetch('https://fonts.google.com/metadata/fonts');
if (!res.ok) throw new Error(`catálogo: HTTP ${res.status}`);
const meta = JSON.parse((await res.text()).replace(/^\)\]\}'\s*/, ''));

const families = meta.familyMetadataList.filter(
  (f) => f.subsets.includes('latin') && CATEGORY[f.category] && !f.isBrandFont && Object.keys(f.fonts).length,
);
const entries = families
  .map((f) => {
    const keys = Object.keys(f.fonts);
    let mask = 0;
    for (const k of keys) {
      const w = parseInt(k, 10);
      if (w >= 100 && w <= 900 && w % 100 === 0) mask |= 1 << (w / 100 - 1);
    }
    return [f.family, CATEGORY[f.category], mask, keys.some((k) => k.endsWith('i')) ? 1 : 0];
  })
  .filter(([, , mask]) => mask)
  .sort((a, b) => a[0].localeCompare(b[0]));
const byName = new Map(entries.map((e) => [e[0], e]));

// Favoritas: as mais populares, com escrita latina como principal (fora Noto Sans JP e afins).
const favorites = [...families]
  .filter((f) => !f.primaryScript || f.primaryScript === 'Latn')
  .sort((a, b) => a.popularity - b.popularity)
  .map((f) => f.family)
  .filter((name) => byName.has(name))
  .slice(0, FAVORITES);

writeFileSync(new URL('../src/shared/google-fonts.json', import.meta.url), JSON.stringify({ favorites, fonts: entries }) + '\n');
console.log(`catálogo: ${entries.length} famílias; favoritas: ${favorites.join(', ')}`);

// Favoritas embutidas: woff2 latin/latin-ext em public/fonts/<slug>/, manifesto único.
const outDir = new URL('../public/fonts/', import.meta.url);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const manifest = {};
let total = 0;
for (const name of favorites) {
  const css = await (await fetch(css2Url(byName.get(name)), { headers: { 'User-Agent': GOOGLE_USER_AGENT } })).text();
  const slug = fontSlug(name);
  mkdirSync(new URL(`${slug}/`, outDir), { recursive: true });
  const saved = new Map();
  manifest[name] = [];
  for (const face of parseFontFaces(css)) {
    let file = saved.get(face.src);
    if (!file) {
      file = `${createHash('sha1').update(face.src).digest('hex').slice(0, 16)}.woff2`;
      const data = Buffer.from(await (await fetch(face.src)).arrayBuffer());
      writeFileSync(new URL(`${slug}/${file}`, outDir), data);
      saved.set(face.src, file);
      total += data.length;
    }
    manifest[name].push({ weight: face.weight, style: face.style, unicodeRange: face.unicodeRange, file: `${slug}/${file}` });
  }
}
writeFileSync(new URL('manifest.json', outDir), JSON.stringify(manifest) + '\n');
console.log(`favoritas embutidas: ${(total / 1024 / 1024).toFixed(1)} MB`);
```

- [ ] **Step 6: Rodar o script.** `node scripts/update-google-fonts.mjs`
Expected: `catálogo: ~1800 famílias; favoritas: Roboto, Open Sans, Inter, …` e `favoritas embutidas: N MB` (esperado entre 3 e 20 MB). Se passar de 25 MB, pare e reporte. Confira `ls public/fonts` (20 pastas + `manifest.json`) e `head -c 300 src/shared/google-fonts.json`.

- [ ] **Step 7: Teste do catálogo.** Crie `src/shared/google-fonts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FAVORITE_FONTS, findGoogleFont, fontWeights, googleFontNames, hasItalic, searchFonts } from './google-fonts';

describe('catálogo do Google Fonts', () => {
  it('tem centenas de famílias e 20 favoritas que existem no catálogo', () => {
    expect(googleFontNames().length).toBeGreaterThan(1000);
    expect(FAVORITE_FONTS).toHaveLength(20);
    for (const name of FAVORITE_FONTS) expect(findGoogleFont(name)).toBeTruthy();
  });

  it('pesos e itálico da família', () => {
    expect(fontWeights('Roboto')).toContain(400);
    expect(fontWeights('Roboto')).toContain(700);
    expect(hasItalic('Roboto')).toBe(true);
    expect(fontWeights('Nao Existe')).toEqual([]);
  });

  it('busca sem diferenciar maiúsculas e acentos, prefixo primeiro', () => {
    const r = searchFonts('ROBO');
    expect(r[0]).toBe('Roboto');
    expect(r.every((n) => n.toLowerCase().includes('robo'))).toBe(true);
    expect(searchFonts('')).toHaveLength(googleFontNames().length);
    expect(searchFonts('ópen sâns')).toContain('Open Sans');
  });
});
```

- [ ] **Step 8:** `npx vitest run src/shared/google-fonts.test.ts` → FAIL.

- [ ] **Step 9: Implementar** `src/shared/google-fonts.ts`:

```ts
// Catálogo do Google Fonts embutido no app (gerado por scripts/update-google-fonts.mjs): lista e busca offline.
import catalog from './google-fonts.json';
import { weightsOf, type FontCategory, type FontEntry } from '../main/google-css';

const entries = catalog.fonts as FontEntry[];
const byName = new Map(entries.map((e) => [e[0], e]));

/** As mais populares do Google (vêm embutidas no app). */
export const FAVORITE_FONTS: readonly string[] = catalog.favorites;

export const findGoogleFont = (family: string): FontEntry | undefined => byName.get(family);
export const googleFontNames = (): string[] => entries.map((e) => e[0]);
export const fontWeights = (family: string): number[] => weightsOf(byName.get(family)?.[2] ?? 0);
export const hasItalic = (family: string): boolean => byName.get(family)?.[3] === 1;
export const fontCategory = (family: string): FontCategory | undefined => byName.get(family)?.[1];

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Nomes que contêm o texto (sem maiúsculas/acentos); os que começam com ele vêm primeiro. */
export function searchFonts(query: string): string[] {
  const q = fold(query);
  const names = googleFontNames();
  if (!q) return names;
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of names) {
    const n = fold(name);
    if (n.startsWith(q)) starts.push(name);
    else if (n.includes(q)) contains.push(name);
  }
  return [...starts, ...contains];
}
```

(`src/shared` importar de `src/main/google-css` é aceitável: o arquivo não tem dependências de Electron nem de Node. Se o lint reclamar de importação cruzada, mova `google-css.ts` para `src/shared/` e ajuste os imports e o script.)

- [ ] **Step 10:** `npx vitest run src/shared/google-fonts.test.ts src/main/google-css.test.ts` → PASS; `npx tsc --noEmit 2>&1 | grep -E "google-(css|fonts)"` → nada.
- [ ] **Step 11: Commit** `src/main/google-css.ts src/main/google-css.test.ts scripts/update-google-fonts.mjs src/shared/google-fonts.json src/shared/google-fonts.ts src/shared/google-fonts.test.ts public/fonts`, mensagem `Fontes: catálogo do Google Fonts e favoritas embutidas`.

---

### Task 2: Fonte da mensagem com família do catálogo e peso

**Files:** Modify `src/shared/protocol.ts`, `src/shared/protocol.test.ts` (e `src/main/config.test.ts` se algum objeto de fonte esperado mudar)

- [ ] **Step 1: Testes.** Em `src/shared/protocol.test.ts`, no teste `'aceita fonte na mensagem e descarta só a fonte inválida'`, o objeto esperado passa a ter `weight: 700` (a fonte de entrada tem `bold: true` e não tem `weight`). Adicione depois dele:

```ts
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
```

Importe `validateFont` no topo do arquivo se ainda não estiver importado.

- [ ] **Step 2:** `npx vitest run src/shared/protocol.test.ts` → FAIL.

- [ ] **Step 3: Implementar** em `src/shared/protocol.ts`:

1. Renomeie `FONT_FAMILIES` para `CLASSIC_FONTS` (mesmo conteúdo) e mantenha `export const FONT_FAMILIES = CLASSIC_FONTS;` como alias. Troque `export type FontFamily = (typeof FONT_FAMILIES)[number];` por `export type ClassicFont = (typeof CLASSIC_FONTS)[number];`.
2. Adicione `import { findGoogleFont } from './google-fonts';` no topo.
3. `MessageFont`:

```ts
/** Fonte das mensagens, como no "Alterar fonte" do MSN. Tamanho em px. */
export interface MessageFont {
  /** Clássica (CLASSIC_FONTS) ou família do catálogo do Google Fonts. */
  family: string;
  size: number;
  /** 100–900. `bold` acompanha (peso ≥ 600) para versões antigas, que só conhecem negrito. */
  weight: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** #rrggbb */
  color: string;
}
```

4. `DEFAULT_FONT` ganha `weight: 400`.
5. Adicione e troque `validateFont`:

```ts
export const isKnownFont = (family: string) =>
  (CLASSIC_FONTS as readonly string[]).includes(family) || !!findGoogleFont(family);

/** Valida a fonte; qualquer campo fora do permitido invalida a fonte inteira. */
export function validateFont(v: unknown): MessageFont | null {
  if (!isObject(v)) return null;
  if (typeof v.family !== 'string' || !isKnownFont(v.family)) return null;
  if (typeof v.size !== 'number' || !Number.isInteger(v.size) || v.size < MIN_FONT_SIZE || v.size > MAX_FONT_SIZE) return null;
  if (typeof v.bold !== 'boolean' || typeof v.italic !== 'boolean' || typeof v.underline !== 'boolean') return null;
  if (typeof v.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v.color)) return null;
  // Versões antigas não mandam peso: deduz do negrito.
  const weight = v.weight === undefined ? (v.bold ? 700 : 400) : v.weight;
  if (typeof weight !== 'number' || !Number.isInteger(weight) || weight < 100 || weight > 900 || weight % 100 !== 0) return null;
  return {
    family: v.family,
    size: v.size,
    weight,
    bold: weight >= 600,
    italic: v.italic,
    underline: v.underline,
    color: v.color.toLowerCase(),
  };
}
```

- [ ] **Step 4:** `npx vitest run src/shared src/main` → PASS. Se `src/main/config.test.ts` falhar só porque a fonte carregada agora tem `weight`, acrescente `weight` ao objeto esperado (ex.: `weight: 400`), sem mudar a intenção.
- [ ] **Step 5:** `npx tsc --noEmit 2>&1 | grep -v "src/renderer"` → nada (erros em `src/renderer/font.ts` ficam para a Task 6).
- [ ] **Step 6: Commit** `src/shared/protocol.ts src/shared/protocol.test.ts` (+ `src/main/config.test.ts` se mudou), mensagem `Protocolo: fonte do Google Fonts e peso da letra`.

---

### Task 3: Cache de fontes no main

**Files:** Create `src/main/font-cache.ts`, `src/main/font-cache.test.ts`

- [ ] **Step 1: Teste.** Crie `src/main/font-cache.test.ts`:

```ts
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
```

- [ ] **Step 2:** `npx vitest run src/main/font-cache.test.ts` → FAIL.

- [ ] **Step 3: Implementar** `src/main/font-cache.ts`:

```ts
// Fontes do Google Fonts no disco: favoritas embutidas no app, as demais baixadas uma vez e guardadas.
// Só baixa famílias do catálogo, só de fonts.googleapis.com / fonts.gstatic.com, com limite de tamanho.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { findGoogleFont } from '../shared/google-fonts';
import { GOOGLE_USER_AGENT, css2Url, fontSlug, parseFontFaces } from './google-css';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_FAMILY_BYTES = 12 * 1024 * 1024;

export interface FontFaceFile {
  weight: number;
  style: 'normal' | 'italic';
  unicodeRange: string;
  /** Relativo à pasta de fontes (favoritas: public/fonts; baixadas: <slug>/<arquivo>). */
  file: string;
}

/** Face pronta para o renderer registrar com a API FontFace. */
export interface FontFaceInfo {
  weight: number;
  style: 'normal' | 'italic';
  unicodeRange: string;
  url: string;
}

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

const FILE_NAME = /^[0-9a-f]{16}\.woff2$/;

export class FontCache {
  private readonly inFlight = new Map<string, Promise<FontFaceInfo[]>>();

  constructor(
    /** userData/fonts */
    private readonly dir: string,
    /** public/fonts/manifest.json das favoritas embutidas */
    private readonly bundled: Record<string, FontFaceFile[]>,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  ensure(family: string): Promise<FontFaceInfo[]> {
    const embedded = this.bundled[family];
    if (embedded) return Promise.resolve(embedded.map((f) => toInfo(f, `fonts/${f.file}`)));
    const running = this.inFlight.get(family);
    if (running) return running;
    const job = this.load(family).finally(() => this.inFlight.delete(family));
    this.inFlight.set(family, job);
    return job;
  }

  /** chatfont://cache/<slug>/<arquivo>.woff2 → caminho no disco, ou null se sair da pasta. */
  resolveFile(url: string): string | null {
    const m = /^chatfont:\/\/cache\/([a-z0-9-]+)\/([^/]+)$/.exec(url);
    if (!m || !FILE_NAME.test(m[2])) return null;
    const file = path.join(this.dir, m[1], m[2]);
    return file.startsWith(this.dir + path.sep) ? file : null;
  }

  private async load(family: string): Promise<FontFaceInfo[]> {
    const entry = findGoogleFont(family);
    if (!entry) throw new Error(`Fonte desconhecida: ${family}`);
    const slug = fontSlug(family);
    const folder = path.join(this.dir, slug);
    const manifestFile = path.join(folder, 'manifest.json');
    const urlOf = (f: FontFaceFile) => `chatfont://cache/${f.file}`;

    try {
      const saved = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as FontFaceFile[];
      if (Array.isArray(saved) && saved.length) return saved.map((f) => toInfo(f, urlOf(f)));
    } catch {
      // ainda não baixada
    }

    const cssRes = await this.fetchImpl(css2Url(entry), { headers: { 'User-Agent': GOOGLE_USER_AGENT } });
    if (!cssRes.ok) throw new Error(`Google Fonts respondeu ${cssRes.status}`);
    const faces = parseFontFaces(await cssRes.text());
    if (!faces.length) throw new Error(`Nenhuma face válida para ${family}`);

    fs.mkdirSync(folder, { recursive: true });
    const files = new Map<string, string>();
    let total = 0;
    const manifest: FontFaceFile[] = [];
    for (const face of faces) {
      let name = files.get(face.src);
      if (!name) {
        const res = await this.fetchImpl(face.src);
        if (!res.ok) throw new Error(`Download da fonte falhou (${res.status})`);
        const data = Buffer.from(await res.arrayBuffer());
        if (data.length > MAX_FILE_BYTES) throw new Error('Arquivo de fonte grande demais');
        total += data.length;
        if (total > MAX_FAMILY_BYTES) throw new Error('Família de fonte grande demais');
        name = `${createHash('sha1').update(face.src).digest('hex').slice(0, 16)}.woff2`;
        fs.writeFileSync(path.join(folder, name), data);
        files.set(face.src, name);
      }
      manifest.push({ weight: face.weight, style: face.style, unicodeRange: face.unicodeRange, file: `${slug}/${name}` });
    }
    // Manifesto por último: só existe quando todos os arquivos já estão no disco.
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    return manifest.map((f) => toInfo(f, urlOf(f)));
  }
}

function toInfo(f: FontFaceFile, url: string): FontFaceInfo {
  return { weight: f.weight, style: f.style, unicodeRange: f.unicodeRange, url };
}
```

Nota para o teste: `'Lobster'` precisa existir no catálogo gerado na Task 1 (é uma família popular do Google). Se não existir, troque no teste por outra família do catálogo que não seja favorita.

- [ ] **Step 4:** `npx vitest run src/main/font-cache.test.ts` → PASS; `npx tsc --noEmit 2>&1 | grep font-cache` → nada.
- [ ] **Step 5: Commit** `src/main/font-cache.ts src/main/font-cache.test.ts`, mensagem `Fontes: cache em disco com download do Google Fonts`.

---

### Task 4: Main, protocolo chatfont, IPC e CSP

**Files:** Modify `src/main.ts`, `src/shared/api.ts`, `src/preload.ts`, `index.html`

- [ ] **Step 1: API.** Em `src/shared/api.ts`, adicione antes da interface `ChatApi`:

```ts
/** Face de uma fonte do Google pronta para registrar com FontFace. */
export interface FontFaceInfo {
  weight: number;
  style: 'normal' | 'italic';
  unicodeRange: string;
  url: string;
}
```

No bloco `// fonte das mensagens` da `ChatApi`, adicione:

```ts
  /** Garante que a fonte do Google está no disco (baixa se preciso) e devolve as faces. */
  ensureFont(family: string): Promise<FontFaceInfo[]>;
```

No `IPC`, depois de `setFont: 'font:set',`: `ensureFont: 'font:ensure',`.

Em `src/preload.ts`, depois de `setFont: ...`: `ensureFont: (family) => call(IPC.ensureFont, family),`.

(Em `src/main/font-cache.ts`, troque a interface local `FontFaceInfo` por `import type { FontFaceInfo } from '../shared/api';` e reexporte se o teste importar dali.)

- [ ] **Step 2: Main.** Em `src/main.ts`:

1. Imports: adicione `net` e `protocol` ao import do `electron`; `import { FontCache, type FontFaceFile } from './main/font-cache';`; `import { pathToFileURL } from 'node:url';` e `import fs from 'node:fs';` se ainda não houver.
2. Logo depois do bloco `if (started) { app.quit(); }`:

```ts
// Fontes baixadas do Google Fonts ficam no disco e chegam à página por este protocolo.
protocol.registerSchemesAsPrivileged([
  { scheme: 'chatfont', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);
let fonts: FontCache;
```

3. Em `registerIpc()`, depois de `handle(IPC.setFont, ...)`:

```ts
  handle(IPC.ensureFont, (family: unknown) => {
    if (typeof family !== 'string' || family.length > 80) throw new Error('Fonte inválida');
    return fonts.ensure(family);
  });
```

4. Em `app.on('ready', ...)`, antes de `registerIpc();`:

```ts
  const publicDir = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? path.join(app.getAppPath(), 'public')
    : path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);
  let bundledFonts: Record<string, FontFaceFile[]> = {};
  try {
    bundledFonts = JSON.parse(fs.readFileSync(path.join(publicDir, 'fonts', 'manifest.json'), 'utf8'));
  } catch {
    // sem favoritas embutidas: todas vêm do download
  }
  fonts = new FontCache(path.join(app.getPath('userData'), 'fonts'), bundledFonts, (url, init) => net.fetch(url, init));
  protocol.handle('chatfont', (req) => {
    const file = fonts.resolveFile(req.url);
    return file ? net.fetch(pathToFileURL(file).toString()) : new Response('', { status: 404 });
  });
```

(Se a variável `builtinAvatars` já calcula o mesmo diretório público, reaproveite a lógica em vez de duplicar.)

- [ ] **Step 3: CSP.** Em `index.html`, na meta `Content-Security-Policy`, acrescente `font-src 'self' chatfont:;` (antes de `connect-src`).

- [ ] **Step 4:** `npx tsc --noEmit 2>&1 | grep -E "src/main|src/preload|src/shared"` → nada; `npx vitest run src/main src/shared` → PASS; `npm run lint` sem erros nesses arquivos.
- [ ] **Step 5: Commit** `src/main.ts src/shared/api.ts src/preload.ts src/main/font-cache.ts index.html`, mensagem `Main: fontes do Google pelo protocolo chatfont`.

---

### Task 5: Carregar fontes no renderer

**Files:** Create `src/renderer/font-loader.ts`, `src/renderer/font-loader.test.ts`; Modify `src/renderer/font.ts` (só `applyFont` e `FONT_STACKS`)

- [ ] **Step 1: Teste da pilha de fallback** (`src/renderer/font-loader.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { fontStack } from './font-loader';

describe('fontStack', () => {
  it('clássica usa a pilha do sistema', () => {
    expect(fontStack('Verdana')).toBe('Verdana, Geneva, sans-serif');
  });
  it('Google usa a própria família e um genérico da categoria', () => {
    expect(fontStack('Roboto')).toBe("'Roboto', 'Segoe UI', sans-serif");
    expect(fontStack('Merriweather')).toBe("'Merriweather', Georgia, serif");
    expect(fontStack('Dancing Script')).toBe("'Dancing Script', 'Comic Sans MS', cursive");
    expect(fontStack('Roboto Mono')).toBe("'Roboto Mono', 'Courier New', monospace");
  });
  it('desconhecida cai na padrão', () => {
    expect(fontStack('X')).toBe("'Segoe UI', Tahoma, 'Helvetica Neue', sans-serif");
  });
});
```

(Confirme que `Merriweather`, `Dancing Script` e `Roboto Mono` estão no catálogo com essas categorias; se alguma não estiver, troque por outra da mesma categoria.)

- [ ] **Step 2:** `npx vitest run src/renderer/font-loader.test.ts` → FAIL.

- [ ] **Step 3: Implementar** `src/renderer/font-loader.ts`, movendo `FONT_STACKS` de `font.ts` para cá:

```ts
// Pilhas de fonte e carregamento das fontes do Google Fonts (baixadas pelo main, registradas com FontFace).
import type { FontCategory } from '../main/google-css';
import { fontCategory } from '../shared/google-fonts';
import type { ClassicFont } from '../shared/protocol';

/** Pilhas de fallback, para a fonte ter equivalente parecido no Mac e no Windows. */
export const FONT_STACKS: Record<ClassicFont, string> = {
  'Segoe UI': "'Segoe UI', Tahoma, 'Helvetica Neue', sans-serif",
  Arial: 'Arial, Helvetica, sans-serif',
  Calibri: "Calibri, Carlito, 'Helvetica Neue', sans-serif",
  'Comic Sans MS': "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', cursive",
  'Courier New': "'Courier New', Courier, monospace",
  Georgia: 'Georgia, serif',
  Impact: "Impact, 'Arial Black', sans-serif",
  'Lucida Console': "'Lucida Console', Monaco, Menlo, monospace",
  Tahoma: 'Tahoma, Verdana, sans-serif',
  'Times New Roman': "'Times New Roman', Times, serif",
  'Trebuchet MS': "'Trebuchet MS', 'Lucida Grande', sans-serif",
  Verdana: 'Verdana, Geneva, sans-serif',
};

/** Enquanto a fonte do Google não carrega (ou sem internet): parecida da mesma categoria. */
const GENERIC: Record<FontCategory, string> = {
  sans: "'Segoe UI', sans-serif",
  display: "'Segoe UI', sans-serif",
  serif: 'Georgia, serif',
  handwriting: "'Comic Sans MS', cursive",
  mono: "'Courier New', monospace",
};

export function fontStack(family: string): string {
  const classic = FONT_STACKS[family as ClassicFont];
  if (classic) return classic;
  const category = fontCategory(family);
  return category ? `'${family.replace(/'/g, '')}', ${GENERIC[category]}` : FONT_STACKS['Segoe UI'];
}

export type FontLoadState = 'ready' | 'loading' | 'offline';
const loads = new Map<string, Promise<FontLoadState>>();

/** Registra a família do Google (uma vez). Resolve 'offline' se não deu para baixar. */
export function ensureFontLoaded(family: string): Promise<FontLoadState> {
  if (FONT_STACKS[family as ClassicFont] || !fontCategory(family)) return Promise.resolve('ready');
  let job = loads.get(family);
  if (!job) {
    job = window.chat
      .ensureFont(family)
      .then((faces) => {
        for (const f of faces) {
          const face = new FontFace(family, `url("${f.url}")`, {
            weight: String(f.weight),
            style: f.style,
            ...(f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}),
          });
          document.fonts.add(face);
        }
        return 'ready' as const;
      })
      .catch((err) => {
        console.warn('[fontes]', family, err instanceof Error ? err.message : err);
        loads.delete(family); // tenta de novo na próxima vez (ex.: voltou a internet)
        return 'offline' as const;
      });
    loads.set(family, job);
  }
  return job;
}
```

(As faces registradas com `document.fonts.add` são baixadas pelo navegador sob demanda, quando o texto usa aquele peso/estilo.)

- [ ] **Step 4: `applyFont`** em `src/renderer/font.ts`: remova o `FONT_STACKS` local e importe `{ FONT_STACKS, ensureFontLoaded, fontStack }` de `./font-loader`. Troque `applyFont` por:

```ts
/** Aplica a fonte num elemento (mensagem, caixa de texto, exemplo). */
export function applyFont(node: HTMLElement, font: MessageFont | undefined) {
  if (!font) return;
  node.style.fontFamily = fontStack(font.family);
  node.style.fontSize = `${font.size}px`;
  node.style.fontWeight = String(font.weight ?? (font.bold ? 700 : 400));
  node.style.fontStyle = font.italic ? 'italic' : 'normal';
  node.style.textDecoration = font.underline ? 'underline' : 'none';
  node.style.color = readableColor(font.color);
  // Fonte do Google: registra e o texto troca sozinho quando ela carregar.
  void ensureFontLoaded(font.family);
}
```

Não mexa no diálogo ainda (Task 6); os usos de `FONT_FAMILIES`/`FontFamily` no diálogo podem continuar com erro de tipo até lá.

- [ ] **Step 5:** `npx vitest run src/renderer` → PASS.
- [ ] **Step 6: Commit** `src/renderer/font-loader.ts src/renderer/font-loader.test.ts src/renderer/font.ts`, mensagem `Renderer: carrega fontes do Google e aplica peso`.

---

### Task 6: Diálogo "Alterar fonte" com busca, seções, peso e itálico

**Files:** Modify `src/renderer/font.ts`, `index.html` (diálogo `#font-dialog`), `src/index.css` (regras `.font-*`)

Requisitos (implemente seguindo o estilo existente de `font.ts`, com `el()`/`listItem()`):

- [ ] **Step 1: HTML.** Em `#font-dialog`:
  - Na coluna da família, entre `#font-family-current` e a lista, adicione `<input type="search" class="font-search" id="font-search" placeholder="Buscar fonte…" aria-label="Buscar fonte" />`.
  - A coluna do meio passa a ser **"Peso:"** (`id="font-weight-label"`, `#font-weight-current`, `<ul id="font-weight-list" …>`), com, abaixo da lista, `<label class="check"><input type="checkbox" id="font-italic" /><span>Itálico</span></label>`.
  - Em `.font-bottom`, dentro de "Exemplo", adicione `<p class="font-status" id="font-status" role="status"></p>` abaixo de `#font-sample`.
  - A coluna da família fica mais larga (a lista tem nomes longos). Ajuste `.font-col-family` e o tamanho do diálogo no CSS; a lista de famílias deve rolar com altura fixa (~220px).

- [ ] **Step 2: Lista de famílias com seções e busca** (`renderFamilies()`):
  - Sem busca: cabeçalho `★ Favoritas` + `FAVORITE_FONTS`; cabeçalho `Clássicas do sistema` + `CLASSIC_FONTS`; cabeçalho `Google Fonts` + todos os nomes do catálogo **exceto** as favoritas.
  - Com busca: sem cabeçalhos; clássicas que casam com o texto (mesma regra de acentos/maiúsculas de `searchFonts`) seguidas de `searchFonts(texto)`. Nenhum resultado: um item desativado "Nenhuma fonte encontrada".
  - Cabeçalhos: `<li class="font-section" role="presentation">`, não selecionáveis e ignorados pelas setas do teclado.
  - Favoritas e clássicas aparecem **na própria fonte** (`li.style.fontFamily = fontStack(nome)`, e para favoritas chame `ensureFontLoaded`, que não usa rede). As ~1.800 do Google aparecem na fonte da interface (não baixar fontes só para mostrar a lista).
  - Para não pesar, renderize no máximo 400 itens do Google por vez com um item final "Refine a busca para ver mais…" quando houver mais; a família selecionada sempre aparece na lista (adicione-a se estiver fora do recorte).
  - A busca filtra a cada `input` e mantém o item selecionado visível. Enter na busca escolhe o primeiro resultado. `ArrowDown` na busca move o foco para a lista.

- [ ] **Step 3: Peso e itálico.**
  - `WEIGHT_NAMES = {100:'Fina',200:'Extraleve',300:'Leve',400:'Normal',500:'Média',600:'Seminegrito',700:'Negrito',800:'Extranegrito',900:'Preta'}`; rótulo `"${nome} ${peso}"` (ex.: "Negrito 700").
  - Pesos disponíveis: clássicas → `[400, 700]`; Google → `fontWeights(família)`.
  - Itálico: clássicas → sempre disponível; Google → `hasItalic(família)`; checkbox desativada quando não há itálico.
  - Ao trocar de família: se o peso atual não existe nela, usa o disponível mais próximo; se ela não tem itálico, `italic = false`.
  - Cada item de peso aparece com aquele peso (`li.style.fontWeight`) na família escolhida.
  - O rascunho guarda `weight` e mantém `bold = weight >= 600`.
  - `#font-weight-current` mostra o rótulo do peso atual; setas do teclado funcionam como nas outras listas.

- [ ] **Step 4: Estado do download.** Ao escolher uma família do Google (e ao abrir o diálogo com uma já escolhida): `#font-status` mostra "Baixando fonte…" enquanto `ensureFontLoaded` não resolve; depois limpa ('ready') ou mostra "Sem internet: a fonte vai aparecer parecida até conseguir baixar." ('offline'). Favoritas e clássicas não mostram nada. Ignore resultados de uma família que não é mais a selecionada.

- [ ] **Step 5: "Padrão"** restaura `DEFAULT_FONT` (com `weight: 400`) e limpa a busca.

- [ ] **Step 6: CSS.** Estilo de `.font-search` (igual aos campos do app), `.font-section` (texto pequeno, cinza, negrito, fundo levemente azul, fixo no topo ao rolar com `position: sticky; top: 0`), `.font-status` (texto pequeno, cinza). Mantenha o visual do diálogo MSN.

- [ ] **Step 7: Checks.** `npm run typecheck && npm run lint && npm test` → tudo passa. Build do renderer: `npx vite build -c vite.renderer.config.ts --outDir <scratchpad>/rbuild-fonts`.
- [ ] **Step 8: Commit** `src/renderer/font.ts index.html src/index.css`, mensagem `Alterar fonte: busca, favoritas, Google Fonts, peso e itálico`.

---

### Task 7: Verificação manual e README

- [ ] **Step 1:** `npm run package`; duas instâncias isoladas (`--user-data-dir` separados, portas 47811/47812, `--remote-debugging-port` 9231/9232), logadas como "Teste A" e "Teste B"; conversa aberta A↔B.
- [ ] **Step 2: Roteiro.**
  1. Diálogo abre com as seções ★ Favoritas / Clássicas / Google Fonts; busca "lobs" mostra Lobster; busca sem resultado mostra o aviso.
  2. Escolher uma **favorita** (ex.: Montserrat) com peso 300 e itálico: exemplo muda; A envia; B vê a mensagem em Montserrat 300 itálico (fonte carregada: `document.fonts.check('italic 300 16px Montserrat')` true na janela de B).
  3. Escolher uma **não favorita** (ex.: Lobster): status "Baixando fonte…" e depois some; arquivos aparecem em `<userData>/fonts/lobster/`; B recebe e baixa também.
  4. Peso indisponível: trocar para uma família só com 400 ajusta o peso e desativa "Itálico" se ela não tiver.
  5. Fonte clássica continua funcionando (Comic Sans MS negrito).
  6. Reabrir o app: a fonte escolhida continua (settings) e a não favorita não baixa de novo.
- [ ] **Step 3: README.** Na seção de uso, descreva: busca de fontes, favoritas que funcionam sem internet, demais fontes baixadas do Google na primeira vez (precisa de internet dos dois lados; sem internet aparece parecida), peso e itálico. Mencione `node scripts/update-google-fonts.mjs` para atualizar o catálogo.
- [ ] **Step 4: Commit** `README.md`, mensagem `README: fontes do Google Fonts`.
