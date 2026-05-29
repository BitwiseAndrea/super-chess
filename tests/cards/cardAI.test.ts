// tests/cards/cardAI.test.ts
// Behavioral tests for the heuristic card AI. We're not asserting on
// specific scores (those drift as the eval tunes) — just that the bot
// makes the OBVIOUS smart pick in scenarios where there's a clear
// right answer.
//
// Tests use parseFEN to set up specific positions, drop a card into a
// hand, and ask scoreCard which target it would pick. Pass = the
// chosen target matches the strategically correct one for that
// position.

import { describe, it, expect } from 'vitest';
import { scoreCard } from '../../src/cards/cardAI.ts';
import { CARD_DEFINITIONS, buildDeck } from '../../src/cards/definitions.ts';
import { parseFEN } from '../../src/engine/fen.ts';
import { createSuperState } from '../../src/game/types.ts';
import { Deck } from '../../src/cards/deck.ts';
import type { SuperChessState } from '../../src/game/types.ts';
import { algebraicToSquare } from '../../src/engine/board.ts';
import type { CardInstance } from '../../src/cards/types.ts';

const sq = (a: string) => algebraicToSquare(a);

function stateFromFen(fen: string): SuperChessState {
  return {
    chess: parseFEN(fen),
    deck: new Deck(buildDeck()).getState(),
    superState: createSuperState(),
    history: [],
    result: null,
    snapshots: [],
  };
}

function cardOf(name: string): CardInstance {
  const def = CARD_DEFINITIONS.find((c) => c.name === name);
  if (!def) throw new Error(`No card definition: ${name}`);
  return { id: 'test-' + name, definition: def };
}

describe('cardAI: Freeze targeting', () => {
  it('freezes the piece that\u2019s about to capture us, not the most valuable piece', () => {
    // White has a hanging rook on a1 + queen on d1 (defended by king).
    // Black has a knight on b3 attacking a1 (losing a rook), and a
    // queen on h7 doing nothing useful (different file, different
    // diagonals from any of our pieces). The naive heuristic
    // ("freeze the queen, it's most valuable") would pick h7. The
    // smart heuristic should freeze the b3 knight \u2014 that's where
    // the actual threat lives.
    const fen = '1k6/7q/8/8/8/1n6/8/R2QK3 w Q - 0 1';
    const state = stateFromFen(fen);
    const { target } = scoreCard(cardOf('Freeze'), state, 'w');
    expect(target.oppPieceSquare).toBe(sq('b3'));
  });

  it('still picks SOMETHING when no opp piece is threatening anything', () => {
    // Quiet position \u2014 Freeze should still propose a target (just any
    // valid one), even if the score is low.
    const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
    const state = stateFromFen(fen);
    state.chess.board[sq('h8')] = 'bN';
    const { target } = scoreCard(cardOf('Freeze'), state, 'w');
    expect(target.oppPieceSquare).toBe(sq('h8'));
  });
});

describe('cardAI: Shield targeting', () => {
  it('shields a piece that\u2019s actually under threat, not a safe one', () => {
    // White rook on a1 (safe) + white knight on c3 attacked by a
    // black knight on b5. Shield should cover the knight, not the
    // rook \u2014 the rook isn't being attacked, the knight is the one
    // about to be lost.
    const fen = '4k3/8/8/1n6/8/2N5/8/R3K3 w Q - 0 1';
    const state = stateFromFen(fen);
    const { target } = scoreCard(cardOf('Shield'), state, 'w');
    expect(target.ownPieceSquare).toBe(sq('c3'));
  });
});

describe('cardAI: Coup targeting', () => {
  it('removes the highest-value opp piece', () => {
    // Black queen on h8 + black knight on b3. Coup should pick the queen.
    const fen = '7q/8/8/8/8/1n6/8/4K3 w - - 0 1';
    const state = stateFromFen(fen);
    const { target } = scoreCard(cardOf('Coup'), state, 'w');
    expect(target.oppPieceSquare).toBe(sq('h8'));
  });
});

describe('cardAI: Disrupt targeting', () => {
  it('does not target a piece type the opponent doesn\u2019t have', () => {
    // Opp has only king + pawns. Disrupt should pick "P", never "Q".
    const fen = '4k3/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1';
    const state = stateFromFen(fen);
    const { target } = scoreCard(cardOf('Disrupt'), state, 'w');
    expect(['P']).toContain(target.pieceType);
  });
});

describe('cardAI: Time Warp', () => {
  it('refuses to play a second time once used', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const state = stateFromFen(fen);
    state.superState.timeWarpUsed.set('w', true);
    const { score } = scoreCard(cardOf('Time Warp'), state, 'w');
    // contextBonus penalty is -1000 for "already used" \u2014 well below
    // any reasonable threshold.
    expect(score).toBeLessThan(-500);
  });
});

describe('cardAI: state purity', () => {
  it('does not mutate the input state when scoring (regression: phantom pawn bug)', () => {
    // Exact replay of the production bug: white plays e2\u2013e4, black
    // is to move with Shield in hand, en-passant target = e3. The old
    // maxCaptureValueFor flipped turn IN PLACE on a board reference
    // that was shared with the live state. generateLegal\u2019s
    // applyMoveInPlace + undoMove cycles then leaked residue back
    // into the source board, materialising a phantom black pawn on
    // the en-passant square. Defensive board clone fixes it.
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const state = stateFromFen(fen);
    const boardBefore = [...state.chess.board];
    const turnBefore = state.chess.turn;
    const epBefore = state.chess.enPassantSquare;

    scoreCard(cardOf('Shield'), state, 'b');

    expect(state.chess.board).toEqual(boardBefore);
    expect(state.chess.turn).toBe(turnBefore);
    expect(state.chess.enPassantSquare).toBe(epBefore);
    // No black piece should have appeared on the en-passant square.
    expect(state.chess.board[sq('e3')]).toBeNull();
  });

  it('Shield candidate generation never proposes an empty square', () => {
    // The phantom-pawn bug surfaced as Shield being played on an empty
    // square (the AI had been scoring states where its own threat
    // estimator had corrupted the board into showing a piece there).
    // This guards the candidate-generation contract: targets must
    // reference squares that hold an own piece NOW.
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const state = stateFromFen(fen);
    const { target } = scoreCard(cardOf('Shield'), state, 'b');
    if (target.ownPieceSquare !== undefined) {
      const piece = state.chess.board[target.ownPieceSquare];
      expect(piece).not.toBeNull();
      expect(piece && piece[0]).toBe('b');
    }
  });
});
