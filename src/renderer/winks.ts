// Winks: animações que tocam por cima da conversa, no espírito dos winks do MSN.
// Desenhos e animações próprios (SVG + CSS); os originais eram animações Flash da Microsoft.
import type { WinkId } from '../shared/protocol';
import { emoticonIcon } from './emoticons';
import { el } from './dom';

export interface WinkInfo {
  id: WinkId;
  name: string;
  /** Emoticon usado como ícone na grade e na linha da conversa. */
  icon: string;
}

export const WINKS: WinkInfo[] = [
  { id: 'beijo', name: 'Beijo', icon: 'beijo' },
  { id: 'coracoes', name: 'Corações', icon: 'coracao' },
  { id: 'risada', name: 'Risada', icon: 'gargalhada' },
  { id: 'fogos', name: 'Fogos', icon: 'estrela' },
  { id: 'parabens', name: 'Parabéns', icon: 'bolo' },
  { id: 'estrelas', name: 'Chuva de estrelas', icon: 'lua' },
];

export const winkInfo = (id: WinkId) => WINKS.find((w) => w.id === id) as WinkInfo;

const DURATION_MS = 3400;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Emoticon grande, usado como "personagem" do wink. */
function big(icon: string, className: string) {
  const svg = emoticonIcon(icon, '');
  svg.setAttribute('class', `wink-actor ${className}`);
  svg.removeAttribute('role');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

/** Partícula posicionada por variáveis CSS (CSSOM; permitido pela CSP). */
function particle(className: string, vars: Record<string, string | number>, child?: Node) {
  const p = el('span', `wink-particle ${className}`);
  for (const [k, v] of Object.entries(vars)) p.style.setProperty(`--${k}`, String(v));
  if (child) p.append(child);
  return p;
}

const smallIcon = (icon: string) => {
  const svg = emoticonIcon(icon, '');
  svg.removeAttribute('role');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
};

const CONFETTI = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#fb8c00', '#ec407a'];

const BUILDERS: Record<WinkId, (stage: HTMLElement) => void> = {
  beijo(stage) {
    stage.append(big('beijo', 'wink-kiss'));
    for (let i = 0; i < 12; i++) {
      stage.append(
        particle('wink-float', { x: `${rand(15, 85)}%`, dx: `${rand(-40, 40)}px`, delay: `${rand(0.6, 1.8)}s`, size: `${rand(18, 34)}px` }, smallIcon('coracao')),
      );
    }
  },

  coracoes(stage) {
    stage.append(big('coracao', 'wink-heartbeat'));
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const dist = rand(120, 220);
      stage.append(
        particle(
          'wink-burst',
          { dx: `${Math.cos(angle) * dist}px`, dy: `${Math.sin(angle) * dist}px`, delay: '1.5s', size: `${rand(16, 28)}px` },
          smallIcon('coracao'),
        ),
      );
    }
  },

  risada(stage) {
    stage.append(big('gargalhada', 'wink-laugh'));
    const words = ['HA', 'HA', 'HA', 'kkk', 'HAHA', 'rs'];
    words.forEach((w, i) => {
      const t = el('span', 'wink-word', w);
      t.style.setProperty('--x', `${rand(8, 78)}%`);
      t.style.setProperty('--y', `${rand(8, 78)}%`);
      t.style.setProperty('--delay', `${0.3 + i * 0.3}s`);
      t.style.setProperty('--rot', `${rand(-25, 25)}deg`);
      stage.append(t);
    });
  },

  fogos(stage) {
    const bursts = [
      [25, 30, 0.1],
      [70, 25, 0.7],
      [45, 55, 1.3],
      [80, 60, 1.9],
    ];
    for (const [x, y, delay] of bursts) {
      const color = CONFETTI[Math.floor(rand(0, CONFETTI.length))];
      stage.append(particle('wink-flash', { x: `${x}%`, y: `${y}%`, delay: `${delay}s`, color }));
      for (let i = 0; i < 22; i++) {
        const angle = (i / 22) * Math.PI * 2;
        const dist = rand(80, 140);
        stage.append(
          particle('wink-spark', {
            x: `${x}%`,
            y: `${y}%`,
            dx: `${Math.cos(angle) * dist}px`,
            dy: `${Math.sin(angle) * dist}px`,
            delay: `${delay}s`,
            color: i % 3 === 0 ? '#fff59d' : color,
          }),
        );
      }
    }
  },

  parabens(stage) {
    stage.append(big('bolo', 'wink-cake'));
    const title = el('span', 'wink-title', 'Parabéns!');
    stage.append(title);
    for (let i = 0; i < 46; i++) {
      stage.append(
        particle('wink-confetti', {
          x: `${rand(0, 100)}%`,
          delay: `${rand(0, 1.6)}s`,
          dur: `${rand(1.6, 2.6)}s`,
          rot: `${rand(180, 720)}deg`,
          dx: `${rand(-50, 50)}px`,
          color: CONFETTI[i % CONFETTI.length],
        }),
      );
    }
  },

  estrelas(stage) {
    stage.append(big('lua', 'wink-moon'));
    for (let i = 0; i < 22; i++) {
      stage.append(
        particle(
          'wink-fall',
          {
            x: `${rand(0, 95)}%`,
            delay: `${rand(0, 2)}s`,
            dur: `${rand(1.2, 2.2)}s`,
            size: `${rand(14, 30)}px`,
            rot: `${rand(90, 360)}deg`,
          },
          smallIcon('estrela'),
        ),
      );
    }
  },
};

let active: HTMLElement | null = null;

/** Toca o wink por cima de `host`. Um por vez: um novo substitui o anterior. */
export function playWink(id: WinkId, host: HTMLElement) {
  active?.remove();
  const stage = el('div', `wink-stage wink-${id}${reducedMotion() ? ' is-reduced' : ''}`);
  stage.setAttribute('aria-hidden', 'true');
  BUILDERS[id](stage);
  host.append(stage);
  active = stage;
  playWinkSound(id);
  window.setTimeout(() => {
    stage.classList.add('is-leaving');
    window.setTimeout(() => {
      stage.remove();
      if (active === stage) active = null;
    }, 300);
  }, reducedMotion() ? 1500 : DURATION_MS);
}

// ---------------------------------------------------------------- som

let ctx: AudioContext | null = null;

/** Arpejo curto e brilhante, com a nota base variando por wink. */
function playWinkSound(id: WinkId) {
  try {
    ctx ??= new AudioContext();
    const base = { beijo: 523, coracoes: 587, risada: 659, fogos: 392, parabens: 523, estrelas: 784 }[id];
    const steps = [1, 1.25, 1.5, 2];
    const t0 = ctx.currentTime;
    steps.forEach((mult, i) => {
      if (!ctx) return;
      const t = t0 + i * 0.09;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = base * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  } catch {
    // sem áudio: só a animação
  }
}

// ---------------------------------------------------------------- grade

export function buildWinkGrid(container: HTMLElement, onPick: (id: WinkId) => void) {
  container.replaceChildren(
    ...WINKS.map((w) => {
      const b = el('button', 'wink-option');
      b.type = 'button';
      b.title = `Enviar o wink "${w.name}"`;
      b.append(smallIcon(w.icon), el('span', 'wink-option-name', w.name));
      b.addEventListener('click', () => onPick(w.id));
      return b;
    }),
  );
}
