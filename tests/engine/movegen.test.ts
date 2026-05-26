// tests/engine/movegen.test.ts
import { describe, it, expect } from 'vitest';
import { generateLegal, isInCheck, applyMove, applyMoveInPlace, undoMove } from '../../src/engine/movegen.ts';
import { initialState, cloneState } from '../../src/engine/board.ts';
import { parseFEN } from '../../src/engine/fen.ts';
import { POSITIONS } from '../fixtures/positions.ts';

// Perft helper — counts nodes at given depth
function perft(state: ReturnType<typeof initialState>, depth: number): number {
  if (depth === 0) return 1;
  const moves = generateLegal(state);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    const saved = applyMoveInPlace(state, move);
    nodes += perft(state, depth - 1);
    undoMove(state, move, saved);
  }
  return nodes;
}

describe('Perft (chess engine correctness)', () => {
  it('perft(1) = 20 from start', () => {
    expect(generateLegal(initialState()).length).toBe(20);
  });

  it('perft(2) = 400 from start', () => {
    expect(perft(initialState(), 2)).toBe(400);
  });

  it('perft(3) = 8902 from start', () => {
    expect(perft(initialState(), 3)).toBe(8902);
  });
});

describe('Special moves', () => {
  it('detects check', () => {
    const s = parseFEN(POSITIONS.SCHOLARS_MATE);
    expect(isInCheck(s)).toBe(true);
  });

  it('stalemate: no legal moves, not in check', () => {
    const s = parseFEN(POSITIONS.STALEMATE);
    expect(generateLegal(s).length).toBe(0);
    expect(isInCheck(s)).toBe(false);
  });

  it('en passant capture is legal', () => {
    const s = parseFEN(POSITIONS.EN_PASSANT);
    // White pawn at e5 (sq 28) can capture d6 (sq 19) en passant
    const moves = generateLegal(s);
    const ep = moves.find((m) => m.enPassantCaptureSq !== null);
    expect(ep).toBeDefined();
  });

  it('castling both sides available', () => {
    const s = parseFEN(POSITIONS.CASTLING_AVAILABLE);
    const moves = generateLegal(s);
    const castles = moves.filter((m) => m.isCastle);
    expect(castles.length).toBe(2); // kingside and queenside
  });

  it('pawn promotion generates 4 moves per promotion square', () => {
    const s = parseFEN(POSITIONS.PROMOTION);
    const moves = generateLegal(s);
    const promos = moves.filter((m) => m.promotion !== null);
    expect(promos.length).toBe(4); // Q, R, B, N
  });
});

describe('applyMoveInPlace / undoMove', () => {
  it('is completely reversible', () => {
    const state = initialState();
    const before = cloneState(state);
    const moves = generateLegal(state);

    for (const move of moves.slice(0, 5)) {
      const saved = applyMoveInPlace(state, move);
      undoMove(state, move, saved);
      // State should be identical to before
      expect(state.board).toEqual(before.board);
      expect(state.turn).toBe(before.turn);
      expect(state.enPassantSquare).toBe(before.enPassantSquare);
      expect(state.castlingRights).toEqual(before.castlingRights);
    }
  });

  it('correctly switches turns', () => {
    const state = initialState();
    expect(state.turn).toBe('w');
    const moves = generateLegal(state);
    const saved = applyMoveInPlace(state, moves[0]);
    expect(state.turn).toBe('b');
    undoMove(state, moves[0], saved);
    expect(state.turn).toBe('w');
  });
});

describe('Frozen squares', () => {
  it('frozen piece cannot move', () => {
    const state = initialState();
    const frozen = new Set<number>([48]); // freeze white a-pawn
    const moves = generateLegal(state, frozen);
    expect(moves.some((m) => m.from === 48)).toBe(false);
  });
});
