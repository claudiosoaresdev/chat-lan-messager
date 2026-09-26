// Atualiza o catálogo do Google Fonts (src/shared/google-fonts.json) e as favoritas embutidas (public/fonts).
// Uso: node scripts/update-google-fonts.mjs   (precisa de internet; Node 24 importa o .ts direto)
import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { GOOGLE_USER_AGENT, css2Url, fontSlug, parseFontFaces } from '../src/shared/google-css.ts';

const FAVORITES = 20;
const CATEGORY = { 'Sans Serif': 'sans', Serif: 'serif', Display: 'display', Handwriting: 'handwriting', Monospace: 'mono' };

const res = await fetch('https://fonts.google.com/metadata/fonts');
if (!res.ok) throw new Error(`catálogo: HTTP ${res.status}`);
const meta = JSON.parse((await res.text()).replace(/^\)\]\}'\s*/, ''));

const families = meta.familyMetadataList.filter(
  (f) => f.subsets.includes('latin') && CATEGORY[f.category] && Object.keys(f.fonts).length,
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
// Monta tudo numa pasta temporária e só troca pela definitiva no final, para nunca deixar
// public/fonts pela metade se o script falhar (ou for interrompido) no meio do caminho.
const finalDir = new URL('../public/fonts/', import.meta.url);
const tmpDir = new URL('../public/fonts.tmp/', import.meta.url);
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
const manifest = {};
let total = 0;
for (const name of favorites) {
  const cssRes = await fetch(css2Url(byName.get(name)), { headers: { 'User-Agent': GOOGLE_USER_AGENT } });
  if (!cssRes.ok) throw new Error(`CSS de ${name}: HTTP ${cssRes.status}`);
  const css = await cssRes.text();
  const faces = parseFontFaces(css);
  if (!faces.length) throw new Error(`Nenhuma face válida para a favorita ${name}`);
  const slug = fontSlug(name);
  mkdirSync(new URL(`${slug}/`, tmpDir), { recursive: true });
  const saved = new Map();
  manifest[name] = [];
  for (const face of faces) {
    let file = saved.get(face.src);
    if (!file) {
      const fileRes = await fetch(face.src);
      if (!fileRes.ok) throw new Error(`Arquivo de ${name} (${face.src}): HTTP ${fileRes.status}`);
      file = `${createHash('sha1').update(face.src).digest('hex').slice(0, 16)}.woff2`;
      const data = Buffer.from(await fileRes.arrayBuffer());
      writeFileSync(new URL(`${slug}/${file}`, tmpDir), data);
      saved.set(face.src, file);
      total += data.length;
    }
    manifest[name].push({ weight: face.weight, style: face.style, unicodeRange: face.unicodeRange, file: `${slug}/${file}` });
  }
}
writeFileSync(new URL('manifest.json', tmpDir), JSON.stringify(manifest) + '\n');

rmSync(finalDir, { recursive: true, force: true });
renameSync(tmpDir, finalDir);
console.log(`favoritas embutidas: ${(total / 1024 / 1024).toFixed(1)} MB`);
