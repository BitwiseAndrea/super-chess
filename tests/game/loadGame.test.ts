// tests/game/loadGame.test.ts
//
// Unit tests for src/game/loadGame.ts \u2014 the parser that turns a pasted
// JSON snapshot (typically a buildBugReport() output) back into a
// runnable (state, deck) pair.
//
// Two coverage axes:
//   1. Round-trip: buildBugReport \u2192 parseLoadGameInput should produce
//      a state that matches the source state on the load-bearing
//      fields (board, hands by name, frozen/shielded/foul squares).
//   2. Failure modes: malformed JSON, missing FEN, unknown card name,
//      validation errors are surfaced via the structured error shape.
//
// The loader also accepts a permissive "lite" form ({fen, hands?,
// superState?}) so testers can hand-roll positions without copying the
// full bug-report payload.

import { describe, it, expect } from 'vitest';
import { parseLoadGameInput } from '../../src/game/loadGame.ts';
import { buildBugReport } from '../../src/game/debug.ts';
import { parseFEN, STARTING_FEN } from '../../src/engine/fen.ts';
import { createSuperState } from '../../src/game/types.ts';
import { Deck } from '../../src/cards/deck.ts';
import { CARD_DEFINITIONS } from '../../src/cards/definitions.ts';
import type { SuperChessState } from '../../src/game/types.ts';

function freshState(): SuperChessState {
  const chess = parseFEN(STARTING_FEN);
  const deck = new Deck(CARD_DEFINITIONS);
  return {
    chess,
    deck: deck.getState(),
    superState: createSuperState(),
    history: [],
    result: null,
    snapshots: [],
  };
}

