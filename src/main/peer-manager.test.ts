import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { PeerManager, type PeerManagerEvents } from './peer-manager';
import type { PeerInfo } from '../shared/api';

const HOST = '127.0.0.1';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

let managers: PeerManager[] = [];

async function create(id: string, name = id) {
  const pm = new PeerManager({ id, name, host: HOST, reconnectMs: 100, heartbeatMs: 60_000 });
  await pm.start();
  managers.push(pm);
  return pm;
}

function next<K extends keyof PeerManagerEvents>(pm: PeerManager, event: K, filter: (...a: PeerManagerEvents[K]) => boolean = () => true) {
  return new Promise<PeerManagerEvents[K][0]>((resolve) => {
    const listener = (...args: PeerManagerEvents[K]) => {
      if (!filter(...args)) return;
      pm.off(event, listener as never);
      resolve(args[0]);
    };
    pm.on(event, listener as never);
  });
}

const onlineWith = (id: string) => (p: PeerInfo) => p.id === id && p.online;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Socket cru para simular um peer mal-comportado. */
async function rawPeer(pm: PeerManager, id = 'zzz-raw') {
  const ws = new WebSocket(`ws://${HOST}:${pm.port}`);
  await new Promise((r) => ws.once('open', r));
  const online = next(pm, 'peer', onlineWith(id));
  ws.send(JSON.stringify({ type: 'hello', id, name: 'raw' }));
  await online;
  return ws;
}

afterEach(async () => {
  await Promise.all(managers.map((m) => m.stop()));
  managers = [];
});

