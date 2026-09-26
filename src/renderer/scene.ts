// Cena no renderer: resolve a cena efetiva (escolhida ou a do tema), põe a imagem em --scene-image e mede a
// imagem para a legibilidade:
//  - tom da faixa atrás do cabeçalho visível → data-scene-tone (texto claro/escuro) e data-scene-busy (faixa);
//  - cores da imagem inteira (média e extremos p5/p95 de luminância; da tabela SCENE_COLORS para a galeria,
//    medidas na hora para imagens próprias) → fundo conferido das mensagens: o pior trecho da cena sob o véu de
//    --surface. Vale para as cores das mensagens (font.ts) e as secundárias (--scene-said-by, --scene-system,
//    --scene-muted).
// A troca só aparece quando a imagem nova já carregou e foi medida: imagem e cores do texto mudam juntas.
// Na janela de conversa (fase 3), a cena é a do contato quando ele mandou uma e a opção "Mostrar cenas dos
// contatos" está ligada; a legibilidade é a mesma (medida nos pixels), com véu mais forte, e as cores são sempre
// as do meu tema. Imagem do contato só entra por URL blob:.
import type { SharedScene } from '../shared/api';
import { SCENE_COLORS, type SceneColors } from '../shared/scene-averages';
import {
  CONTACT_SCENE_VEIL,
  SCENE_PLATE,
  SCENE_TOOL_PLATE,
  SCENE_VEIL,
  messageBackground,
  sceneSecondaryColors,
} from '../shared/scene-contrast';
import type { SceneChoice } from '../shared/scenes';
import { luminance } from '../shared/color';
import { effectiveScene, themeTokens, type Appearance, type ThemeMode } from '../shared/themes';
import { chat } from './dom';
import { coverTopBand, sceneColors, sceneTone } from './scene-tone';

interface Shown {
  key: string;
  url: string;
  /** Imagem rasterizada (para medir o topo); null se o canvas não pôde ser lido. */
  canvas: HTMLCanvasElement | null;
  colors: SceneColors;
  /** URL blob: a revogar quando a cena sair (imagens próprias e do contato). */
  blob: boolean;
  /** Cena do contato (véu mais forte). */
  contact: boolean;
}

/** O que carregar: uma escolha minha ou a imagem recebida do contato (`key` muda a cada imagem nova). */
type Source = SceneChoice | { kind: 'peer-image'; key: string; mime: string; data: Uint8Array };

/**
 * Janela de conversa: a cena do contato. null na janela da lista (sempre a minha). `known` = já perguntou ao main
 * (até lá, com a opção ligada, a cena espera para não piscar a minha); `broken` = chave da imagem do contato que
 * não carregou (volta à minha até ele mandar outra).
 */
let contact: { known: boolean; scene: SharedScene | null; seq: number; broken: string } | null = null;

const root = document.documentElement;
let shown: Shown | null = null;
/** Cena pedida pela aparência (evita recarregar a mesma); '' = pedir de novo na próxima aplicação. */
let requested = '';
/** Número da última carga: respostas de cargas antigas são descartadas. */
let loadSeq = 0;
let current: { a: Appearance; mode: ThemeMode } | null = null;
const listeners: Array<() => void> = [];

/** Avisa quando a cena (e com ela o fundo efetivo das mensagens) muda. */
export function onSceneChanged(fn: () => void) {
  listeners.push(fn);
}

/** Fundo conferido das mensagens (pior trecho da cena atual sob o véu, se houver) para uma superfície e modo. */
export function sceneMessageBackground(surface: string, mode: ThemeMode): string {
  return messageBackground(surface, shown?.colors ?? null, mode, shown?.contact ? CONTACT_SCENE_VEIL : SCENE_VEIL);
}

/** Sem pixels legíveis: supõe o pior (preto e branco puros), então as cores ficam seguras em qualquer imagem. */
const UNKNOWN_COLORS: SceneColors = { average: '#808080', dark: '#000000', light: '#ffffff' };

let warnedCanvas = false;

const keyOf = (c: Source) => (c.kind === 'none' ? 'none' : c.kind === 'peer-image' ? c.key : `${c.kind}:${c.id}`);

