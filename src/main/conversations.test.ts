import { describe, expect, it } from 'vitest';
import { Conversations } from './conversations';

const text = (t: string) => ({
  kind: 'text' as const,
  message: { from: 'bbb', fromName: 'Bia', text: t, ts: 1, self: false },
});

const image = (n: number) => ({
  kind: 'image' as const,
  image: { from: 'bbb', fromName: 'Bia', name: 'x.png', mime: 'image/png' as const, size: n, ts: 1, self: false, data: new Uint8Array(n) },
});

describe('Conversations', () => {
  it('guarda por contato com seq crescente e hora local', () => {
    let now = 100;
    const c = new Conversations(200, () => now);
    const a = c.add('bbb', text('oi'));
    now = 200;
    const b = c.add('ccc', text('olá'));
    const d = c.add('bbb', { kind: 'system', text: 'Bia saiu' });

    expect(a).toMatchObject({ seq: 1, at: 100, kind: 'text' });
    expect(b.seq).toBe(2);
    expect(d).toEqual({ seq: 3, at: 200, kind: 'system', text: 'Bia saiu' });
    expect(c.get('bbb').map((i) => i.seq)).toEqual([1, 3]);
    expect(c.get('ccc').map((i) => i.seq)).toEqual([2]);
  });

  it('sabe se há conversa e devolve lista vazia para contato sem histórico', () => {
    const c = new Conversations();
    expect(c.has('bbb')).toBe(false);
    expect(c.get('bbb')).toEqual([]);
    c.add('bbb', text('oi'));
    expect(c.has('bbb')).toBe(true);
  });

  it('descarta os mais antigos ao passar do teto', () => {
    const c = new Conversations(3);
    for (const t of ['1', '2', '3', '4', '5']) c.add('bbb', text(t));
    expect(c.get('bbb').map((i) => (i.kind === 'text' ? i.message.text : ''))).toEqual(['3', '4', '5']);
  });

  it('get devolve cópia', () => {
    const c = new Conversations();
    c.add('bbb', text('oi'));
    c.get('bbb').pop();
    expect(c.get('bbb')).toHaveLength(1);
  });

  it('clear apaga tudo', () => {
    const c = new Conversations();
    c.add('bbb', text('oi'));
    c.clear();
    expect(c.has('bbb')).toBe(false);
    expect(c.get('bbb')).toEqual([]);
  });

  it('descarta os mais antigos quando as imagens passam do teto de bytes', () => {
    const c = new Conversations(200, Date.now, 10);
    c.add('bbb', text('oi'));
    c.add('bbb', image(4));
    c.add('bbb', image(4));
    c.add('bbb', image(4));

    const kinds = c.get('bbb').map((i) => i.kind);
    expect(kinds).toEqual(['image', 'image']);
  });

  it('liga a prévia só à mensagem certa, do lado certo, uma vez', () => {
    const c = new Conversations();
    const mine = { kind: 'text' as const, message: { from: 'me', fromName: 'Eu', text: 'https://a.com', ts: 1, self: true, id: 'm1' } };
    const theirs = { kind: 'text' as const, message: { ...text('https://b.com').message, id: 'm2' } };
    c.add('bbb', mine);
    c.add('bbb', theirs);
    const preview = { url: 'https://a.com/', title: 'A' };
    // Contato não põe prévia numa mensagem minha; id desconhecido é ignorado.
    expect(c.attachPreview('bbb', 'm1', false, preview)).toBeNull();
    expect(c.attachPreview('bbb', 'zz', true, preview)).toBeNull();
    expect(c.attachPreview('ccc', 'm1', true, preview)).toBeNull();
    const item = c.attachPreview('bbb', 'm1', true, preview);
    expect(item).toMatchObject({ kind: 'text', preview });
    expect(c.attachPreview('bbb', 'm1', true, { url: 'https://x.com/', title: 'X' })).toBeNull();
    expect(c.attachPreview('bbb', 'm2', false, { url: 'https://b.com/', title: 'B' })).not.toBeNull();
    expect(c.get('bbb').map((i) => (i.kind === 'text' ? i.preview?.title : null))).toEqual(['A', 'B']);
  });

  it('miniaturas das prévias contam no teto de bytes', () => {
    const c = new Conversations(200, Date.now, 10);
    c.add('bbb', image(6));
    c.add('bbb', { kind: 'text', message: { ...text('x').message, id: 'm1' } });
    c.attachPreview('bbb', 'm1', false, { url: 'https://a.com/', title: 'A', image: { mime: 'image/jpeg', data: new Uint8Array(6) } });
    expect(c.get('bbb').map((i) => i.kind)).toEqual(['text']);
  });

  it('seq continua crescendo depois do clear', () => {
    const c = new Conversations();
    const a = c.add('bbb', text('oi'));
    c.clear();
    const b = c.add('bbb', text('oi de novo'));
    expect(b.seq).toBeGreaterThan(a.seq);
  });
});
