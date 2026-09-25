// Som do "chamar atenção".
// Se existir um arquivo em public/sounds/ (nudge.wav, .mp3 ou .ogg), ele é tocado — é onde
// entra o som original do MSN, que não vem com o projeto por ser da Microsoft.
// Sem arquivo, um chacoalhar é sintetizado com Web Audio.

const CANDIDATES = ['sounds/nudge.wav', 'sounds/nudge.mp3', 'sounds/nudge.ogg'];

/** undefined = ainda não procurou; null = nenhum arquivo encontrado. */
let fileUrl: string | null | undefined;
let ctx: AudioContext | null = null;

function canLoad(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = new Audio();
    probe.preload = 'auto';
    probe.oncanplaythrough = () => resolve(true);
    probe.onerror = () => resolve(false);
    // Sem resposta em 2 s: considera ausente para não travar o som.
    window.setTimeout(() => resolve(false), 2000);
    probe.src = url;
    probe.load();
  });
}

async function findSoundFile(): Promise<string | null> {
  if (fileUrl !== undefined) return fileUrl;
  for (const url of CANDIDATES) {
    if (await canLoad(url)) return (fileUrl = url);
  }
  return (fileUrl = null);
}

// Procura já na carga da página, para o primeiro "chamar atenção" não atrasar.
void findSoundFile();

/** Chacoalhar sintetizado: ruído filtrado, cortado em pulsos rápidos, com o tom descendo. */
function playSynth() {
  ctx ??= new AudioContext();
  const t = ctx.currentTime;
  const duration = 0.75;

  const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = noise;

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 3;
  band.frequency.setValueAtTime(1400, t);
  band.frequency.exponentialRampToValueAtTime(420, t + duration);

  // Pulsos rápidos (o "trrrr" do chacoalhar).
  const pulses = ctx.createGain();
  pulses.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.setValueAtTime(26, t);
  lfo.frequency.linearRampToValueAtTime(16, t + duration);
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.5;
  const lfoOffset = ctx.createConstantSource();
  lfoOffset.offset.value = 0.5;
  lfo.connect(lfoDepth).connect(pulses.gain);
  lfoOffset.connect(pulses.gain);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.5, t + 0.015);
  env.gain.setValueAtTime(0.5, t + 0.35);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  src.connect(band).connect(pulses).connect(env).connect(ctx.destination);
  for (const node of [src, lfo, lfoOffset]) {
    node.start(t);
    node.stop(t + duration);
  }
}

export async function playNudgeSound() {
  try {
    const url = await findSoundFile();
    if (url) {
      const audio = new Audio(url);
      audio.volume = 0.9;
      await audio.play();
      return;
    }
  } catch {
    // arquivo não tocou: cai no som sintetizado
  }
  try {
    playSynth();
  } catch {
    // sem áudio disponível: segue só com a tremida
  }
}
