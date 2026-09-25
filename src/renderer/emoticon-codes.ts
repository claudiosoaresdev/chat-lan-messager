// Emoticons no estilo do MSN: atalhos de texto → id do desenho. Sem DOM aqui (testável).

export interface Emoticon {
  id: string;
  name: string;
  /** O primeiro é o mostrado na dica; todos são reconhecidos. */
  codes: string[];
}

export const EMOTICONS: Emoticon[] = [
  { id: 'sorriso', name: 'Sorriso', codes: [':)', ':-)'] },
  { id: 'gargalhada', name: 'Gargalhada', codes: [':D', ':-D', ':d', ':-d'] },
  { id: 'piscada', name: 'Piscada', codes: [';)', ';-)'] },
  { id: 'surpreso', name: 'Surpreso', codes: [':O', ':-O', ':o', ':-o'] },
  { id: 'lingua', name: 'Mostrando a língua', codes: [':P', ':-P', ':p', ':-p'] },
  { id: 'oculos', name: 'Legal', codes: ['(H)', '(h)'] },
  { id: 'bravo', name: 'Bravo', codes: [':@', ':-@'] },
  { id: 'envergonhado', name: 'Envergonhado', codes: [':$', ':-$'] },
  { id: 'confuso', name: 'Confuso', codes: [':S', ':-S', ':s', ':-s'] },
  { id: 'triste', name: 'Triste', codes: [':(', ':-('] },
  { id: 'chorando', name: 'Chorando', codes: [":'("] },
  { id: 'sem-palavras', name: 'Sem palavras', codes: [':|', ':-|'] },
  { id: 'nerd', name: 'Nerd', codes: ['8-|'] },
  { id: 'sonolento', name: 'Com sono', codes: ['|-)'] },
  { id: 'anjo', name: 'Anjo', codes: ['(A)', '(a)'] },
  { id: 'diabinho', name: 'Diabinho', codes: ['(6)'] },
  { id: 'coracao', name: 'Coração', codes: ['(L)', '(l)', '<3'] },
  { id: 'coracao-partido', name: 'Coração partido', codes: ['(U)', '(u)'] },
  { id: 'joinha', name: 'Joinha', codes: ['(Y)', '(y)'] },
  { id: 'negativo', name: 'Negativo', codes: ['(N)', '(n)'] },
  { id: 'beijo', name: 'Beijo', codes: ['(K)', '(k)'] },
  { id: 'rosa', name: 'Rosa', codes: ['(F)', '(f)'] },
  { id: 'estrela', name: 'Estrela', codes: ['(*)'] },
  { id: 'sol', name: 'Sol', codes: ['(#)'] },
  { id: 'lua', name: 'Lua', codes: ['(S)'] },
  { id: 'arco-iris', name: 'Arco-íris', codes: ['(R)', '(r)'] },
  { id: 'cafe', name: 'Café', codes: ['(C)', '(c)'] },
  { id: 'cerveja', name: 'Cerveja', codes: ['(B)', '(b)'] },
  { id: 'bolo', name: 'Bolo', codes: ['(^)'] },
  { id: 'presente', name: 'Presente', codes: ['(G)', '(g)'] },
  { id: 'nota', name: 'Música', codes: ['(8)'] },
  { id: 'lampada', name: 'Ideia', codes: ['(I)', '(i)'] },
  { id: 'relogio', name: 'Relógio', codes: ['(O)', '(o)'] },
  { id: 'gato', name: 'Gato', codes: ['(@)'] },
  { id: 'cachorro', name: 'Cachorro', codes: ['(&)'] },
];

export type Token = { text: string } | { emoticon: Emoticon; code: string };

const BY_CODE = new Map<string, Emoticon>();
for (const e of EMOTICONS) for (const c of e.codes) BY_CODE.set(c, e);

// Códigos mais longos primeiro, para ":-)" ganhar de ":-" etc.
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERN = new RegExp([...BY_CODE.keys()].sort((a, b) => b.length - a.length).map(escape).join('|'), 'g');

/** Separa o texto em pedaços de texto e emoticons. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const at = m.index ?? 0;
    const code = m[0];
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ emoticon: BY_CODE.get(code) as Emoticon, code });
    last = at + code.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
