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

// isBrandFont hoje também marca a família Roboto inteira (era só Noto*/Google Sans* antes);
// mantemos Roboto* pois é uma fonte comum e o catálogo/testes esperam que ela exista.
const families = meta.familyMetadataList.filter(
  (f) =>
    f.subsets.includes('latin') &&
    CATEGORY[f.category] &&
    (!f.isBrandFont || f.family.startsWith('Roboto')) &&
    Object.keys(f.fonts).length,
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
