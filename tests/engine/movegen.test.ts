// tests/engine/movegen.test.ts
import { describe, it, expect } from 'vitest';
import { generateLegal, isInCheck, applyMove, applyMoveInPlace, undoMove, toAlgebraic } from '../../src/engine/movegen.ts';
import type { Move } from '../../src/engine/types.ts';
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

  // Regression: castling rights used to revoke based on hardcoded square
  // indices (move.from === 63 → wKingside off, etc). With Super Chess card
  // effects shuffling pieces around (e.g. Swap or Trade), the rook on h1
  // might not be the ORIGINAL white rook — but it should still satisfy the
  // "rook on h1 + white kingside right + path clear" predicate. Conversely,
  // moving an unrelated rook FROM h1 (after a swap put it there) shouldn't
  // also revoke rights twice. These tests pin the post-refactor behavior.
  it('castles require an actual own rook on the corner (post-swap-onto-corner)', () => {
    // FEN: white king on e1, ROOK on h1 was replaced by a BISHOP via Swap,
    // and the real rook is on h2. wKingside is still flagged but should NOT
    // be usable — no rook is on h1.
    const s = parseFEN('4k3/8/8/8/8/8/7R/4K2B w K - 0 1');
    const moves = generateLegal(s);
    const castles = moves.filter((m) => m.isCastle);
    expect(castles.length).toBe(0); // no castling — h1 has a bishop, not a rook
  });

  it('moving a rook off h1 revokes white kingside (driven by piece identity)', () => {
    // Standard position with all castling rights.
    const s = parseFEN('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    const moves = generateLegal(s);
    const rookH1Move = moves.find((m) => m.from === 63 && m.movingPiece === 'wR')!;
    expect(rookH1Move).toBeDefined();
    const saved = applyMoveInPlace(s, rookH1Move);
    expect(s.castlingRights.wKingside).toBe(false);
    expect(s.castlingRights.wQueenside).toBe(true); // a1 rook didn't move
    undoMove(s, rookH1Move, saved);
    expect(s.castlingRights.wKingside).toBe(true); // restored
  });

  it('capturing the opponent rook on h8 revokes black kingside', () => {
    // White rook on h2 captures black rook on h8.
    const s = parseFEN('4k2r/8/8/8/8/8/7R/4K3 w k - 0 1');
    const captureH8 = generateLegal(s).find((m) => m.to === 7 && m.capture === 'bR')!;
    expect(captureH8).toBeDefined();
    const saved = applyMoveInPlace(s, captureH8);
    expect(s.castlingRights.bKingside).toBe(false);
    undoMove(s, captureH8, saved);
    expect(s.castlingRights.bKingside).toBe(true); // restored
  });

  it('moving the king revokes both castling rights for that color', () => {
    const s = parseFEN('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    const kingMove = generateLegal(s).find((m) => m.movingPiece === 'wK' && !m.isCastle)!;
    expect(kingMove).toBeDefined();
    const saved = applyMoveInPlace(s, kingMove);
    expect(s.castlingRights.wKingside).toBe(false);
    expect(s.castlingRights.wQueenside).toBe(false);
    undoMove(s, kingMove, saved);
    expect(s.castlingRights.wKingside).toBe(true);
    expect(s.castlingRights.wQueenside).toBe(true);
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

  // ─── Trade-induced regressions ──────────────────────────────────────────
  //
  // Super Chess card effects (notably Trade) can put a BLACK pawn on rank 2
  // or a WHITE pawn on rank 7. Both squares are legal promotion sources for
  // those colors:
  //   - bP on a2 promotes via a2→a1 (or diagonal captures from a2).
  //   - wP on a7 promotes via a7→a8.
  //
  // The original undoMove used a flaky heuristic to identify the promoting
  // pawn's color from `move.from`, which silently defaulted to 'wP' for
  // every promotion. That corrupted state.turn AND the board on un-promote
  // when the pawn was actually black, which leaked back into the minimax
  // search and made the bot return moves for the wrong color. See bug
  // report 2026-05-27.

  it('round-trips a BLACK pawn promotion from rank 2 (Trade-induced)', () => {
    // Black pawn on b2 promotes to bQ by capturing white rook on a1.
    // Construct the move directly so we test undo independent of generateLegal.
    const state = parseFEN('r6k/8/8/8/8/8/1p6/R6K b - - 0 1');
    const before = cloneState(state);

    const promo: Move = {
      movingPiece: 'bP',
      from: 49, to: 56, capture: 'wR', promotion: 'bQ',
      enPassantCaptureSq: null, newEnPassantSq: null, isCastle: false,
    };

    const saved = applyMoveInPlace(state, promo);
    expect(state.turn).toBe('w');
    expect(state.board[56]).toBe('bQ');
    expect(state.board[49]).toBeNull();

    undoMove(state, promo, saved);
    // Critical: state must be PERFECTLY restored — turn back to black,
    // black pawn back on b2, white rook back on a1.
    expect(state.turn).toBe('b');
    expect(state.board[49]).toBe('bP');
    expect(state.board[56]).toBe('wR');
    expect(state.board).toEqual(before.board);
    expect(state.castlingRights).toEqual(before.castlingRights);
  });

  it('round-trips a WHITE pawn promotion from rank 7 via capture', () => {
    // White pawn on a7 captures black rook on b8 diagonally, promoting.
    // (This case happens to work in the old code, but pin it anyway.)
    const state = parseFEN('1r5k/P7/8/8/8/8/8/R6K w - - 0 1');
    const before = cloneState(state);

    const promo: Move = {
      movingPiece: 'wP',
      from: 8, to: 1, capture: 'bR', promotion: 'wQ',
      enPassantCaptureSq: null, newEnPassantSq: null, isCastle: false,
    };

    const saved = applyMoveInPlace(state, promo);
    expect(state.turn).toBe('b');
    expect(state.board[1]).toBe('wQ');

    undoMove(state, promo, saved);
    expect(state.turn).toBe('w');
    expect(state.board[8]).toBe('wP');
    expect(state.board[1]).toBe('bR');
    expect(state.board).toEqual(before.board);
  });

  it('populates Move.movingPiece for every generated legal move', () => {
    const state = initialState();
    const moves = generateLegal(state);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      // Every generated move must carry the piece that started on `from`.
      expect(m.movingPiece).toBe(state.board[m.from]);
    }
  });

  it('toAlgebraic uses Move.movingPiece so it works AFTER applyMove', () => {
    // Reading the board AFTER apply would point at the destination piece —
    // toAlgebraic must rely on Move.movingPiece instead.
    const state = initialState();
    const moves = generateLegal(state);
    const knightMove = moves.find((m) => m.movingPiece === 'wN')!;
    expect(knightMove).toBeDefined();

    const after = applyMove(state, knightMove);
    // Even with the post-apply board (which has Nf3 say), we should still
    // produce a knight algebraic — not e.g. an empty-square error.
    const alg = toAlgebraic(after, knightMove);
    expect(alg.startsWith('N')).toBe(true);
  });

  it('does not corrupt state.turn when iterating ALL pseudo-legal black-promotion moves', () => {
    // The most damaging variant of the bug: iterating multiple black-pawn
    // promotion moves and watching state.turn drift after each undoMove.
    // bP on a2 can push a2→a1 (4 promotions) or capture b1 wN (4 promotions).
    // Every iteration's undoMove MUST restore state.turn to 'b'.
    const state = parseFEN('r6k/8/8/8/8/8/p7/1N5K b - - 0 1');
    const moves = generateLegal(state).filter((m) => m.from === 48);
    expect(moves.length).toBeGreaterThanOrEqual(4);

    for (const m of moves) {
      const saved = applyMoveInPlace(state, m);
      undoMove(state, m, saved);
      expect(state.turn).toBe('b');
      expect(state.board[48]).toBe('bP');
    }
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
