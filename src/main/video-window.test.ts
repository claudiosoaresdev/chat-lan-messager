import { describe, expect, it } from 'vitest';
import { defaultBounds, parseBounds, restoreBounds, snapToEdge } from './video-window';

const area = { x: 0, y: 25, width: 1440, height: 875 };

describe('snapToEdge', () => {
  it('encosta na borda mais próxima dentro do limite', () => {
    expect(snapToEdge({ x: 10, y: 40, width: 480, height: 270 }, area)).toEqual({ x: 0, y: 25, width: 480, height: 270 });
    expect(snapToEdge({ x: 950, y: 620, width: 480, height: 270 }, area)).toEqual({ x: 960, y: 630, width: 480, height: 270 });
  });

  it('longe das bordas não mexe', () => {
    const b = { x: 300, y: 300, width: 480, height: 270 };
    expect(snapToEdge(b, area)).toEqual(b);
  });
});

describe('defaultBounds', () => {
  it('canto inferior direito com folga', () => {
    expect(defaultBounds(area)).toEqual({ x: 1440 - 480 - 16, y: 25 + 875 - 270 - 16, width: 480, height: 270 });
  });
});

describe('restoreBounds', () => {
  it('mantém a posição que cabe', () => {
    const b = { x: 100, y: 100, width: 480, height: 270 };
    expect(restoreBounds(b, [area])).toEqual(b);
  });

  it('puxa para dentro quando sai um pouco', () => {
    expect(restoreBounds({ x: 1200, y: 100, width: 480, height: 270 }, [area])).toEqual({ x: 960, y: 100, width: 480, height: 270 });
  });

  it('monitor que sumiu: null', () => {
    expect(restoreBounds({ x: 3000, y: 100, width: 480, height: 270 }, [area])).toBeNull();
    expect(restoreBounds(null, [area])).toBeNull();
  });
});

describe('parseBounds', () => {
  it('valida', () => {
    expect(parseBounds({ x: 1, y: 2, width: 480, height: 270 })).toEqual({ x: 1, y: 2, width: 480, height: 270 });
    expect(parseBounds({ x: 1, y: 2, width: 10, height: 270 })).toBeNull();
    expect(parseBounds({ x: '1', y: 2, width: 480, height: 270 })).toBeNull();
    expect(parseBounds(null)).toBeNull();
  });
});
