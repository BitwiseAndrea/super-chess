// tests/cards/targeting.test.ts
// Unit tests for src/cards/targeting.ts — the pure helpers shared by the
// play controller's targeting UI, the bot's heuristic AI, and the runtime
// card effects. Keeping these in sync is exactly what prevents the
// "highlighted square, then no-op" bug we hit with Resurrection.

import { describe, it, expect } from 'vitest';
import { parseFEN, STARTING_FEN } from '../../src/engine/fen.ts';
import { algebraicToSquare } from '../../src/engine/board.ts';
import { Deck } from '../../src/cards/deck.ts';
import { buildDeck } from '../../src/cards/definitions.ts';
import { createSuperState } from '../../src/game/types.ts';
import {
  resurrectionLandingSquares,
  hasResurrectableCapturedPiece,
  pawnRetreatDestinations,
} from '../../src/cards/targeting.ts';
import type { SuperChessState } from '../../src/game/types.ts';
import type { PieceStr } from '../../src/engine/types.ts';

function makeState(fen: string = STARTING_FEN): SuperChessState {
  return {
    chess: parseFEN(fen),
    deck: new Deck(buildDeck()).getState(),
    superState: createSuperState(),
    history: [],
    result: null,
    snapshots: [],
  };
}

const sq = algebraicToSquare;

describe('resurrectionLandingSquares', () => {
  it('on the standard starting position the back ranks are full → empty set', () => {
    const state = makeState();
    expect(resurrectionLandingSquares(state, 'w').size).toBe(0);
    expect(resurrectionLandingSquares(state, 'b').size).toBe(0);
  });

  it('white\u2019s candidates live on rows 6 (rank 2) and 7 (rank 1) only', () => {
    // Clear the entire board so every empty square is candidate-eligible.
    const state = makeState('8/8/8/8/8/8/8/8 w - - 0 1');
    const wTargets = resurrectionLandingSquares(state, 'w');
    expect(wTargets.size).toBe(16); // 2 full ranks
    for (const s of wTargets) {
      const row = s >> 3;
      expect(row === 6 || row === 7).toBe(true);
    }
  });

  it('black\u2019s candidates live on rows 0 (rank 8) and 1 (rank 7) only', () => {
    const state = makeState('8/8/8/8/8/8/8/8 b - - 0 1');
    const bTargets = resurrectionLandingSquares(state, 'b');
    expect(bTargets.size).toBe(16);
    for (const s of bTargets) {
      const row = s >> 3;
      expect(row === 0 || row === 1).toBe(true);
    }
  });

  it('excludes squares occupied by ANY piece (own or opponent)', () => {
    // Empty board, then drop one white pawn on b2 and one black pawn on c2.
    // (c2 is white's back rank but occupied by an opponent piece.)
    const state = makeState('8/8/8/8/8/8/8/8 w - - 0 1');
    state.chess.board[sq('b2')] = 'wP' as PieceStr;
    state.chess.board[sq('c2')] = 'bP' as PieceStr;
    const wTargets = resurrectionLandingSquares(state, 'w');
    expect(wTargets.has(sq('b2'))).toBe(false);
    expect(wTargets.has(sq('c2'))).toBe(false);
    // Other rank-2 / rank-1 squares should still be candidates.
    expect(wTargets.has(sq('a2'))).toBe(true);
    expect(wTargets.has(sq('a1'))).toBe(true);
    expect(wTargets.has(sq('h1'))).toBe(true);
  });

  it('does NOT include the user\u2019s actual bug squares (c6 / a8 / d5) for white', () => {
    // The exact targets the user tried in the bug report. The whole point of
    // this fix is that the UI would never offer these.
    const state = makeState();
    const wTargets = resurrectionLandingSquares(state, 'w');
    expect(wTargets.has(sq('c6'))).toBe(false);
    expect(wTargets.has(sq('a8'))).toBe(false);
    expect(wTargets.has(sq('d5'))).toBe(false);
  });
});

