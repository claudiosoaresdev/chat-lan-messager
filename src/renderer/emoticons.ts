// Emoticons: desenhos próprios no clima do MSN (não são as imagens originais),
// inseridos como <svg><use/></svg>. O texto da rede nunca vira HTML: só nós de texto e ícones.
import { EMOTICONS, tokenizeRich } from './emoticon-codes';
import { el } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Peças reaproveitadas nas carinhas.
const face = (fill = 'emo-face', stroke = '#c28a00') =>
  `<circle cx="8" cy="8" r="7.2" fill="url(#${fill})" stroke="${stroke}" stroke-width=".8"/><ellipse cx="6" cy="4.3" rx="3" ry="1.5" fill="#fff" opacity=".55"/>`;
const eyes = '<ellipse cx="5.6" cy="6.6" rx=".9" ry="1.3" fill="#3b2a00"/><ellipse cx="10.4" cy="6.6" rx=".9" ry="1.3" fill="#3b2a00"/>';
const line = (d: string, color = '#3b2a00', w = 0.9) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const smile = line('M4.8 9.6q3.2 3 6.4 0');

/** Conteúdo de cada <symbol> (viewBox 0 0 16 16). Strings fixas do próprio app. */
const DRAWINGS: Record<string, string> = {
  sorriso: face() + eyes + smile,
  gargalhada: face() + eyes + '<path d="M4.3 9h7.4q-.4 3.8-3.7 3.8T4.3 9z" fill="#7a1f00"/><path d="M4.9 9.1h6.2v1.1H4.9z" fill="#fff"/>',
  piscada: face() + line('M4.6 6.8q1-1 2 0') + '<ellipse cx="10.4" cy="6.6" rx=".9" ry="1.3" fill="#3b2a00"/>' + smile,
  surpreso: face() + '<circle cx="5.6" cy="6.4" r="1.2" fill="#3b2a00"/><circle cx="10.4" cy="6.4" r="1.2" fill="#3b2a00"/><ellipse cx="8" cy="11" rx="1.6" ry="1.9" fill="#7a1f00"/>',
  lingua: face() + eyes + line('M4.8 9.8h6.4') + '<path d="M6.9 9.8h3.1v1.5a1.55 1.55 0 0 1-3.1 0z" fill="#e8505b" stroke="#a3202b" stroke-width=".4"/>',
  oculos: face() + '<path d="M2.8 5.8h10.4v1.1l-1.1 2.4H9.4L8.5 7.2h-1l-.9 2.1H3.9L2.8 6.9z" fill="#1d1d1d"/><path d="M4 6.4h1.6" stroke="#fff" stroke-width=".5" opacity=".7"/>' + smile,
  bravo: face('emo-angry', '#9e2a12') + line('M4.1 5l2.7 1.3M11.9 5L9.2 6.3') + eyes + line('M5.2 11.6q2.8-2.2 5.6 0'),
  envergonhado: face() + '<ellipse cx="4.6" cy="9.2" rx="1.5" ry=".9" fill="#f07b7b" opacity=".8"/><ellipse cx="11.4" cy="9.2" rx="1.5" ry=".9" fill="#f07b7b" opacity=".8"/>' + eyes + line('M6.2 10.8q1.8 1 3.6 0'),
  confuso: face() + eyes + line('M4.7 10.8q.8-1 1.6 0t1.6 0 1.6 0 1.6 0'),
  triste: face() + eyes + line('M5 11.6q3-2.6 6 0'),
  chorando: face() + line('M4.6 6.5q1 .9 2 0M9.4 6.5q1 .9 2 0') + line('M5.2 11.8q2.8-2.2 5.6 0') + '<path d="M4.4 7.6q-.9 1.6 0 2.2.9-.6 0-2.2zM11.6 7.6q-.9 1.6 0 2.2.9-.6 0-2.2z" fill="#4fb3ff"/>',
  'sem-palavras': face() + eyes + line('M5 10.4h6'),
  nerd: face() + '<circle cx="5.4" cy="6.7" r="2" fill="#fff" stroke="#3b2a00" stroke-width=".8"/><circle cx="10.6" cy="6.7" r="2" fill="#fff" stroke="#3b2a00" stroke-width=".8"/><path d="M7.4 6.6h1.2" stroke="#3b2a00" stroke-width=".8"/><circle cx="5.6" cy="6.9" r=".8" fill="#3b2a00"/><circle cx="10.4" cy="6.9" r=".8" fill="#3b2a00"/><path d="M5.4 10.2h5.2q-.3 2-2.6 2t-2.6-2z" fill="#7a1f00"/><path d="M7 10.2h2v1H7z" fill="#fff"/>',
  sonolento: face() + line('M4.6 6.8h2M9.4 6.8h2') + '<ellipse cx="8" cy="11" rx="1" ry=".8" fill="#7a1f00"/>' + line('M11 1.6h2.4l-2.4 2.4h2.4', '#4a6fa5', 0.8),
  anjo: face() + eyes + smile + '<ellipse cx="8" cy="1.6" rx="4.4" ry="1.2" fill="none" stroke="#f5c400" stroke-width="1.1"/>',
  diabinho: '<path d="M2.6 4.2L2 .6l3.2 2.2zM13.4 4.2L14 .6l-3.2 2.2z" fill="#6b2d8f"/>' + face('emo-devil', '#4a1d66') + line('M4.4 5.2l2.4 1.1M11.6 5.2L9.2 6.3', '#2a0f3a') + '<ellipse cx="5.8" cy="7" rx=".8" ry="1" fill="#2a0f3a"/><ellipse cx="10.2" cy="7" rx=".8" ry="1" fill="#2a0f3a"/>' + line('M4.8 9.6q3.2 3 6.4 0', '#2a0f3a'),
  coracao: '<path d="M8 14.2C3 10.6 1.2 8.2 1.2 5.6A3.3 3.3 0 0 1 8 4a3.3 3.3 0 0 1 6.8 1.6c0 2.6-1.8 5-6.8 8.6z" fill="url(#emo-heart)" stroke="#9e1020" stroke-width=".7"/><ellipse cx="4.6" cy="5" rx="1.6" ry="1" fill="#fff" opacity=".6"/>',
  'coracao-partido': '<path d="M7.4 13.8C2.8 10.4 1 8 1 5.6A3.2 3.2 0 0 1 7.4 4.1L6.4 7l1.5 1.4-1.2 2.2z" fill="url(#emo-heart)" stroke="#9e1020" stroke-width=".7"/><path d="M8.8 13.8c4.6-3.4 6.4-5.8 6.4-8.2a3.2 3.2 0 0 0-6.2-1.5L8 7l1.5 1.4-1.1 2.3z" fill="url(#emo-heart)" stroke="#9e1020" stroke-width=".7"/>',
  joinha: '<path d="M6.4 7.2l1.7-4.5c.3-.9 1.9-.8 1.9.4v3.2h3a1.3 1.3 0 0 1 1.3 1.5l-.8 4.8a1.4 1.4 0 0 1-1.4 1.1H6.4z" fill="url(#emo-face)" stroke="#c28a00" stroke-width=".7"/><rect x="2.2" y="6.8" width="3.4" height="7.6" rx=".7" fill="#2e7fe0" stroke="#1c5ec2" stroke-width=".6"/>',
  negativo: '<g transform="rotate(180 8 8)"><path d="M6.4 7.2l1.7-4.5c.3-.9 1.9-.8 1.9.4v3.2h3a1.3 1.3 0 0 1 1.3 1.5l-.8 4.8a1.4 1.4 0 0 1-1.4 1.1H6.4z" fill="url(#emo-face)" stroke="#c28a00" stroke-width=".7"/><rect x="2.2" y="6.8" width="3.4" height="7.6" rx=".7" fill="#2e7fe0" stroke="#1c5ec2" stroke-width=".6"/></g>',
  beijo: '<path d="M1.4 8.2c1.6-2.8 3.6-4 5-3.2.6.3 1 .3 1.6 0 .6-.3 1-.3 1.6 0 1.4-.8 3.4.4 5 3.2-2.2 3-4.4 4.2-6.6 4.2S3.6 11.2 1.4 8.2z" fill="#e0243c" stroke="#8e0f1f" stroke-width=".6"/><path d="M2.4 8.2q5.6 1.6 11.2 0" fill="none" stroke="#8e0f1f" stroke-width=".6"/><ellipse cx="6" cy="6.4" rx="1.4" ry=".6" fill="#fff" opacity=".6"/>',
  rosa: '<path d="M8 8.6V15" stroke="#3f8f2a" stroke-width="1.1"/><path d="M8 12.4c-2-.2-3-1.4-3-2.4 1.6 0 2.6.8 3 2.4z" fill="#57b23a"/><circle cx="8" cy="5.4" r="4.2" fill="#e0243c" stroke="#8e0f1f" stroke-width=".6"/><path d="M6 5.2q2-2.2 4 0M5.4 6.6q2.6 1.6 5.2 0M7 3.8q1.4 1 2.4-.2" fill="none" stroke="#8e0f1f" stroke-width=".6"/>',
  estrela: '<path d="M8 .9l2.1 4.5 4.9.6-3.6 3.4.9 4.9L8 12l-4.3 2.3.9-4.9L1 6l4.9-.6z" fill="url(#emo-star)" stroke="#c28a00" stroke-width=".7" stroke-linejoin="round"/>',
  sol: '<g stroke="#f29900" stroke-width="1.2" stroke-linecap="round"><path d="M8 .8v2M8 13.2v2M.8 8h2M13.2 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M2.9 13.1l1.4-1.4M11.7 4.3l1.4-1.4"/></g><circle cx="8" cy="8" r="4.2" fill="url(#emo-star)" stroke="#e08a00" stroke-width=".6"/>',
  lua: '<path d="M10.8 1.6A6.6 6.6 0 1 0 14.4 11 5.4 5.4 0 0 1 10.8 1.6z" fill="url(#emo-star)" stroke="#c28a00" stroke-width=".7"/><circle cx="6" cy="7" r=".8" fill="#e0b000"/><circle cx="7.6" cy="10.6" r=".6" fill="#e0b000"/>',
  'arco-iris': '<g fill="none" stroke-width="1.3"><path d="M1 13a7 7 0 0 1 14 0" stroke="#e53935"/><path d="M2.4 13a5.6 5.6 0 0 1 11.2 0" stroke="#fb8c00"/><path d="M3.8 13a4.2 4.2 0 0 1 8.4 0" stroke="#fdd835"/><path d="M5.2 13a2.8 2.8 0 0 1 5.6 0" stroke="#43a047"/><path d="M6.6 13a1.4 1.4 0 0 1 2.8 0" stroke="#1e88e5"/></g>',
  cafe: '<path d="M2.6 6h9l-.9 6.4a1.6 1.6 0 0 1-1.6 1.4H5.1a1.6 1.6 0 0 1-1.6-1.4z" fill="#fff" stroke="#6d4c2f" stroke-width=".8"/><path d="M11.4 7.2c2.4-.4 2.8 3 .1 3.4" fill="none" stroke="#6d4c2f" stroke-width=".9"/><ellipse cx="7.1" cy="6.2" rx="4.4" ry=".9" fill="#6d3f1c"/>' + line('M5.6 4.2q-.8-1 0-2M8.4 4.2q-.8-1 0-2', '#9aa3ad', 0.7),
  cerveja: '<path d="M3 4.6h7.2v9a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 13.6z" fill="url(#emo-beer)" stroke="#8a5a00" stroke-width=".7"/><path d="M10.2 6.4h1.3a1.6 1.6 0 0 1 1.6 1.6v2.4a1.6 1.6 0 0 1-1.6 1.6h-1.3" fill="none" stroke="#8a5a00" stroke-width=".9"/><path d="M2.6 5c-.6-1.8 1-3 2.4-2.4.8-1.2 3-1.2 3.6 0 1.4-.4 2.6.8 2 2.4z" fill="#fff" stroke="#c9c2b0" stroke-width=".5"/>',
  bolo: '<path d="M2.2 9.2L8 6.4l5.8 2.8v4.4L8 15l-5.8-1.4z" fill="#f7c9a8" stroke="#a0633a" stroke-width=".6"/><path d="M2.2 9.2L8 6.4l5.8 2.8L8 10.8z" fill="#fff4f8" stroke="#d98ba6" stroke-width=".6"/><path d="M2.2 11.4l5.8 1.4 5.8-1.4" fill="none" stroke="#e05a8a" stroke-width=".9"/><rect x="7.4" y="2.8" width="1.2" height="4" fill="#4fb3ff"/><path d="M8 .6c-.9 1-.7 1.8 0 2.2.7-.4.9-1.2 0-2.2z" fill="#ffb300"/>',
  presente: '<rect x="2" y="6.4" width="12" height="8" rx=".6" fill="#e53935" stroke="#9e1c1a" stroke-width=".6"/><rect x="1.4" y="4.6" width="13.2" height="2.4" rx=".5" fill="#ef5350" stroke="#9e1c1a" stroke-width=".6"/><path d="M7 4.6h2v9.8H7z" fill="#fdd835"/><path d="M8 4.6C6.4 1.8 3.8 2.6 5 4.2zM8 4.6c1.6-2.8 4.2-2 3 .4z" fill="#fdd835" stroke="#c9a200" stroke-width=".5"/>',
  nota: '<path d="M6 12.2V3.4l7-1.6v8.6" fill="none" stroke="#1c5ec2" stroke-width="1.2" stroke-linejoin="round"/><ellipse cx="4.4" cy="12.4" rx="2" ry="1.5" fill="#1c5ec2"/><ellipse cx="11.4" cy="10.6" rx="2" ry="1.5" fill="#1c5ec2"/>',
  lampada: '<path d="M8 1.2a4.6 4.6 0 0 0-2.6 8.4c.5.4.8 1 .8 1.6v.6h3.6v-.6c0-.6.3-1.2.8-1.6A4.6 4.6 0 0 0 8 1.2z" fill="url(#emo-star)" stroke="#c28a00" stroke-width=".7"/><rect x="6.1" y="12" width="3.8" height="2.6" rx=".6" fill="#9aa3ad" stroke="#6b7486" stroke-width=".5"/><ellipse cx="6.6" cy="4.4" rx="1.2" ry="1.6" fill="#fff" opacity=".7"/>',
  relogio: '<circle cx="8" cy="8" r="6.8" fill="#fff" stroke="#1c5ec2" stroke-width="1.3"/><path d="M8 4v4l2.8 1.8" fill="none" stroke="#1a2b45" stroke-width="1" stroke-linecap="round"/><circle cx="8" cy="8" r=".7" fill="#1a2b45"/>',
  gato: '<path d="M2.4 6.4L2.8 1.6l3.6 2.8zM13.6 6.4L13.2 1.6 9.6 4.4z" fill="#8a8f98"/><ellipse cx="8" cy="9" rx="6" ry="5.6" fill="#b0b6bf" stroke="#6b7280" stroke-width=".7"/><ellipse cx="5.8" cy="8.4" rx=".8" ry="1.2" fill="#2e7d32"/><ellipse cx="10.2" cy="8.4" rx=".8" ry="1.2" fill="#2e7d32"/><path d="M7.4 10.4h1.2L8 11z" fill="#f06292"/>' + line('M3.2 10.6l2.4-.2M3.4 12l2.2-.6M12.8 10.6l-2.4-.2M12.6 12l-2.2-.6', '#4b5563', 0.5),
  cachorro: '<ellipse cx="8" cy="8.6" rx="5.6" ry="5.8" fill="#c9965a" stroke="#7d4f22" stroke-width=".7"/><path d="M2.8 4.2c-2 .8-2 5 .2 6.4l1.2-5.6zM13.2 4.2c2 .8 2 5-.2 6.4l-1.2-5.6z" fill="#6d4420"/><ellipse cx="8" cy="11" rx="3" ry="2.4" fill="#f3dcc0"/><circle cx="6" cy="7.6" r=".9" fill="#2a1a0c"/><circle cx="10" cy="7.6" r=".9" fill="#2a1a0c"/><ellipse cx="8" cy="9.8" rx="1.2" ry=".9" fill="#2a1a0c"/>',
};

