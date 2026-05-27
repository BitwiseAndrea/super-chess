// tests/game/debug.test.ts
//
// Tests for src/game/debug.ts — validateState() and buildBugReport().
// validateState is the heart of the in-app "is this state sane?" check, so
// we want explicit cases for every kind of invariant break it can catch.

import { describe, it, expect } from 'vitest';
import { validateState, buildBugReport } from '../../src/game/debug.ts';
import { parseFEN, STARTING_FEN } from '../../src/engine/fen.ts';
import { createSuperState, type SuperChessState } from '../../src/game/types.ts';
import { Deck } from '../../src/cards/deck.ts';
import { buildDeck } from '../../src/cards/definitions.ts';

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

function sq(alg: string): number {
  const file = alg.charCodeAt(0) - 97;
  const rank = parseInt(alg[1], 10);
  return (8 - rank) * 8 + file;
}

describe('validateState', () => {
  describe('happy path', () => {
    it('accepts the starting position', () => {
      const result = validateState(makeState());
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
      // The starting position should have no warnings either.
      expect(result.warnings).toEqual([]);
    });

    it('accepts a mid-game position', () => {
      const state = makeState('r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 0 1');
      const result = validateState(state);
      expect(result.ok).toBe(true);
    });
  });

  describe('board structure', () => {
    it('rejects more than one white king', () => {
      const state = makeState();
      state.chess.board[sq('e4')] = 'wK'; // second white king
      const result = validateState(state);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => /white must have exactly 1 king \(has 2\)/.test(e.message))).toBe(true);
    });

    it('rejects no black king', () => {
      const state = makeState();
      state.chess.board[sq('e8')] = null;
      const result = validateState(state);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => /black must have exactly 1 king \(has 0\)/.test(e.message))).toBe(true);
    });

    it('rejects a pawn on the back rank', () => {
      // White pawn that somehow got to rank 8 without promoting.
      const state = makeState();
      state.chess.board[sq('a8')] = 'wP'; // pawn on a8 — should have promoted
      const result = validateState(state);
      expect(result.ok).toBe(false);
      const issue = result.errors.find((e) => /should have promoted/.test(e.message));
      expect(issue).toBeDefined();
      expect(issue!.square).toBe('a8');
    });

    it('rejects invalid piece strings', () => {
      const state = makeState();
      (state.chess.board as Array<string | null>)[sq('e4')] = 'xX';
      const result = validateState(state);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => /invalid piece "xX"/.test(e.message))).toBe(true);
    });
  });

  describe('en passant', () => {
    it('warns when ep square not on rank 3 or 6', () => {
      const state = makeState();
      state.chess.enPassantSquare = sq('e4');
      const result = validateState(state);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => /rank 3 or 6/.test(e.message))).toBe(true);
    });

    it('accepts a valid ep square (rank 3 for white\u2019s ep target after black push)', () => {
      const state = makeState();
      state.chess.enPassantSquare = sq('e6'); // rank 6 — black just pushed
      const result = validateState(state);
      expect(result.errors).toEqual([]);
    });
  });

  describe('castling rights', () => {
    it('warns when castling rights present but king has moved', () => {
      const state = makeState();
      state.chess.board[sq('e1')] = null;
      state.chess.board[sq('e2')] = 'wK';
      // Castling rights still on from starting FEN.
      const result = validateState(state);
      expect(result.warnings.some((w) => /castling rights but king isn't on e1/.test(w.message))).toBe(true);
    });

    it('warns when kingside castling but no rook on h1', () => {
      const state = makeState();
      state.chess.board[sq('h1')] = null;
      const result = validateState(state);
      expect(result.warnings.some((w) => /kingside castling but no rook on h1/.test(w.message))).toBe(true);
    });
  });

  describe('super-state', () => {
    it('warns when a shielded square is empty', () => {
      const state = makeState();
      state.superState.shieldedSquares.set(sq('e4'), 'w');
      state.superState.shieldTurns.set(sq('e4'), 2);
      const result = validateState(state);
      expect(result.warnings.some((w) => /shielded square is empty/.test(w.message))).toBe(true);
    });

    it('warns when shield color doesn\u2019t match piece color', () => {
      const state = makeState();
      // e2 has a wP — set shield to black.
      state.superState.shieldedSquares.set(sq('e2'), 'b');
      state.superState.shieldTurns.set(sq('e2'), 2);
      const result = validateState(state);
      expect(result.warnings.some((w) => /shield color b doesn't match piece wP/.test(w.message))).toBe(true);
    });

    it('errors on out-of-range frozen square', () => {
      const state = makeState();
      state.superState.frozenSquares.set(999, 2);
      const result = validateState(state);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => /frozen references square 999 out of bounds/.test(e.message))).toBe(true);
    });

    it('errors on negative turnsSinceCapture', () => {
      const state = makeState();
      state.superState.turnsSinceCapture = -1;
      const result = validateState(state);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => /turnsSinceCapture negative/.test(e.message))).toBe(true);
    });
  });

  describe('hands', () => {
    it('errors when hand size exceeds max', () => {
      const state = makeState();
      // Force-add 100 cards to white's hand
      const def = buildDeck()[0];
      state.deck.hand.white = Array.from({ length: 100 }, (_, i) => ({ id: `f${i}`, definition: def }));
      const result = validateState(state);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => /exceeds max/.test(e.message))).toBe(true);
    });
  });
});

