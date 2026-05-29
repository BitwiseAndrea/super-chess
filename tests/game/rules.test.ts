// tests/game/rules.test.ts
// Targeted coverage for src/game/rules.ts — the layer that combines the
// chess engine's move generation with Super Chess card effects.

import { describe, it, expect } from 'vitest';
import { parseFEN, STARTING_FEN } from '../../src/engine/fen.ts';
import { createSuperState } from '../../src/game/types.ts';
import { Deck } from '../../src/cards/deck.ts';
import { buildDeck } from '../../src/cards/definitions.ts';
import { getSuperChessLegalMoves, tickSuperState } from '../../src/game/rules.ts';
import type { SuperChessState } from '../../src/game/types.ts';

function makeState(fen = STARTING_FEN): SuperChessState {
  return {
    chess: parseFEN(fen),
    deck: new Deck(buildDeck()).getState(),
    superState: createSuperState(),
    history: [],
    result: null,
    snapshots: [],
  };
}

describe('getSuperChessLegalMoves', () => {
  it('throws when `color` does not match chess.turn (no silent guessing)', () => {
    const state = makeState(); // chess.turn === 'w'
    expect(() => getSuperChessLegalMoves(state, 'b')).toThrow(
      /chess\.turn is w but caller asked for b/i,
    );
  });

  it('returns white\u2019s opening moves when color matches', () => {
    const state = makeState();
    const moves = getSuperChessLegalMoves(state, 'w');
    expect(moves.length).toBe(20); // 8 pawns × 2 + 4 knight moves
    // Every returned move is for a white piece.
    for (const m of moves) {
      expect(m.movingPiece[0]).toBe('w');
    }
  });

  it('returns black\u2019s opening moves when color and turn are both black', () => {
    const state = makeState();
    state.chess.turn = 'b';
    const moves = getSuperChessLegalMoves(state, 'b');
    expect(moves.length).toBe(20);
    for (const m of moves) {
      expect(m.movingPiece[0]).toBe('b');
    }
  });

  it('drops moves that would capture a shielded enemy piece', () => {
    // Reproduces the playtest bug: a shielded bishop on d4, black pawn
    // on e5, black to move. The `exd4` move was getting through because
    // the shield check lived in `validateSuperChessMove` which is never
    // called on the commit path. After the fix, the shielded-capture
    // move must NOT appear in the legal-moves list.
    const state = makeState('4k3/8/8/4p3/3B4/8/8/4K3 b - - 0 1');
    state.superState.shieldedSquares.set(35, 'w'); // d4
    state.superState.shieldTurns.set(35, 1);
    const moves = getSuperChessLegalMoves(state, 'b');
    const exd4 = moves.find((m) => m.from === 28 && m.to === 35);
    expect(exd4).toBeUndefined();
    // Sanity: the pawn can still push forward (e5 \u2192 e4) since that's
    // not a capture into a shielded square.
    const e5e4 = moves.find((m) => m.from === 28 && m.to === 36);
    expect(e5e4).toBeDefined();
  });

  it('still allows non-capture moves landing on a non-shielded square', () => {
    // Defensive: the shield filter must not over-aggressively drop moves.
    const state = makeState('4k3/8/8/8/3B4/8/4P3/4K3 w - - 0 1');
    state.superState.shieldedSquares.set(35, 'w');
    state.superState.shieldTurns.set(35, 1);
    const moves = getSuperChessLegalMoves(state, 'w');
    expect(moves.length).toBeGreaterThan(0);
    // White's own pawn can move forward; the shield doesn't gate own moves.
    const e2e4 = moves.find((m) => m.from === 52 && m.to === 36);
    expect(e2e4).toBeDefined();
  });
});

describe('tickSuperState', () => {
  it('preserves extraMoveRemaining (regression: Extra Move card was dead)', () => {
    const ss = createSuperState();
    ss.extraMoveRemaining = 'w';
    const ticked = tickSuperState(ss);
    expect(ticked.extraMoveRemaining).toBe('w');
  });

  it('clears the per-turn flags', () => {
    const ss = createSuperState();
    ss.knightsPathSquare = 12;
    ss.ghostStepSquare = 13;
    ss.fortifiedPawnSquare = 14;
    ss.fogActive = true;
    const ticked = tickSuperState(ss);
    expect(ticked.knightsPathSquare).toBeNull();
    expect(ticked.ghostStepSquare).toBeNull();
    expect(ticked.fortifiedPawnSquare).toBeNull();
    expect(ticked.fogActive).toBe(false);
  });
});
