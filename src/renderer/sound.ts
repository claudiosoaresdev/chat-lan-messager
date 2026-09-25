// Sons: "chamar atenção" e nova mensagem.
// Se existir um arquivo em public/sounds/ (nudge.* / message.*, em .wav, .mp3 ou .ogg), ele é tocado —
// é onde entram os sons originais do MSN, que não vêm com o projeto por serem da Microsoft.
// Sem arquivo, o som é sintetizado com Web Audio.

type SoundName = 'nudge' | 'message';

/** Por nome: undefined = ainda não procurou; null = nenhum arquivo encontrado. */
const fileUrls = new Map<SoundName, string | null>();
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

async function findSoundFile(name: SoundName): Promise<string | null> {
  const known = fileUrls.get(name);
  if (known !== undefined) return known;
  for (const ext of ['wav', 'mp3', 'ogg']) {
    const url = `sounds/${name}.${ext}`;
    if (await canLoad(url)) {
      fileUrls.set(name, url);
      return url;
    }
  }
  fileUrls.set(name, null);
  return null;
}

// Procura já na carga da página, para o primeiro som não atrasar.
void findSoundFile('nudge');
void findSoundFile('message');

/** Chacoalhar sintetizado: ruído filtrado, cortado em pulsos rápidos, com o tom descendo. */
function playNudgeSynth() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
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

/** "Plim" de nova mensagem: duas notas curtas subindo, com um brilho de harmônico. */
function playMessageSynth() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const t = ctx.currentTime;
  const notes: Array<[number, number]> = [
    [880, 0], // lá
    [1318.5, 0.11], // mi, uma quinta acima
  ];
  for (const [freq, start] of notes) {
    for (const [mult, level] of [
      [1, 0.28],
      [2, 0.06],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t + start);
      env.gain.exponentialRampToValueAtTime(level, t + start + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t + start + 0.45);
      osc.connect(env).connect(ctx.destination);
      osc.start(t + start);
      osc.stop(t + start + 0.5);
    }
  }
}

async function play(name: SoundName, synth: () => void) {
  try {
    const url = await findSoundFile(name);
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
    synth();
  } catch {
    // sem áudio disponível: segue em silêncio
  }
}

export const playNudgeSound = () => play('nudge', playNudgeSynth);
export const playMessageSound = () => play('message', playMessageSynth);