/** Rasteriza numa largura fixa, na proporção da imagem. */
function rasterize(img: HTMLImageElement): HTMLCanvasElement {
  const w = 480;
  const ratio = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalHeight / img.naturalWidth : 9 / 16;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = Math.max(1, Math.round(w * ratio));
  canvas.getContext('2d', { willReadFrequently: true })?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function readPixels(canvas: HTMLCanvasElement, sx = 0, sy = 0, sw = canvas.width, sh = canvas.height, w = 160, h = 90) {
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('sem canvas');
  g.drawImage(canvas, sx, sy, sw, sh, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}

async function load(choice: Exclude<Source, { kind: 'none' }>, isContact: boolean): Promise<Shown | null> {
  let url: string;
  let blob = false;
  if (choice.kind === 'builtin') {
    url = new URL(`scenes/${choice.id}.svg`, location.href).href;
  } else if (choice.kind === 'peer-image') {
    // Bytes já conferidos no main (assinatura JPEG/PNG, até 400 KB); aqui só viram blob:.
    url = URL.createObjectURL(new Blob([choice.data as Uint8Array<ArrayBuffer>], { type: choice.mime }));
    blob = true;
  } else {
    const bytes = await chat().getCustomScene(choice.id);
    if (!bytes) return null;
    url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
    blob = true;
  }
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    if (blob) URL.revokeObjectURL(url);
    return null;
  }
  let canvas: HTMLCanvasElement | null = rasterize(img);
  const table = choice.kind === 'builtin' ? SCENE_COLORS[choice.id] : undefined;
  let colors = table ?? UNKNOWN_COLORS;
  try {
    // Galeria: a tabela (mesmos números do teste); imagem própria: medida aqui. Ler os pixels também confere que
    // o canvas não ficou "sujo" (sem isso não dá para medir o topo).
    const measured = sceneColors(readPixels(canvas));
    colors = table ?? measured;
  } catch (err) {
    // canvas "sujo" (origem diferente): cores da tabela ou as piores possíveis; topo sem medida (faixa ligada)
    if (!warnedCanvas) {
      warnedCanvas = true;
      console.warn('[cena] não foi possível ler os pixels da cena; usando cores seguras', err);
    }
    canvas = null;
  }
  return { key: keyOf(choice), url, canvas, colors, blob, contact: isContact };
}

/** Mede a faixa atrás do cabeçalho da tela visível (home ou conversa) e marca o tom do texto do topo. */
function measureTone() {
  if (!shown) return;
  const top = document.querySelector<HTMLElement>('.view:not([hidden]) .scene-top');
  const header = top?.firstElementChild as HTMLElement | null | undefined;
  if (!top || !header || top.clientWidth === 0 || header.offsetHeight === 0) return;
  const style = getComputedStyle(root);
  const onDark = style.getPropertyValue('--scene-text-on-dark').trim() || '#fff';
  const onLight = style.getPropertyValue('--scene-text-on-light').trim() || '#000';
  let tone: 'light' | 'dark';
  let busy: boolean;
  if (shown.canvas) {
    const c = shown.canvas;
    const r = coverTopBand(c.width, c.height, top.clientWidth, top.clientHeight, header.offsetHeight);
    ({ tone, busy } = sceneTone(readPixels(c, r.sx, r.sy, r.sw, r.sh, 160, 40), onDark, onLight));
  } else {
    // Sem pixels: tom pela cor média e faixa sempre ligada (legível em qualquer imagem).
    tone = luminance(shown.colors.average) > 0.19 ? 'light' : 'dark';
    busy = true;
  }
  root.dataset.sceneTone = tone;
  root.dataset.sceneBusy = String(busy);
}

let resizeTimer = 0;
const observer = new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(measureTone, 120);
});
document.querySelectorAll('.scene-top').forEach((el) => observer.observe(el));

