// tests/ai/minimaxAI.test.ts
// Coverage for MinimaxAI's invariants. The AI defers to state.chess.turn
// internally, so calling it with a mismatched `color` arg used to silently
// return a move for the wrong side — which corrupted real game state in the
// user-reported bug. The assertion makes the contract explicit.

import { describe, it, expect } from 'vitest';
import { MinimaxAI } from '../../src/ai/minimaxAI.ts';
import { parseFEN, STARTING_FEN } from '../../src/engine/fen.ts';
import { createSuperState } from '../../src/game/types.ts';
import { Deck } from '../../src/cards/deck.ts';
import { buildDeck } from '../../src/cards/definitions.ts';
import type { SuperChessState } from '../../src/game/types.ts';

function makeState(): SuperChessState {
  return {
    chess: parseFEN(STARTING_FEN),
    deck: new Deck(buildDeck()).getState(),
    superState: createSuperState(),
    history: [],
    result: null,
    snapshots: [],
  };
}

describe('MinimaxAI.selectMove', () => {
  it('returns a legal move when color matches chess.turn', async () => {
    const ai = new MinimaxAI(1);
    const state = makeState();
    const move = await ai.selectMove(state, 'w');
    expect(move.movingPiece[0]).toBe('w');
  });

  it('throws when color does not match chess.turn (no silent guessing)', async () => {
    const ai = new MinimaxAI(1);
    const state = makeState(); // chess.turn === 'w'
    await expect(ai.selectMove(state, 'b')).rejects.toThrow(
      /chess\.turn is w but caller asked for b/i,
    );
  });
});
