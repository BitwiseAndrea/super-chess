// tests/cards/state-purity.test.ts
//
// Systematic state-purity tests. The phantom-pawn bug shipped because
// nothing in the test suite enforced the invariant that "scoring a
// card must not modify the state". This file fixes that, with a
// generic loop over (every card × every interesting position × every
// color) that snapshots state before and after each call and asserts
// nothing changed.
//
// The same loop is reused to test:
//   1. scoreCard (the smart card AI)
//   2. CARD_EFFECTS (every effect against an invalid target — must
//      return state-unchanged, not mutate)
//   3. getSuperChessLegalMoves (the move generator must never leak
//      applyMoveInPlace residue, even with super-state effects active)
//
// If you find yourself adding a new card, a new super-state effect, or
// a new pattern of board mutation: ADD a position to POSITIONS below
// that exercises the new code path. The loop will run your card
// through every position automatically.

import { describe, it, expect } from 'vitest';
import { scoreCard } from '../../src/cards/cardAI.ts';
import { CARD_EFFECTS } from '../../src/cards/effects.ts';
import { CARD_DEFINITIONS, buildDeck } from '../../src/cards/definitions.ts';
import { parseFEN, toFEN } from '../../src/engine/fen.ts';
import { createSuperState } from '../../src/game/types.ts';
import { Deck } from '../../src/cards/deck.ts';
import { getSuperChessLegalMoves } from '../../src/game/rules.ts';
import { algebraicToSquare } from '../../src/engine/board.ts';
import type { SuperChessState } from '../../src/game/types.ts';
import type { Square, PieceColor } from '../../src/engine/types.ts';

const sq = (a: string) => algebraicToSquare(a);

// ─── Snapshot helpers ────────────────────────────────────────────────
//
// `snapshot()` captures every observable bit of state into a structure
// that survives JSON round-trip. `expectUnchanged()` runs that
// snapshot against the live state and produces a focused diff if
// anything mutated.

interface Snapshot {
  fen: string;
  superState: {
    frozen: Array<[number, number]>;     // [sq, turnsRemaining]
    shielded: Array<[number, PieceColor]>;
    shieldTurns: Array<[number, number]>;
    foul: Array<[number, PieceColor]>;
    foulTurns: Array<[number, number]>;
    mustMoveType: Array<[PieceColor, string]>;
    mustMoveTurns: Array<[PieceColor, number]>;
    capturedW: string[];
    capturedB: string[];
    knightsPathSquare: number | null;
    ghostStepSquare: number | null;
    fortifiedPawnSquare: number | null;
    extraMoveRemaining: PieceColor | null;
    fogActive: boolean;
    timeWarpW: boolean;
    timeWarpB: boolean;
    turnsSinceCapture: number;
    lastMove: string | null;
  };
  deck: {
    draw: number;       // pile size
    discard: number;
    handW: string[];    // card names (ids would also work but names read better in failures)
    handB: string[];
  };
  historyLen: number;
  result: string | null;
}

function snapshot(state: SuperChessState): Snapshot {
  const ss = state.superState;
  return {
    fen: toFEN(state.chess),
    superState: {
      frozen: [...ss.frozenSquares.entries()],
      shielded: [...ss.shieldedSquares.entries()] as Array<[number, PieceColor]>,
      shieldTurns: [...ss.shieldTurns.entries()],
      foul: [...ss.foulSquares.entries()] as Array<[number, PieceColor]>,
      foulTurns: [...ss.foulTurns.entries()],
      mustMoveType: [...ss.mustMoveType.entries()] as Array<[PieceColor, string]>,
      mustMoveTurns: [...ss.mustMoveTurns.entries()] as Array<[PieceColor, number]>,
      capturedW: [...(ss.capturedByColor.get('w') ?? [])],
      capturedB: [...(ss.capturedByColor.get('b') ?? [])],
      knightsPathSquare: ss.knightsPathSquare,
      ghostStepSquare: ss.ghostStepSquare,
      fortifiedPawnSquare: ss.fortifiedPawnSquare,
      extraMoveRemaining: ss.extraMoveRemaining,
      fogActive: ss.fogActive,
      timeWarpW: ss.timeWarpUsed.get('w') ?? false,
      timeWarpB: ss.timeWarpUsed.get('b') ?? false,
      turnsSinceCapture: ss.turnsSinceCapture,
      lastMove: ss.lastMove,
    },
    deck: {
      draw: state.deck.drawPile.length,
      discard: state.deck.discardPile.length,
      handW: state.deck.hand.white.map((c) => c.definition.name),
      handB: state.deck.hand.black.map((c) => c.definition.name),
    },
    historyLen: state.history.length,
    result: state.result?.reason ?? null,
  };
}