describe('parseLoadGameInput', () => {
  describe('input validation', () => {
    it('rejects empty paste', () => {
      const r = parseLoadGameInput('   \n  ');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toMatch(/empty/i);
    });

    it('rejects non-JSON', () => {
      const r = parseLoadGameInput('this is not json {');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toMatch(/not valid json/i);
    });

    it('rejects a JSON array (top-level must be object)', () => {
      const r = parseLoadGameInput(JSON.stringify([1, 2, 3]));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toMatch(/object/i);
    });

    it('rejects when FEN is missing', () => {
      const r = parseLoadGameInput(JSON.stringify({ hands: { white: [], black: [] } }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.some((e) => /fen/i.test(e))).toBe(true);
    });

    it('rejects when FEN is unparseable', () => {
      const r = parseLoadGameInput(JSON.stringify({ fen: 'this is not a fen' }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.some((e) => /fen/i.test(e))).toBe(true);
    });
  });

  describe('lite form: { fen } only', () => {
    it('accepts a bare FEN and produces empty hands + clean superState', () => {
      const r = parseLoadGameInput(JSON.stringify({ fen: STARTING_FEN }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.loaded.state.chess.turn).toBe('w');
      expect(r.loaded.state.deck.hand.white).toEqual([]);
      expect(r.loaded.state.deck.hand.black).toEqual([]);
      expect(r.loaded.state.superState.frozenSquares.size).toBe(0);
      expect(r.loaded.state.history).toEqual([]);
    });
  });

  describe('hands', () => {
    it('rebuilds hands by card name', () => {
      const r = parseLoadGameInput(JSON.stringify({
        fen: STARTING_FEN,
        hands: { white: ['Freeze', 'Shield'], black: ['Foul Ground'] },
      }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const w = r.loaded.state.deck.hand.white.map((c) => c.definition.name);
      const b = r.loaded.state.deck.hand.black.map((c) => c.definition.name);
      expect(w).toEqual(['Freeze', 'Shield']);
      expect(b).toEqual(['Foul Ground']);
    });

    it('warns and skips unknown card names without failing the load', () => {
      const r = parseLoadGameInput(JSON.stringify({
        fen: STARTING_FEN,
        hands: { white: ['Freeze', 'TotallyMadeUpCard', 'Shield'], black: [] },
      }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.warnings.some((w) => /TotallyMadeUpCard/.test(w))).toBe(true);
      const w = r.loaded.state.deck.hand.white.map((c) => c.definition.name);
      expect(w).toEqual(['Freeze', 'Shield']);
    });

    it('removes loaded-hand cards from the draw pile', () => {
      const r = parseLoadGameInput(JSON.stringify({
        fen: STARTING_FEN,
        hands: { white: ['Freeze'], black: [] },
      }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // The hand has Freeze; the draw pile should have 1 fewer Freeze.
      const freezeDef = CARD_DEFINITIONS.find((c) => c.name === 'Freeze')!;
      const expectedDraw = freezeDef.copies - 1;
      const drawFreezes = r.loaded.state.deck.drawPile.filter((c) => c.definition.name === 'Freeze').length;
      expect(drawFreezes).toBe(expectedDraw);
    });
  });

  describe('superState restoration', () => {
    it('restores a frozen square from algebraic notation', () => {
      const r = parseLoadGameInput(JSON.stringify({
        fen: STARTING_FEN,
        superState: {
          frozen: [{ sq: 'e4', turnsRemaining: 2 }],
        },
      }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // e4 is square 36 (rank-4 row=4, file=4 \u2192 (8-4)*8 + 4 = 36)
      expect(r.loaded.state.superState.frozenSquares.get(36)).toBe(2);
    });

    it('restores shields with color + turns', () => {
      const r = parseLoadGameInput(JSON.stringify({
        fen: STARTING_FEN,
        superState: {
          shielded: [{ sq: 'e2', color: 'w', turnsRemaining: 3 }],
        },
      }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // e2 = (8-2)*8 + 4 = 52
      expect(r.loaded.state.superState.shieldedSquares.get(52)).toBe('w');
      expect(r.loaded.state.superState.shieldTurns.get(52)).toBe(3);
    });

    it('warns on unrecognizable square strings', () => {
      const r = parseLoadGameInput(JSON.stringify({
        fen: STARTING_FEN,
        superState: { frozen: [{ sq: 'zz', turnsRemaining: 2 }] },
      }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.warnings.some((w) => /unrecognizable square/.test(w))).toBe(true);
      expect(r.loaded.state.superState.frozenSquares.size).toBe(0);
    });
  });

  describe('round-trip from buildBugReport', () => {
    it('preserves FEN, hands by name, and superState invariants', () => {
      // Build a state with stuff in it: a few cards in hand, a freeze.
      const state = freshState();
      const freezeDef = CARD_DEFINITIONS.find((c) => c.name === 'Freeze')!;
      const shieldDef = CARD_DEFINITIONS.find((c) => c.name === 'Shield')!;
      state.deck.hand.white.push({ id: 'w1', definition: freezeDef });
      state.deck.hand.white.push({ id: 'w2', definition: shieldDef });
      state.superState.frozenSquares.set(28, 2); // e4
      state.superState.shieldedSquares.set(52, 'w'); // e2
      state.superState.shieldTurns.set(52, 3);

      const report = buildBugReport(state, { config: { humanColor: 'w' } });
      const r = parseLoadGameInput(JSON.stringify(report));
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      // Hands
      const w = r.loaded.state.deck.hand.white.map((c) => c.definition.name).sort();
      expect(w).toEqual(['Freeze', 'Shield']);

      // Super-state
      expect(r.loaded.state.superState.frozenSquares.get(28)).toBe(2);
      expect(r.loaded.state.superState.shieldedSquares.get(52)).toBe('w');
      expect(r.loaded.state.superState.shieldTurns.get(52)).toBe(3);

      // Config hint round-trip
      expect(r.loaded.configHints.humanColor).toBe('w');
    });

    it('round-trips with a non-trivial position (post-move FEN, black to move)', () => {
      // A real-ish bug-report-shaped paste with the "user's situation":
      // white just played Kxd1, black to move, white has Freeze in hand,
      // bN at f6 should be freezable on the next post-phase.
      const fen = 'r1bqkb1r/pppp1ppp/5n2/3P4/5B2/N7/P3P1PP/R1PK1BNR b kq - 0 10';
      const json = JSON.stringify({
        version: 1,
        fen,
        turn: 'b',
        fullMoveNumber: 10,
        halfMoveClock: 0,
        hands: { white: ['Foul Ground', 'Freeze'], black: ['Sidestep', 'Foul Ground'] },
        superState: { frozen: [], shielded: [], foul: [] },
        config: { humanColor: 'w', botLabel: 'normal', botDepth: 2, openOpponentHand: false },
      });
      const r = parseLoadGameInput(json);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.loaded.state.chess.turn).toBe('b');
      expect(r.loaded.state.chess.fullMoveNumber).toBe(10);
      expect(r.loaded.state.deck.hand.white.map((c) => c.definition.name)).toEqual(['Foul Ground', 'Freeze']);
      expect(r.loaded.configHints.humanColor).toBe('w');
      expect(r.loaded.configHints.botDepth).toBe(2);
    });
  });

  describe('validation', () => {
    it('refuses to load a state that fails structural validation', () => {
      // FEN with two white kings \u2014 validateState should reject.
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKKBNR w KQkq - 0 1';
      // Note: parseFEN may or may not accept this — validateState catches
      // the king-count anomaly downstream. If parseFEN throws, we still
      // get a structured error, which is the same contract.
      const r = parseLoadGameInput(JSON.stringify({ fen }));
      expect(r.ok).toBe(false);
    });
  });
});
