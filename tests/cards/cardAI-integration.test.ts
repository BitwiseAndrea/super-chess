// tests/cards/cardAI-integration.test.ts
//
// Integration tests for HeuristicCardAI \u2014 the contract is "if I tell
// you I want to play, the runtime can actually apply that card with
// the target I gave you". The phantom-pawn bug had a related root
// cause: the AI proposed targets that were silently invalid (Shield
// on an empty square, etc.) and downstream code rendered confusing
// states.
//
// These tests systematically check: across every hand-of-one against
// every interesting position, the AI's decision either says "don't
// play" or returns a (card, target) pair where the corresponding
// CARD_EFFECTS call MUTATES the state (i.e. it was a real play, not
// a no-op rejection). And the resulting state passes validateState.

import { describe, it, expect } from 'vitest';
import { HeuristicCardAI } from '../../src/ai/heuristicCardAI.ts';
import { CARD_EFFECTS } from '../../src/cards/effects.ts';
import { CARD_DEFINITIONS, buildDeck } from '../../src/cards/definitions.ts';
import { parseFEN } from '../../src/engine/fen.ts';
import { createSuperState } from '../../src/game/types.ts';
import { Deck } from '../../src/cards/deck.ts';
import { validateState } from '../../src/game/debug.ts';
import { algebraicToSquare } from '../../src/engine/board.ts';
import type { SuperChessState } from '../../src/game/types.ts';
import type { PieceColor } from '../../src/engine/types.ts';

const sq = (a: string) => algebraicToSquare(a);

function baseState(fen: string): SuperChessState {
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

function withCardInHand(state: SuperChessState, color: PieceColor, name: string): SuperChessState {
  const def = CARD_DEFINITIONS.find((c) => c.name === name);
  if (!def) throw new Error(`Unknown card: ${name}`);
  const hand = color === 'w' ? state.deck.hand.white : state.deck.hand.black;
  hand.push({ id: `test-${name}`, definition: def });
  return state;
}

interface PositionFixture {
  name: string;
  fen: string;
  prep?: (s: SuperChessState) => void;
}

const POSITIONS: PositionFixture[] = [
  { name: 'starting position', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  { name: 'after 1.e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' },
  { name: 'after 1.e4 e5', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2' },
  { name: 'mid-opening Italian', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4' },
  { name: 'tactical middlegame', fen: 'r2qk2r/ppp1bppp/2n2n2/3pp3/3PP3/2N1BN2/PPP2PPP/R2QKB1R w KQkq - 0 1' },
  {
    name: 'with captured pieces (resurrection eligible)',
    fen: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3 w - - 0 1',
    prep: (s) => {
      // capturedByColor convention: get(color) = OPPONENT pieces THIS
      // color has captured. White's captured list is BLACK pieces.
      s.superState.capturedByColor.set('w', ['bB', 'bN']);
      s.superState.capturedByColor.set('b', ['wR']);
    },
  },
];

const COLORS: PieceColor[] = ['w', 'b'];

describe('HeuristicCardAI: decisions are runtime-applicable', () => {
  const ai = new HeuristicCardAI();

  for (const pos of POSITIONS) {
    for (const color of COLORS) {
      for (const def of CARD_DEFINITIONS) {
        it(`${pos.name} \u00b7 ${color === 'w' ? 'white' : 'black'} with ${def.name} produces a valid decision`, async () => {
          const state = baseState(pos.fen);
          if (pos.prep) pos.prep(state);
          // Align chess.turn with the color we're testing (some
          // fixtures' FEN turn won't match).
          state.chess.turn = color;
          // Most card decisions don't care about en-passant, but
          // when we flip turn we should clear the now-stale e.p.
          // square (the engine treats e.p. as "this side could
          // capture en passant", and flipping makes it nonsensical).
          state.chess.enPassantSquare = null;
          withCardInHand(state, color, def.name);
          state.deck = { ...state.deck };

          const decision = await ai.decide(state, color, [
            ...(color === 'w' ? state.deck.hand.white : state.deck.hand.black),
          ]);

          if (!decision.shouldPlay) {
            // Passing is always allowed \u2014 nothing to assert.
            return;
          }

          // The AI said play. The card it picked must be in hand.
          const hand = color === 'w' ? state.deck.hand.white : state.deck.hand.black;
          expect(hand.some((c) => c.id === decision.card!.id)).toBe(true);

          // The target it picked must produce a real state change
          // when fed to the effect. A returned `state === newState`
          // means the effect rejected the target as invalid \u2014 i.e.
          // the AI told us to play something that wasn't legal.
          const effect = CARD_EFFECTS[decision.card!.definition.name];
          const result = effect(state, color, decision.target!);
          expect(result.newState).not.toBe(state);

          // The post-effect state must validate cleanly: no phantom
          // pieces, no out-of-bounds en-passant, no extra kings.
          const validation = validateState(result.newState);
          expect(validation.errors).toEqual([]);
        });
      }
    }
  }
});

// One specific regression: the user-reported phantom-pawn bug. Even
// though state-purity tests caught the underlying mutation, this is
// a black-box assertion at the AI-decision boundary and is worth
// keeping as a load-bearing check.
describe('HeuristicCardAI: phantom-pawn regression (en-passant + Shield)', () => {
  it('does not propose Shield on an empty square in the e3 e.p. position', async () => {
    const ai = new HeuristicCardAI();
    const state = baseState('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    withCardInHand(state, 'b', 'Shield');
    state.deck = { ...state.deck };

    const decision = await ai.decide(state, 'b', [...state.deck.hand.black]);
    if (!decision.shouldPlay) return; // also acceptable

    expect(decision.card?.definition.name).toBe('Shield');
    const target = decision.target!;
    expect(target.ownPieceSquare).not.toBe(sq('e3'));
    // The targeted square must hold a black piece in the LIVE state.
    if (target.ownPieceSquare !== undefined) {
      const piece = state.chess.board[target.ownPieceSquare];
      expect(piece).not.toBeNull();
      expect(piece && piece[0]).toBe('b');
    }
  });
});