describe('hasResurrectableCapturedPiece', () => {
  it('returns false on a fresh game (no one has captured anything)', () => {
    const state = makeState();
    expect(hasResurrectableCapturedPiece(state, 'w')).toBe(false);
    expect(hasResurrectableCapturedPiece(state, 'b')).toBe(false);
  });

  it('reads from capturedByColor.get(OPPONENT) (i.e. our LOST pieces)', () => {
    const state = makeState();
    // Black captured one of our knights → it should sit in capturedByColor[b].
    state.superState.capturedByColor.get('b')!.push('wN' as PieceStr);
    expect(hasResurrectableCapturedPiece(state, 'w')).toBe(true);
    // Doesn't affect black's resurrection eligibility (we lost it, not them).
    expect(hasResurrectableCapturedPiece(state, 'b')).toBe(false);
  });

  it('only counts R/B/N (minor + rook) — pawns and queens are not eligible', () => {
    const state = makeState();
    state.superState.capturedByColor.get('b')!.push('wP' as PieceStr);
    expect(hasResurrectableCapturedPiece(state, 'w')).toBe(false);
    state.superState.capturedByColor.get('b')!.push('wQ' as PieceStr);
    expect(hasResurrectableCapturedPiece(state, 'w')).toBe(false);
    state.superState.capturedByColor.get('b')!.push('wK' as PieceStr);
    expect(hasResurrectableCapturedPiece(state, 'w')).toBe(false);
    // Now drop in a rook — eligible.
    state.superState.capturedByColor.get('b')!.push('wR' as PieceStr);
    expect(hasResurrectableCapturedPiece(state, 'w')).toBe(true);
  });

  it('matches the exact captured-pile from the user\u2019s bug report', () => {
    // The snapshot showed: capturedByColor.b = [wP, wN, wP, wN]. The user
    // SHOULD be able to engage Resurrection (they have a captured wN), and
    // before the fix they were being given empty target squares to click
    // on anywhere on the board.
    const state = makeState();
    state.superState.capturedByColor.set('b', [
      'wP', 'wN', 'wP', 'wN',
    ] as PieceStr[]);
    expect(hasResurrectableCapturedPiece(state, 'w')).toBe(true);
  });

  it('ignores pieces of the wrong color in the pile (defense-in-depth)', () => {
    const state = makeState();
    // Defensive: if for some reason a black piece ended up in capturedByColor[b]
    // (shouldn't happen but is harmless to check), it should NOT count for
    // white's resurrection eligibility.
    state.superState.capturedByColor.set('b', ['bN' as PieceStr]);
    expect(hasResurrectableCapturedPiece(state, 'w')).toBe(false);
  });
});

describe('pawnRetreatDestinations', () => {
  it('returns up to 3 squares: straight back + two diagonals', () => {
    // White pawn on e4 with empty d3 / e3 / f3.
    const state = makeState('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1');
    const dests = new Set(pawnRetreatDestinations(sq('e4'), 'w', state.chess.board));
    expect(dests.size).toBe(3);
    expect(dests.has(sq('d3'))).toBe(true);
    expect(dests.has(sq('e3'))).toBe(true);
    expect(dests.has(sq('f3'))).toBe(true);
  });

  it('drops occupied destinations from the candidate set', () => {
    // White pawn on e4. White knight on e3 blocks straight back.
    // Black knight on d3 blocks one diagonal. f3 stays open.
    const state = makeState('4k3/8/8/8/4P3/3nN3/8/4K3 w - - 0 1');
    const dests = new Set(pawnRetreatDestinations(sq('e4'), 'w', state.chess.board));
    expect(dests.size).toBe(1);
    expect(dests.has(sq('f3'))).toBe(true);
    expect(dests.has(sq('e3'))).toBe(false); // own piece blocks
    expect(dests.has(sq('d3'))).toBe(false); // opp piece blocks (no capture)
  });

  it('clips file edges (a-file pawn has no left-diagonal option)', () => {
    // White pawn on a4. Only a3 (straight) and b3 (diagonal) are valid;
    // there's no file to the left of a.
    const state = makeState('4k3/8/8/8/P7/8/8/4K3 w - - 0 1');
    const dests = new Set(pawnRetreatDestinations(sq('a4'), 'w', state.chess.board));
    expect(dests.size).toBe(2);
    expect(dests.has(sq('a3'))).toBe(true);
    expect(dests.has(sq('b3'))).toBe(true);
  });

  it('clips file edges (h-file pawn has no right-diagonal option)', () => {
    const state = makeState('4k3/8/8/8/7P/8/8/4K3 w - - 0 1');
    const dests = new Set(pawnRetreatDestinations(sq('h4'), 'w', state.chess.board));
    expect(dests.size).toBe(2);
    expect(dests.has(sq('h3'))).toBe(true);
    expect(dests.has(sq('g3'))).toBe(true);
  });

  it('mirrors for black (backward = toward rank 8 = increasing row index goes the other way)', () => {
    // Black pawn on e5; backward for black is toward rank 8 (row 0),
    // so destinations are d6 / e6 / f6.
    const state = makeState('4k3/8/8/4p3/8/8/8/4K3 b - - 0 1');
    const dests = new Set(pawnRetreatDestinations(sq('e5'), 'b', state.chess.board));
    expect(dests.size).toBe(3);
    expect(dests.has(sq('d6'))).toBe(true);
    expect(dests.has(sq('e6'))).toBe(true);
    expect(dests.has(sq('f6'))).toBe(true);
  });

  it('returns empty when the pawn is already on its home rank', () => {
    // White pawn on e1 has no row 8 (i.e. row index 8 is out of bounds).
    // This shouldn't happen in real games but the helper must not crash.
    const state = makeState('4k3/8/8/8/8/8/8/4P2K w - - 0 1');
    const dests = pawnRetreatDestinations(sq('e1'), 'w', state.chess.board);
    expect(dests).toEqual([]);
  });
});