function expectUnchanged(state: SuperChessState, before: Snapshot, label: string): void {
  const after = snapshot(state);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  // Produce a focused diff on the FIRST mismatching field to make
  // debugging fast. Vitest will print the snapshot comparison.
  expect({ label, after }).toEqual({ label, after: before });
}

// ─── Position fixtures ───────────────────────────────────────────────
//
// Each position activates a different combination of game-state
// machinery so the test loop hits every interesting branch in
// move-gen, scoring, and effects.

interface PositionFixture {
  name: string;
  build: () => SuperChessState;
}

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

const POSITIONS: PositionFixture[] = [
  {
    name: 'starting position',
    build: () => baseState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
  },
  {
    name: 'after 1.e4 (en-passant target on e3 — the phantom-pawn bug position)',
    build: () => baseState('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'),
  },
  {
    name: 'after 1.e4 e5 (en-passant target on e6)',
    build: () => baseState('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2'),
  },
  {
    name: 'mid-opening (Italian-ish)',
    build: () => baseState('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4'),
  },
  {
    name: 'tactical middlegame with hanging pieces',
    build: () => baseState('r2qk2r/ppp1bppp/2n2n2/3pp3/3PP3/2N1BN2/PPP2PPP/R2QKB1R w KQkq - 0 1'),
  },
  {
    name: 'endgame (just kings + minor pieces)',
    build: () => baseState('4k3/8/8/8/8/2N5/8/4K3 w - - 0 1'),
  },
  {
    name: 'with a frozen black knight',
    build: () => {
      const s = baseState('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
      s.superState.frozenSquares.set(sq('b8'), 2);
      return s;
    },
  },
  {
    name: 'with a shielded white pawn',
    build: () => {
      const s = baseState('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
      s.superState.shieldedSquares.set(sq('e4'), 'w');
      s.superState.shieldTurns.set(sq('e4'), 2);
      return s;
    },
  },
  {
    name: 'with a foul-grounded square',
    build: () => {
      const s = baseState('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
      s.superState.foulSquares.set(sq('d5'), 'b');
      s.superState.foulTurns.set(sq('d5'), 4);
      return s;
    },
  },
  {
    name: 'with a knight\u2019s-path piece (rook treated as knight)',
    build: () => {
      const s = baseState('r3k2r/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
      s.superState.knightsPathSquare = sq('a8');
      return s;
    },
  },
  {
    name: 'with a ghost-step piece (bishop phasing)',
    build: () => {
      const s = baseState('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
      s.superState.ghostStepSquare = sq('c8');
      return s;
    },
  },
  {
    name: 'with a fortified white pawn (moves like a rook)',
    build: () => {
      const s = baseState('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1');
      s.superState.fortifiedPawnSquare = sq('e4');
      return s;
    },
  },
  {
    name: 'with Disrupt active (black must move a knight)',
    build: () => {
      const s = baseState('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
      s.superState.mustMoveType.set('b', 'N');
      s.superState.mustMoveTurns.set('b', 2);
      return s;
    },
  },
  {
    name: 'with captured pieces (Resurrection eligible)',
    build: () => {
      const s = baseState('4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3 w - - 0 1');
      // capturedByColor convention: get(color) = OPPONENT pieces THIS
      // color has captured. White's pile is BLACK pieces.
      s.superState.capturedByColor.set('w', ['bB', 'bN']);
      s.superState.capturedByColor.set('b', ['wR']);
      return s;
    },
  },
];

const COLORS: PieceColor[] = ['w', 'b'];

// Every defined card. Used to drive the per-card sweep.
const CARD_NAMES = CARD_DEFINITIONS.map((c) => c.name);

function dummyCard(name: string) {
  const def = CARD_DEFINITIONS.find((c) => c.name === name)!;
  return { id: `test-${name}`, definition: def };
}

// ─── 1. scoreCard purity ─────────────────────────────────────────────

describe('state purity: scoreCard never mutates input state', () => {
  for (const pos of POSITIONS) {
    for (const color of COLORS) {
      it(`${pos.name} \u00b7 ${color === 'w' ? 'white' : 'black'} scores every card without mutation`, () => {
        const state = pos.build();
        const before = snapshot(state);
        for (const name of CARD_NAMES) {
          scoreCard(dummyCard(name), state, color);
          expectUnchanged(state, before, `scoreCard('${name}', ${color}) on '${pos.name}'`);
        }
      });
    }
  }
});

// ─── 2. CARD_EFFECTS purity ──────────────────────────────────────────
//
// Effects MUST clone state for any non-trivial change. We test two
// shapes:
//   a. Empty/invalid target — effect should refuse and return the
//      same state object back, with no mutation.
//   b. A heuristically-chosen "probably valid" target via scoreCard.
//      Even a real apply must not mutate the input.

describe('state purity: CARD_EFFECTS never mutates input state', () => {
  for (const pos of POSITIONS) {
    for (const color of COLORS) {
      it(`${pos.name} \u00b7 ${color === 'w' ? 'white' : 'black'} \u00b7 every effect is pure (invalid target)`, () => {
        const state = pos.build();
        const before = snapshot(state);
        for (const name of CARD_NAMES) {
          // Empty target — most effects will reject. The contract is
          // "return state-unchanged, do not mutate".
          try {
            CARD_EFFECTS[name](state, color, {});
          } catch {
            // A throw is also acceptable (caller-side invariant
            // violation). The mutation check is what we're guarding.
          }
          expectUnchanged(state, before, `CARD_EFFECTS['${name}'](${color}, {}) on '${pos.name}'`);
        }
      });

      it(`${pos.name} \u00b7 ${color === 'w' ? 'white' : 'black'} \u00b7 every effect is pure (AI-chosen target)`, () => {
        const state = pos.build();
        const before = snapshot(state);
        for (const name of CARD_NAMES) {
          const card = dummyCard(name);
          // Use the AI's own preferred target (more likely to hit
          // the "valid path" inside the effect).
          const { target } = scoreCard(card, state, color);
          try {
            CARD_EFFECTS[name](state, color, target);
          } catch {
            // Same as above: throws are fine, mutations aren't.
          }
          expectUnchanged(
            state,
            before,
            `CARD_EFFECTS['${name}'](${color}, AI-target) on '${pos.name}'`,
          );
        }
      });
    }
  }
});

// ─── 3. getSuperChessLegalMoves purity ───────────────────────────────
//
// The move generator runs applyMoveInPlace + undoMove cycles for
// king-safety / ghost-step legality. Any leak corrupts the live
// board. This test runs the generator against every fixture and
// checks the source state is byte-for-byte unchanged.

describe('state purity: getSuperChessLegalMoves never mutates input state', () => {
  for (const pos of POSITIONS) {
    for (const color of COLORS) {
      it(`${pos.name} \u00b7 generates ${color === 'w' ? 'white' : 'black'} moves without mutation`, () => {
        const state = pos.build();
        // The generator asserts chess.turn === color, so we need a
        // turn-aligned fixture for each color we test. If the fixture
        // doesn't match, flip the turn on a CLONE and feed that. The
        // important part is that we test BOTH sides through the
        // generator across all super-state combos.
        const aligned: SuperChessState =
          state.chess.turn === color
            ? state
            : { ...state, chess: { ...state.chess, board: [...state.chess.board], turn: color } };
        const before = snapshot(aligned);
        try {
          getSuperChessLegalMoves(aligned, color);
        } catch {
          // Some super-state combinations (e.g. Disrupt with no piece
          // of the required type for the side-to-move) may throw or
          // produce no moves. Either way the state must not mutate.
        }
        expectUnchanged(
          aligned,
          before,
          `getSuperChessLegalMoves(${color}) on '${pos.name}'`,
        );
      });
    }
  }
});