const GRADIENTS = `
  <radialGradient id="emo-face" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fff59a"/><stop offset=".6" stop-color="#ffd21f"/><stop offset="1" stop-color="#f0a800"/></radialGradient>
  <radialGradient id="emo-angry" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#ffb199"/><stop offset=".6" stop-color="#f4623a"/><stop offset="1" stop-color="#c7361a"/></radialGradient>
  <radialGradient id="emo-devil" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#d9b3f5"/><stop offset=".6" stop-color="#9b59d0"/><stop offset="1" stop-color="#6b2d8f"/></radialGradient>
  <radialGradient id="emo-heart" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ff8a95"/><stop offset=".6" stop-color="#e0243c"/><stop offset="1" stop-color="#a3101f"/></radialGradient>
  <radialGradient id="emo-star" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fff7b0"/><stop offset=".6" stop-color="#ffd21f"/><stop offset="1" stop-color="#f0a800"/></radialGradient>
  <linearGradient id="emo-beer" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f6b21b"/><stop offset=".5" stop-color="#ffd35c"/><stop offset="1" stop-color="#e09a00"/></linearGradient>`;

/** Monta o sprite com todos os emoticons (uma vez). As strings são do próprio app, não da rede. */
function installSprite() {
  const symbols = Object.entries(DRAWINGS)
    .map(([id, body]) => `<symbol id="emo-${id}" viewBox="0 0 16 16">${body}</symbol>`)
    .join('');
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="${SVG_NS}"><defs>${GRADIENTS}</defs>${symbols}</svg>`,
    'image/svg+xml',
  );
  const sprite = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
  sprite.setAttribute('class', 'sprite');
  sprite.setAttribute('aria-hidden', 'true');
  document.body.prepend(sprite);
}

installSprite();

export function emoticonIcon(id: string, label: string) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'emoticon');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const title = document.createElementNS(SVG_NS, 'title');
  title.textContent = label;
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#emo-${id}`);
  svg.append(title, use);
  return svg;
}

