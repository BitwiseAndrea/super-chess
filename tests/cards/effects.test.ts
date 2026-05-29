// tests/cards/effects.test.ts
import { describe, it, expect } from 'vitest';
import { CARD_EFFECTS } from '../../src/cards/effects.ts';
import { parseFEN, STARTING_FEN } from '../../src/engine/fen.ts';
import { createSuperState } from '../../src/game/types.ts';
import { buildDeck } from '../../src/cards/definitions.ts';
import { Deck } from '../../src/cards/deck.ts';
import type { SuperChessState } from '../../src/game/types.ts';
import { algebraicToSquare } from '../../src/engine/board.ts';

function makeState(fen = STARTING_FEN): SuperChessState {
  const deck = new Deck(buildDeck());
  return {
    chess: parseFEN(fen),
    deck: deck.getState(),
    superState: createSuperState(),
    history: [],
    result: null,
    snapshots: [],
  };
}

describe('Freeze effect', () => {
  it('adds target square to frozenSquares with a 1-ply timer', () => {
    const state = makeState();
    const sq = algebraicToSquare('e7'); // black pawn
    const { newState } = CARD_EFFECTS['Freeze'](state, 'w', { oppPieceSquare: sq });
    expect(newState.superState.frozenSquares.has(sq)).toBe(true);
    // 1, not 2 — Freeze is a POST card, so the setter's move-tick has
    // already happened by the time this fires. The opponent's tick will
    // then drop it from 1 → 0, so the freeze is gone by the start of our
    // next turn (which is what playtesters expect). The full lifecycle
    // regression lives in tests/cards/all-cards.test.ts.
    expect(newState.superState.frozenSquares.get(sq)).toBe(1);
  });

  it('cannot freeze the king', () => {
    const state = makeState();
    const kingSq = algebraicToSquare('e8'); // black king
    const { newState, logEntry } = CARD_EFFECTS['Freeze'](state, 'w', { oppPieceSquare: kingSq });
    expect(newState.superState.frozenSquares.has(kingSq)).toBe(false);
    expect(logEntry).toContain('king');
  });
});

describe('Shield effect', () => {
  it('adds own piece to shieldedSquares', () => {
    const state = makeState();
    const sq = algebraicToSquare('e2'); // white pawn
    const { newState } = CARD_EFFECTS['Shield'](state, 'w', { ownPieceSquare: sq });
    expect(newState.superState.shieldedSquares.has(sq)).toBe(true);
    // 1 ply: Shield is POST, so opp's tick drops it to 0 before our next
    // turn starts. See SuperState type comment.
    expect(newState.superState.shieldTurns.get(sq)).toBe(1);
  });
});

describe('Coup effect', () => {
  it('removes an opponent piece', () => {
    // Place white queen where it attacks e7
    const state = makeState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    // Give white a queen that attacks d7 — use a custom position
    const custom = makeState('8/3p4/8/8/8/8/8/3Q3K w - - 0 1');
    const sq = algebraicToSquare('d7'); // black pawn
    const { newState } = CARD_EFFECTS['Coup'](custom, 'w', { oppPieceSquare: sq });
    expect(newState.chess.board[sq]).toBeNull();
  });

  it('cannot coup the king', () => {
    const state = makeState('8/4k3/8/8/8/8/8/4Q2K w - - 0 1');
    const kingSq = algebraicToSquare('e7');
    const { logEntry } = CARD_EFFECTS['Coup'](state, 'w', { oppPieceSquare: kingSq });
    expect(logEntry).toContain('king');
  });
});

describe('Teleport effect', () => {
  it('moves piece to empty square', () => {
    const state = makeState('8/8/8/8/8/8/8/4K2R w - - 0 1');
    const from = algebraicToSquare('h1'); // white rook
    const to = algebraicToSquare('h5');   // empty
    const { newState } = CARD_EFFECTS['Teleport'](state, 'w', { ownPieceSquare: from, square: to });
    expect(newState.chess.board[from]).toBeNull();
    expect(newState.chess.board[to]).toBe('wR');
  });
});

describe('Pawn Storm effect', () => {
  it('advances white pawns one square', () => {
    const state = makeState();
    // White pawns start at row 6 (rank 2)
    const { newState } = CARD_EFFECTS['Pawn Storm'](state, 'w', {});
    // e-pawn should advance from e2 (sq 52) to e3 (sq 44)
    expect(newState.chess.board[44]).toBe('wP'); // e3
    expect(newState.chess.board[52]).toBeNull(); // e2 empty
  });
});

describe('Foul Ground effect', () => {
  it('sets foul square for opponent', () => {
    const state = makeState();
    const sq = algebraicToSquare('e4');
    const { newState } = CARD_EFFECTS['Foul Ground'](state, 'w', { square: sq });
    expect(newState.superState.foulSquares.get(sq)).toBe('b');
  });
});

describe('Extra Move effect', () => {
  it('sets extraMoveRemaining for the color', () => {
    const state = makeState();
    const { newState } = CARD_EFFECTS['Extra Move'](state, 'w', {});
    expect(newState.superState.extraMoveRemaining).toBe('w');
  });
});

describe("Knight's Path effect", () => {
  it('sets knightsPathSquare', () => {
    const state = makeState();
    const sq = algebraicToSquare('e2');
    const { newState } = CARD_EFFECTS["Knight's Path"](state, 'w', { ownPieceSquare: sq });
    expect(newState.superState.knightsPathSquare).toBe(sq);
  });
});