describe('PeerManager', () => {
  it('conecta por IP e troca hello com id e nome', async () => {
    const a = await create('aaa', 'Windows');
    const b = await create('bbb', 'Mac');

    const bSeesA = next(b, 'peer', onlineWith('aaa'));
    const peerId = await a.connect(HOST, b.port);

    expect(peerId).toBe('bbb');
    expect(await bSeesA).toMatchObject({ id: 'aaa', name: 'Windows', online: true });
    expect(a.getPeers()).toEqual([expect.objectContaining({ id: 'bbb', name: 'Mac', online: true })]);
  });

  it('entrega texto nos dois sentidos', async () => {
    const a = await create('aaa');
    const b = await create('bbb');
    const bReady = next(b, 'peer', onlineWith('aaa'));
    await a.connect(HOST, b.port);
    await bReady;

    const atB = next(b, 'message');
    const sent = a.sendText('bbb', '  olá  ');
    expect(sent).toMatchObject({ from: 'aaa', text: 'olá', self: true });
    expect(await atB).toMatchObject({ from: 'aaa', fromName: 'aaa', text: 'olá', self: false });

    const atA = next(a, 'message');
    b.sendText('aaa', 'oi');
    expect(await atA).toMatchObject({ from: 'bbb', text: 'oi' });

    // Com fonte: chega junto com a mensagem.
    const font = {
      family: 'Verdana',
      size: 16,
      weight: 700,
      bold: true,
      italic: false,
      underline: false,
      color: '#800080',
    } as const;
    const withFont = next(b, 'message');
    expect(a.sendText('bbb', 'formatado', font)).toMatchObject({ font });
    expect(await withFont).toMatchObject({ text: 'formatado', font });
  });

  it('envia status e mensagem pessoal no hello e nas mudanças', async () => {
    const a = new PeerManager({ id: 'aaa', name: 'A', host: HOST, status: 'busy', message: 'reunião' });
    await a.start();
    managers.push(a);
    const b = await create('bbb');

    const bSeesA = next(b, 'peer', onlineWith('aaa'));
    await a.connect(HOST, b.port);
    expect(await bSeesA).toMatchObject({ status: 'busy', message: 'reunião' });

    const update = next(b, 'peer', (p) => p.id === 'aaa' && p.status === 'away');
    a.setPresence({ status: 'away', message: '  volto já  ' });
    expect(await update).toMatchObject({ status: 'away', message: 'volto já', online: true });
  });

  it('troca o nome e avisa os contatos; nome vazio é ignorado', async () => {
    const a = await create('aaa');
    const b = await create('bbb');
    const bSeesA = next(b, 'peer', onlineWith('aaa'));
    await a.connect(HOST, b.port);
    await bSeesA;

    const renamed = next(b, 'peer', (p) => p.id === 'aaa' && p.name === 'Novo nome');
    a.setPresence({ name: '  Novo nome  ' });
    expect(await renamed).toMatchObject({ name: 'Novo nome', online: true });
    expect(a.name).toBe('Novo nome');

    a.setPresence({ name: '   ' });
    expect(a.name).toBe('Novo nome');

    const text = next(b, 'message');
    a.sendText('bbb', 'oi');
    expect(await text).toMatchObject({ fromName: 'Novo nome' });
  });

  it('envia a imagem de exibição ao conectar, ao trocar e ao remover', async () => {
    const a = new PeerManager({ id: 'aaa', name: 'A', host: HOST, avatar: new Uint8Array(PNG) });
    await a.start();
    managers.push(a);
    const b = await create('bbb');

    // Ao conectar, o contato recebe a imagem atual.
    const first = next(b, 'avatar');
    await a.connect(HOST, b.port);
    const got = await first;
    expect(got).toMatchObject({ id: 'aaa', mime: 'image/png' });
    expect(Buffer.from(got.data as Uint8Array)).toEqual(PNG);
    expect(b.getPeerAvatars()).toHaveLength(1);

    // Troca
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const changed = next(b, 'avatar');
    a.setAvatar(new Uint8Array(jpeg));
    expect(await changed).toMatchObject({ id: 'aaa', mime: 'image/jpeg' });

    // Remoção
    const removed = next(b, 'avatar');
    a.setAvatar(null);
    expect(await removed).toEqual({ id: 'aaa', mime: null, data: null });
    expect(b.getPeerAvatars()).toHaveLength(0);
  });

  it('recusa imagem de exibição inválida', async () => {
    const a = await create('aaa');
    expect(() => a.setAvatar(new TextEncoder().encode('<svg/>'))).toThrow(/Formato/);
    const big = new Uint8Array(300 * 1024);
    big.set(PNG);
    expect(() => a.setAvatar(big)).toThrow(/256 KB/);
  });

  it('envia a cena ao conectar, ao trocar e quando vira nenhuma', async () => {
    const a = new PeerManager({ id: 'aaa', name: 'A', host: HOST, scene: { kind: 'builtin', id: 'aurora' } });
    await a.start();
    managers.push(a);
    const b = await create('bbb');

    // Ao conectar, o contato recebe a cena atual.
    const first = next(b, 'scene');
    await a.connect(HOST, b.port);
    expect(await first).toEqual({ id: 'aaa', scene: { kind: 'builtin', id: 'aurora' } });
    expect(b.getPeerScene('aaa')).toEqual({ id: 'aaa', scene: { kind: 'builtin', id: 'aurora' } });

    // Troca para imagem própria (cabeçalho + frame binário).
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const image = next(b, 'scene');
    a.setScene({ kind: 'image', data: new Uint8Array(jpeg) });
    const got = await image;
    expect(got).toMatchObject({ id: 'aaa', scene: { kind: 'image', mime: 'image/jpeg' } });
    expect(Buffer.from((got.scene as { data: Uint8Array }).data)).toEqual(jpeg);

    // Nenhuma
    const none = next(b, 'scene');
    a.setScene({ kind: 'none' });
    expect(await none).toEqual({ id: 'aaa', scene: { kind: 'none' } });
    expect(b.getPeerScenes()).toEqual([{ id: 'aaa', scene: { kind: 'none' } }]);
  });

  it('manda a cena definida depois de conectar e não repete cena igual', async () => {
    const a = await create('aaa');
    const b = await create('bbb');
    const events: unknown[] = [];
    b.on('scene', (s) => events.push(s));
    const ready = next(b, 'peer', onlineWith('aaa'));
    await a.connect(HOST, b.port);
    await ready;
    await sleep(50);
    // Sem cena definida, nada é enviado.
    expect(events).toHaveLength(0);
    expect(b.getPeerScene('aaa')).toBeNull();

    const first = next(b, 'scene');
    a.setScene({ kind: 'builtin', id: 'ceu' });
    await first;
    a.setScene({ kind: 'builtin', id: 'ceu' });
    const second = next(b, 'scene');
    a.setScene({ kind: 'builtin', id: 'folhas' });
    await second;
    expect(events).toEqual([
      { id: 'aaa', scene: { kind: 'builtin', id: 'ceu' } },
      { id: 'aaa', scene: { kind: 'builtin', id: 'folhas' } },
    ]);
  });

  it('manda a cena de novo quando o contato reconecta', async () => {
    const a = await create('aaa');
    let b = await create('bbb');
    const port = b.port;
    a.setScene({ kind: 'builtin', id: 'montanhas' });
    await a.connect(HOST, port);

    const offline = next(a, 'peer', (p) => p.id === 'bbb' && !p.online);
    await b.stop();
    managers = managers.filter((m) => m !== b);
    await offline;

    b = new PeerManager({ id: 'bbb', name: 'bbb', host: HOST, port });
    const again = next(b, 'scene');
    await b.start();
    managers.push(b);
    expect(await again).toEqual({ id: 'aaa', scene: { kind: 'builtin', id: 'montanhas' } });
  });

  it('recusa cena própria inválida', async () => {
    const a = await create('aaa');
    expect(() => a.setScene({ kind: 'builtin', id: 'nao-existe' })).toThrow(/desconhecida/);
    expect(() => a.setScene({ kind: 'image', data: new TextEncoder().encode('<svg/>') })).toThrow(/Formato/);
    expect(() => a.setScene({ kind: 'image', data: new TextEncoder().encode('GIF89a....') })).toThrow(/Formato/);
    const big = new Uint8Array(400 * 1024 + 1);
    big.set(PNG);
    expect(() => a.setScene({ kind: 'image', data: big })).toThrow(/400 KB/);
  });

  it('descarta cena recebida inválida e binário sem cabeçalho', async () => {
    const a = await create('aaa');
    const ws = await rawPeer(a);
    const scenes: unknown[] = [];
    a.on('scene', (s) => scenes.push(s));

    ws.send(PNG); // binário sem cabeçalho não vira cena
    ws.send(JSON.stringify({ type: 'scene', from: 'zzz-raw', kind: 'builtin', id: 'nao-existe' }));
    ws.send(JSON.stringify({ type: 'scene', from: 'outro-id', kind: 'none' })); // remetente falso
    ws.send(JSON.stringify({ type: 'scene', from: 'zzz-raw', kind: 'image', mime: 'image/jpeg', size: PNG.length }));
    ws.send(PNG); // assinatura não bate com o mime
    ws.send(JSON.stringify({ type: 'scene', from: 'zzz-raw', kind: 'image', mime: 'image/png', size: 999 }));
    ws.send(PNG); // tamanho não bate
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    ws.send(JSON.stringify({ type: 'scene', from: 'zzz-raw', kind: 'image', mime: 'image/png', size: svg.length }));
    ws.send(svg);
    await sleep(50);
    expect(scenes).toHaveLength(0);
    expect(a.getPeerScene('zzz-raw')).toBeNull();

    // Uma válida passa.
    const ok = next(a, 'scene');
    ws.send(JSON.stringify({ type: 'scene', from: 'zzz-raw', kind: 'image', mime: 'image/png', size: PNG.length }));
    ws.send(PNG);
    expect(await ok).toMatchObject({ id: 'zzz-raw', scene: { kind: 'image', mime: 'image/png' } });
    ws.close();
  });

  it('contato que não manda cena (versão antiga) fica sem entrada', async () => {
    const a = await create('aaa');
    const ws = await rawPeer(a);
    ws.send(JSON.stringify({ type: 'chat', from: 'zzz-raw', text: 'oi', ts: 1 }));
    await next(a, 'message');
    expect(a.getPeerScenes()).toEqual([]);
    expect(a.getPeerScene('zzz-raw')).toBeNull();
    ws.close();
  });

  it('chama atenção com limite de frequência', async () => {
    const a = await create('aaa', 'Ana');
    const b = await create('bbb');
    const bReady = next(b, 'peer', onlineWith('aaa'));
    await a.connect(HOST, b.port);
    await bReady;

    const atB = next(b, 'nudge');
    expect(a.sendNudge('bbb', 1_000_000)).toMatchObject({ from: 'aaa', self: true });
    expect(await atB).toMatchObject({ from: 'aaa', fromName: 'Ana', self: false });

    // Envio repetido dentro do intervalo é recusado.
    expect(() => a.sendNudge('bbb', 1_000_000 + 1000)).toThrow(/Aguarde/);
  });

  it('envia wink com limite e ignora repetido do mesmo contato', async () => {
    const a = await create('aaa', 'Ana');
    const b = await create('bbb');
    const bReady = next(b, 'peer', onlineWith('aaa'));
    await a.connect(HOST, b.port);
    await bReady;

    const atB = next(b, 'wink');
    expect(a.sendWink('bbb', 'fogos', 2_000_000)).toMatchObject({ wink: 'fogos', self: true });
    expect(await atB).toMatchObject({ from: 'aaa', fromName: 'Ana', wink: 'fogos', self: false });
    expect(() => a.sendWink('bbb', 'beijo', 2_000_000 + 500)).toThrow(/Aguarde/);
    expect(() => a.sendWink('bbb', 'x' as never, 3_000_000)).toThrow(/desconhecido/);
  });

  it('ignora chamar atenção repetido do mesmo contato', async () => {
    const a = await create('aaa');
    const ws = await rawPeer(a);
    const got: unknown[] = [];
    a.on('nudge', (n) => got.push(n));
    ws.send(JSON.stringify({ type: 'nudge', from: 'zzz-raw', ts: 1 }));
    ws.send(JSON.stringify({ type: 'nudge', from: 'zzz-raw', ts: 2 }));
    ws.send(JSON.stringify({ type: 'chat', from: 'zzz-raw', text: 'fim', ts: 3 }));
    await next(a, 'message');
    expect(got).toHaveLength(1);
    ws.close();
  });

  it('entrega imagem (cabeçalho + frame binário)', async () => {
    const a = await create('aaa');
    const b = await create('bbb');
    const bReady = next(b, 'peer', onlineWith('aaa'));
    await a.connect(HOST, b.port);
    await bReady;

    const atB = next(b, 'image');
    const meta = a.sendImage('bbb', { name: 'foto.png', data: new Uint8Array(PNG) });
    expect(meta).toMatchObject({ mime: 'image/png', size: PNG.length });

    const img = await atB;
    expect(img).toMatchObject({ from: 'aaa', name: 'foto.png', mime: 'image/png', size: PNG.length });
    expect(Buffer.from(img.data)).toEqual(PNG);
  });

  it('entrega imagem de 5 MB', async () => {
    const a = await create('aaa');
    const b = await create('bbb');
    const bReady = next(b, 'peer', onlineWith('aaa'));
    await a.connect(HOST, b.port);
    await bReady;

    const big = Buffer.alloc(5 * 1024 * 1024, 7);
    PNG.copy(big);
    const atB = next(b, 'image');
    a.sendImage('bbb', { name: 'grande.png', data: new Uint8Array(big) });
    const img = await atB;
    expect(img.size).toBe(big.length);
    expect(Buffer.from(img.data).equals(big)).toBe(true);
  });

  it('recusa enviar imagem com assinatura inválida', async () => {
    const a = await create('aaa');
    expect(() => a.sendImage('bbb', { name: 'x.svg', data: new TextEncoder().encode('<svg/>') })).toThrow(/Formato/);
    expect(() => a.sendImage('bbb', { name: 'x', data: new Uint8Array() })).toThrow(/vazia/);
  });

  it('descarta frames inválidos, binário sem cabeçalho e remetente falso', async () => {
    const a = await create('aaa');
    const ws = await rawPeer(a);

    const received: unknown[] = [];
    a.on('message', (m) => received.push(m));
    a.on('image', (m) => received.push(m));

    ws.send('não é json');
    ws.send(JSON.stringify({ type: 'chat', from: 'zzz-raw', text: 5, ts: 1 }));
    ws.send(JSON.stringify({ type: 'chat', from: 'outro-id', text: 'spoof', ts: 1 }));
    ws.send(PNG); // binário sem cabeçalho
    ws.send(JSON.stringify({ type: 'image', from: 'zzz-raw', name: 'x', mime: 'image/jpeg', size: PNG.length, ts: 1 }));
    ws.send(PNG); // assinatura não bate com o mime
    ws.send(JSON.stringify({ type: 'image', from: 'zzz-raw', name: 'x', mime: 'image/png', size: 999, ts: 1 }));
    ws.send(PNG); // tamanho não bate
    ws.send(JSON.stringify({ type: 'chat', from: 'zzz-raw', text: 'válida', ts: 1 }));

    const ok = await next(a, 'message');
    expect(ok).toMatchObject({ text: 'válida' });
    await sleep(50);
    expect(received).toHaveLength(1);
    ws.close();
  });

  it('ignora mensagens antes do hello', async () => {
    const a = await create('aaa');
    const ws = new WebSocket(`ws://${HOST}:${a.port}`);
    await new Promise((r) => ws.once('open', r));
    const received: unknown[] = [];
    a.on('message', (m) => received.push(m));
    ws.send(JSON.stringify({ type: 'chat', from: 'x', text: 'cedo', ts: 1 }));
    await sleep(50);
    expect(received).toHaveLength(0);
    ws.close();
  });

  it('marca peer offline quando a conexão cai', async () => {
    const a = await create('aaa');
    const b = await create('bbb');
    const bReady = next(b, 'peer', onlineWith('aaa'));
    await a.connect(HOST, b.port);
    await bReady;

    const offline = next(b, 'peer', (p) => p.id === 'aaa' && !p.online);
    await a.stop();
    managers = managers.filter((m) => m !== a);
    expect(await offline).toMatchObject({ id: 'aaa', online: false });
    expect(b.getPeers()).toEqual([expect.objectContaining({ id: 'aaa', online: false })]);
  });

  it('não cria conexão duplicada quando os dois lados discam ao mesmo tempo', async () => {
    const a = await create('aaa');
    const b = await create('bbb');

    await Promise.allSettled([a.connect(HOST, b.port), b.connect(HOST, a.port)]);
    await sleep(200);

    expect(a.getPeers()).toEqual([expect.objectContaining({ id: 'bbb', online: true })]);
    expect(b.getPeers()).toEqual([expect.objectContaining({ id: 'aaa', online: true })]);

    // Cada mensagem chega uma única vez.
    const got: string[] = [];
    b.on('message', (m) => got.push(m.text));
    a.sendText('bbb', 'uma vez');
    await sleep(100);
    expect(got).toEqual(['uma vez']);
  });

  it('envia só para o contato escolhido', async () => {
    const a = await create('aaa');
    const b = await create('bbb');
    const c = await create('ccc');
    const bReady = next(b, 'peer', onlineWith('aaa'));
    const cReady = next(c, 'peer', onlineWith('aaa'));
    await a.connect(HOST, b.port);
    await a.connect(HOST, c.port);
    await Promise.all([bReady, cReady]);

    const atC: string[] = [];
    c.on('message', (m) => atC.push(m.text));
    const atB = next(b, 'message');
    a.sendText('bbb', 'só pra você');
    expect(await atB).toMatchObject({ from: 'aaa', text: 'só pra você' });
    await sleep(100);
    expect(atC).toEqual([]);
  });

  it('recusa enviar para contato offline ou desconhecido', async () => {
    const a = await create('aaa');
    const b = await create('bbb', 'Bia');
    const bReady = next(a, 'peer', onlineWith('bbb'));
    await a.connect(HOST, b.port);
    await bReady;

    const offline = next(a, 'peer', (p) => p.id === 'bbb' && !p.online);
    await b.stop();
    managers = managers.filter((m) => m !== b);
    await offline;

    expect(() => a.sendText('bbb', 'oi')).toThrow('Bia está offline.');
    expect(() => a.sendNudge('bbb')).toThrow('Bia está offline.');
    expect(() => a.sendText('nao-existe', 'oi')).toThrow('Contato desconhecido.');
  });

  it('limite de chamar atenção e de wink é por contato', async () => {
    const a = await create('aaa');
    const b = await create('bbb');
    const c = await create('ccc');
    const bReady = next(b, 'peer', onlineWith('aaa'));
    const cReady = next(c, 'peer', onlineWith('aaa'));
    await a.connect(HOST, b.port);
    await a.connect(HOST, c.port);
    await Promise.all([bReady, cReady]);

    a.sendNudge('bbb', 1_000_000);
    expect(() => a.sendNudge('bbb', 1_000_500)).toThrow(/Aguarde/);
    expect(a.sendNudge('ccc', 1_000_500)).toMatchObject({ self: true });

    a.sendWink('bbb', 'fogos', 2_000_000);
    expect(() => a.sendWink('bbb', 'fogos', 2_000_500)).toThrow(/Aguarde/);
    expect(a.sendWink('ccc', 'fogos', 2_000_500)).toMatchObject({ self: true });
  });

  it('via mDNS só o ID menor disca', async () => {
    const a = await create('aaa');
    const b = await create('bbb');

    b.discovered('aaa', HOST, a.port); // bbb > aaa: não disca
    await sleep(150);
    expect(a.getPeers()).toHaveLength(0);

    const ready = next(b, 'peer', onlineWith('aaa'));
    a.discovered('bbb', HOST, b.port);
    await ready;
    expect(a.getPeers()).toEqual([expect.objectContaining({ id: 'bbb', online: true })]);
  });

  it('reconecta sozinho a um alvo conhecido quando o peer volta', async () => {
    const a = await create('aaa');
    let b = await create('bbb');
    const port = b.port;
    await a.connect(HOST, port);

    const offline = next(a, 'peer', (p) => p.id === 'bbb' && !p.online);
    await b.stop();
    managers = managers.filter((m) => m !== b);
    await offline;

    const back = next(a, 'peer', onlineWith('bbb'));
    b = new PeerManager({ id: 'bbb', name: 'bbb', host: HOST, port });
    await b.start();
    managers.push(b);
    expect(await back).toMatchObject({ id: 'bbb', online: true });
  });

  it('usa a porta preferida e cai para dinâmica se estiver ocupada', async () => {
    const a = await create('aaa');
    const b = new PeerManager({ id: 'bbb', name: 'bbb', host: HOST, port: a.port, fallbackToRandomPort: true });
    await b.start();
    managers.push(b);
    expect(b.port).toBeGreaterThan(0);
    expect(b.port).not.toBe(a.port);

    const c = new PeerManager({ id: 'ccc', name: 'ccc', host: HOST, port: a.port });
    await expect(c.start()).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('fecha conexão consigo mesmo', async () => {
    const a = await create('aaa');
    await expect(a.connect(HOST, a.port)).rejects.toMatchObject({ code: 'SELF_CONNECTION', message: /próprio computador/ });
    expect(a.getPeers()).toHaveLength(0);
  });
});