/**
 * Preenche o elemento com o texto, trocando os atalhos por emoticons. Links viram clicáveis, exceto com
 * `links: false` (lista de contatos e avisos, onde o clique já tem outro sentido): lá ficam como texto.
 */
export function renderRichText(node: HTMLElement, text: string, { links = true } = {}) {
  node.replaceChildren(
    ...tokenizeRich(text).map((t) => {
      if ('link' in t) return links ? linkElement(t.link, t.label) : document.createTextNode(t.label);
      return 'text' in t ? document.createTextNode(t.text) : emoticonIcon(t.emoticon.id, `${t.emoticon.name} ${t.code}`);
    }),
  );
}

/** Link clicável: abre no navegador (o main só deixa sair http/https, via setWindowOpenHandler). */
export function linkElement(url: string, label: string): HTMLAnchorElement {
  const a = el('a', 'msg-link', label);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = url;
  return a;
}

// ---------------------------------------------------------------- seletor

/** Monta a grade de emoticons; `onPick` recebe o atalho a inserir. */
export function buildEmoticonGrid(container: HTMLElement, onPick: (code: string) => void) {
  container.replaceChildren(
    ...EMOTICONS.map((e) => {
      const b = el('button', 'emoticon-option');
      b.type = 'button';
      b.title = `${e.name}  ${e.codes[0]}`;
      b.append(emoticonIcon(e.id, e.name));
      b.addEventListener('click', () => onPick(e.codes[0]));
      return b;
    }),
  );
}
