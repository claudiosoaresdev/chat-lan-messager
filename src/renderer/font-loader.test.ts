import { describe, expect, it } from 'vitest';
import { fontStack } from './font-loader';

describe('fontStack', () => {
  it('clássica usa a pilha do sistema', () => {
    expect(fontStack('Verdana')).toBe('Verdana, Geneva, sans-serif');
  });
  it('Google usa a própria família e um genérico da categoria', () => {
    expect(fontStack('Roboto')).toBe("'Roboto', 'Segoe UI', sans-serif");
    expect(fontStack('Merriweather')).toBe("'Merriweather', Georgia, serif");
    expect(fontStack('Dancing Script')).toBe("'Dancing Script', 'Comic Sans MS', cursive");
    expect(fontStack('Roboto Mono')).toBe("'Roboto Mono', 'Courier New', monospace");
  });
  it('desconhecida cai na padrão', () => {
    expect(fontStack('X')).toBe("'Segoe UI', Tahoma, 'Helvetica Neue', sans-serif");
  });
});
