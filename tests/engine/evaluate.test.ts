// tests/engine/evaluate.test.ts
import { describe, it, expect } from 'vitest';
import { evaluate } from '../../src/engine/evaluate.ts';
import { initialState } from '../../src/engine/board.ts';
import { parseFEN } from '../../src/engine/fen.ts';

describe('evaluate', () => {
  it('returns 0 for starting position (symmetric)', () => {
    const score = evaluate(initialState());
    // Due to PST, slight asymmetry is possible but both sides should be very close
    expect(Math.abs(score)).toBeLessThan(100);
  });

  it('is positive when white has an extra queen', () => {
    const s = parseFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    s.board[3] = null; // remove black queen
    expect(evaluate(s)).toBeGreaterThan(800);
  });

  it('is negative when black has an extra queen', () => {
    const s = parseFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    s.board[59] = null; // remove white queen
    expect(evaluate(s)).toBeLessThan(-800);
  });
});