/** Véu, opacidades e cores secundárias da conversa para o tema/modo e a cena atuais. */
function paintColors() {
  if (!current) return;
  const tokens = themeTokens(current.a.theme, current.mode);
  const veil = shown?.contact ? CONTACT_SCENE_VEIL : SCENE_VEIL;
  root.style.setProperty('--scene-veil', `${veil[current.mode]}%`);
  root.style.setProperty('--scene-plate', `${SCENE_PLATE}%`);
  root.style.setProperty('--scene-tool-plate', `${SCENE_TOOL_PLATE}%`);
  const colors = sceneSecondaryColors(tokens, sceneMessageBackground(tokens.surface, current.mode));
  root.style.setProperty('--scene-said-by', colors.saidBy);
  root.style.setProperty('--scene-system', colors.system);
  root.style.setProperty('--scene-muted', colors.muted);
}

function show(next: Shown | null) {
  const old = shown;
  shown = next;
  if (next) {
    root.style.setProperty('--scene-image', `url("${next.url}")`);
    root.dataset.scene = 'on';
    measureTone();
  } else {
    root.style.setProperty('--scene-image', 'none');
    root.dataset.scene = 'off';
    delete root.dataset.sceneTone;
    delete root.dataset.sceneBusy;
  }
  if (old?.blob && old.url !== next?.url) URL.revokeObjectURL(old.url);
  paintColors();
  listeners.forEach((fn) => fn());
}

/**
 * Cena que vale nesta janela: a do contato (conversa, opção ligada, contato com cena que não seja "nenhuma") ou a
 * minha. null = esperar a resposta do main sobre a cena do contato.
 */
function effectiveSource(a: Appearance): { source: Source; contact: boolean } | null {
  if (contact && a.showContactScenes) {
    if (!contact.known) return null;
    const s = contact.scene;
    if (s && s.kind !== 'none') {
      const source: Source =
        s.kind === 'builtin'
          ? { kind: 'builtin', id: s.id }
          : { kind: 'peer-image', key: `peer-image:${contact.seq}`, mime: s.mime, data: s.data };
      if (keyOf(source) !== contact.broken) return { source, contact: true };
    }
  }
  return { source: effectiveScene(a), contact: false };
}

/** Aplica a cena da aparência (chamado a cada aparência aplicada; só recarrega se a cena mudou). */
export function applyScene(a: Appearance, mode: ThemeMode) {
  current = { a, mode };
  paintColors();
  refreshScene();
}

function refreshScene() {
  if (!current) return;
  const next = effectiveSource(current.a);
  if (!next) return;
  // A mesma cena da galeria como minha ou do contato muda o véu: a chave distingue.
  const key = `${next.contact ? 'contact|' : ''}${keyOf(next.source)}`;
  if (key === requested) return;
  requested = key;
  request(next.source, current.a, next.contact);
}

/** Esta janela é uma conversa: passa a esperar a cena do contato (setContactScene). */
export function expectContactScene() {
  contact ??= { known: false, scene: null, seq: 0, broken: '' };
}

/** Cena do contato desta conversa (null = ele não mandou). Recarrega só se a cena efetiva mudou. */
export function setContactScene(scene: SharedScene | null) {
  expectContactScene();
  if (!contact) return;
  contact.known = true;
  contact.scene = scene;
  if (scene?.kind === 'image') contact.seq++;
  refreshScene();
}

/**
 * Carrega e mostra uma cena. Se uma imagem própria não carrega (apagada, ilegível), mostra a cena do tema e
 * esquece o pedido, para a próxima aparência aplicada tentar de novo. Se a cena do contato não carrega, mostra a
 * minha até ele mandar outra.
 */
function request(choice: Source, a: Appearance, isContact: boolean) {
  const seq = ++loadSeq;
  if (choice.kind === 'none') {
    show(null);
    return;
  }
  void load(choice, isContact)
    .catch((): Shown | null => null)
    .then((next) => {
      if (seq !== loadSeq) {
        if (next?.blob) URL.revokeObjectURL(next.url);
        return;
      }
      if (next) {
        show(next);
        return;
      }
      if (isContact && contact) {
        contact.broken = keyOf(choice);
        requested = '';
        refreshScene();
      } else if (choice.kind === 'custom') {
        requested = '';
        request(effectiveScene({ ...a, scene: null }), a, false);
      } else {
        show(null);
      }
    });
}