describe('buildBugReport', () => {
  it('produces a self-contained JSON-serializable snapshot', () => {
    const state = makeState();
    const report = buildBugReport(state, { config: { humanColor: 'w' } });

    // Must be losslessly JSON-serializable.
    const json = JSON.stringify(report);
    expect(json.length).toBeGreaterThan(100);
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe(1);
    expect(parsed.fen).toBe(STARTING_FEN);
    expect(parsed.turn).toBe('w');
    expect(parsed.fullMoveNumber).toBe(1);
    expect(parsed.hands.white.length).toBe(0); // no draws yet
    expect(parsed.validation.ok).toBe(true);
    expect(parsed.config.humanColor).toBe('w');
  });

  it('includes validation findings inline', () => {
    const state = makeState();
    state.chess.board[sq('a8')] = 'wP'; // pawn on back rank
    const report = buildBugReport(state, { config: {} });
    expect(report.validation.ok).toBe(false);
    expect(report.validation.errors.some((e) => /should have promoted/.test(e.message))).toBe(true);
  });

  it('converts super-state Maps to algebraic-keyed arrays', () => {
    const state = makeState();
    state.superState.frozenSquares.set(sq('e4'), 3);
    state.superState.shieldedSquares.set(sq('e2'), 'w');
    state.superState.shieldTurns.set(sq('e2'), 2);
    state.superState.foulSquares.set(sq('d5'), 'b');
    const report = buildBugReport(state, { config: {} });
    expect(report.superState.frozen).toEqual([{ sq: 'e4', turnsRemaining: 3 }]);
    expect(report.superState.shielded).toEqual([
      { sq: 'e2', color: 'w', turnsRemaining: 2 },
    ]);
    expect(report.superState.foul).toEqual([
      { sq: 'd5', forbiddenColor: 'b' },
    ]);
  });

  it('truncates recent events to the last 40', () => {
    const state = makeState();
    for (let i = 0; i < 100; i++) {
      state.history.push({
        type: 'move',
        turn: i,
        data: { from: 0, to: 0, capture: null, promotion: null, enPassantCaptureSq: null, newEnPassantSq: null, isCastle: false, algebraic: `e${i}`, turnNumber: i, color: 'w' },
      } as any);
    }
    const report = buildBugReport(state, { config: {} });
    expect(report.recentEvents.length).toBe(40);
    // last entry should be the most recent
    expect(report.recentEvents[report.recentEvents.length - 1].turn).toBe(99);
  });

  it('passes through the user note and debug log', () => {
    const state = makeState();
    const report = buildBugReport(state, {
      config: {},
      userNote: 'rook vanished after Trade',
      debugLog: [
        { ms: 100, t: '2026-05-26T00:00:00.000Z', kind: 'info', tag: 'bot', message: 'turn start' },
        { ms: 250, t: '2026-05-26T00:00:00.150Z', kind: 'error', tag: 'card', message: 'no effect handler' },
      ],
    });
    expect(report.userNote).toBe('rook vanished after Trade');
    expect(report.debugLog.length).toBe(2);
    expect(report.debugLog[1].kind).toBe('error');
  });
});
