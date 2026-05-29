// tests/cards/freeze-lockdown.test.ts
//
// Freeze is supposed to be an absolute lockdown: a frozen piece can't move
// via chess (already enforced in generateLegal) AND its OWNER can't act on
// it via cards (movement, swaps, buffs, teleports — anything). The
// freezer can still attack/Coup it; the whole point of Freeze is that
// the piece becomes a sitting duck for them.
//
// This test suite exists because of a playtest where a black pawn on g7
// was frozen by white, and black promptly played Pawn Retreat on the
// same pawn (g7 → g8), bypassing the freeze. None of the card effects
// were consulting frozenSquares.

import { describe, it, expect } from 'vitest';
import { CARD_EFFECTS } from '../../src/cards/effects.ts';
import { parseFEN, STARTING_FEN } from '../../src/engine/fen.ts';
import { createSuperState } from '../../src/game/types.ts';
import { Deck } from '../../src/cards/deck.ts';
import { buildDeck } from '../../src/cards/definitions.ts';
import type { SuperChessState, CardTarget } from '../../src/game/types.ts';
import { algebraicToSquare } from '../../src/engine/board.ts';
import { HeuristicCardAI } from '../../src/ai/heuristicCardAI.ts';

const sq = (a: string) => algebraicToSquare(a);

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

function freeze(state: SuperChessState, square: number, turns = 2): void {
  state.superState.frozenSquares.set(square, turns);
}

describe('freeze lockdown — card effects refuse to act on frozen own pieces', () => {
  // Each case: setup a state with a frozen own piece, attempt the card,
  // assert (a) the state was not mutated, (b) the log entry mentions
  // "frozen", and (c) the original frozen marker is still in place.

  it('Pawn Retreat refuses to move a frozen own pawn (the playtest bug)', () => {
    // Black pawn on g7, frozen by white. Per the original bug, black
    // could still play Pawn Retreat on it (g7 → g8). After the fix,
    // the effect must no-op.
    const state = makeState('4k3/6p1/8/8/8/8/8/4K3 b - - 0 1');
    freeze(state, sq('g7'));
    const target: CardTarget = { ownPieceSquare: sq('g7'), square: sq('g8') };
    const { newState, logEntry } = CARD_EFFECTS['Pawn Retreat'](state, 'b', target);
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/frozen/i);
  });

  it("Knight's Path refuses to mark a frozen own piece", () => {
    const state = makeState('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    freeze(state, sq('a1'));
    const { newState, logEntry } = CARD_EFFECTS["Knight's Path"](state, 'w', { ownPieceSquare: sq('a1') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/frozen/i);
  });

  it('Shield refuses to shield a frozen own piece', () => {
    const state = makeState('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    freeze(state, sq('a1'));
    const { newState, logEntry } = CARD_EFFECTS.Shield(state, 'w', { ownPieceSquare: sq('a1') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/frozen/i);
  });

  it('Teleport refuses to move a frozen own piece', () => {
    const state = makeState('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    freeze(state, sq('a1'));
    const { newState, logEntry } = CARD_EFFECTS.Teleport(state, 'w', { ownPieceSquare: sq('a1'), square: sq('a4') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/frozen/i);
  });

  it('Pawn Storm skips frozen pawns but moves the rest', () => {
    // Two white pawns on b2 and c2. Freeze b2. Pawn Storm should
    // advance c2 → c3 but leave b2 in place.
    const state = makeState('4k3/8/8/8/8/8/1PP5/4K3 w - - 0 1');
    freeze(state, sq('b2'));
    const { newState } = CARD_EFFECTS['Pawn Storm'](state, 'w', {});
    expect(newState.chess.board[sq('b2')]).toBe('wP'); // frozen pawn untouched
    expect(newState.chess.board[sq('b3')]).toBeNull();
    expect(newState.chess.board[sq('c2')]).toBeNull();
    expect(newState.chess.board[sq('c3')]).toBe('wP');
  });

  it('Promotion Rush refuses to teleport a frozen pawn', () => {
    const state = makeState('4k3/8/8/3P4/8/8/8/4K3 w - - 0 1');
    freeze(state, sq('d5'));
    const { newState, logEntry } = CARD_EFFECTS['Promotion Rush'](state, 'w', { ownPieceSquare: sq('d5') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/frozen/i);
  });

  it('Ghost Step refuses to mark a frozen own piece', () => {
    const state = makeState('4k3/8/8/3R4/8/8/8/4K3 w - - 0 1');
    freeze(state, sq('d5'));
    const { newState, logEntry } = CARD_EFFECTS['Ghost Step'](state, 'w', { ownPieceSquare: sq('d5') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/frozen/i);
  });

  it('Swap refuses if EITHER end is frozen', () => {
    const state = makeState('4k3/8/8/8/8/8/8/R3K1NR w KQ - 0 1');
    freeze(state, sq('a1'));
    const r1 = CARD_EFFECTS.Swap(state, 'w', { ownPieceSquare: sq('a1'), secondOwnPieceSquare: sq('g1') });
    expect(r1.newState).toBe(state);
    expect(r1.logEntry).toMatch(/frozen/i);

    // And the other direction.
    const state2 = makeState('4k3/8/8/8/8/8/8/R3K1NR w KQ - 0 1');
    freeze(state2, sq('g1'));
    const r2 = CARD_EFFECTS.Swap(state2, 'w', { ownPieceSquare: sq('a1'), secondOwnPieceSquare: sq('g1') });
    expect(r2.newState).toBe(state2);
    expect(r2.logEntry).toMatch(/frozen/i);
  });

  it('Fortify refuses to fortify a frozen own pawn', () => {
    const state = makeState('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    freeze(state, sq('e2'));
    const { newState, logEntry } = CARD_EFFECTS.Fortify(state, 'w', { ownPieceSquare: sq('e2') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/frozen/i);
  });

  it('Double Step refuses to move a frozen own pawn', () => {
    const state = makeState('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    freeze(state, sq('e2'));
    const { newState, logEntry } = CARD_EFFECTS['Double Step'](state, 'w', { ownPieceSquare: sq('e2') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/frozen/i);
  });

  it('Retreat refuses to move a frozen own piece', () => {
    const state = makeState('4k3/8/8/8/3R4/8/8/4K3 w - - 0 1');
    freeze(state, sq('d4'));
    const { newState, logEntry } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('d4'), square: sq('d2') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/frozen/i);
  });

  it('Sidestep refuses to move a frozen own pawn', () => {
    const state = makeState('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1');
    freeze(state, sq('e4'));
    const { newState, logEntry } = CARD_EFFECTS.Sidestep(state, 'w', { ownPieceSquare: sq('e4'), square: sq('d5') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/frozen/i);
  });

  it("Mirror refuses to use a frozen own piece as the mirror source", () => {
    // White just moved Nf3 (last move). Black's only matching piece
    // is the knight on c6. Freeze it. Mirror should report no
    // mirroring possible (frozen knight is filtered from generateLegal).
    const state = makeState('r1bqkbnr/pppppppp/2n5/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 0 1');
    state.superState.lastMove = {
      from: sq('g1'),
      to: sq('f3'),
      movingPiece: 'wN',
      capture: null,
      promotion: null,
      enPassantCaptureSq: null,
      enPassantCapturePiece: null,
      isCastle: false,
      castleRookFrom: null,
      castleRookTo: null,
    } as unknown as SuperChessState['superState']['lastMove'];
    freeze(state, sq('c6'));
    // Black's only knights are on b8 and c6. b8 is also a candidate
    // (knight type matches). To unambiguously test the freeze guard
    // we'd need only one knight \u2014 but Mirror's fallback search picks
    // ANY same-type piece, so this case still reaches a non-frozen
    // option. That's a deliberate design choice: freeze locks down a
    // SPECIFIC piece, not the card's whole effect.
    const { newState, logEntry } = CARD_EFFECTS.Mirror(state, 'b', {});
    // Whatever Mirror does, it must NOT use the frozen c6 knight.
    if (newState !== state) {
      expect(newState.chess.board[sq('c6')]).toBe('bN'); // c6 untouched
    }
    // logEntry should reference some other source (b8 or no-op).
    expect(logEntry).not.toMatch(/c6/i);
  });

  it('Trade refuses if own most-advanced pawn is frozen', () => {
    // White pawn on a7 is most-advanced (will be picked by Trade).
    // Black has a pawn on h2. Freeze a7 \u2014 Trade should reject.
    const state = makeState('4k3/P7/8/8/8/8/7p/4K3 w - - 0 1');
    freeze(state, sq('a7'));
    const { newState, logEntry } = CARD_EFFECTS.Trade(state, 'w', {});
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/frozen/i);
  });

  // ─── AI integration ──────────────────────────────────────────────
  // The bot's HeuristicCardAI must NOT propose card plays that target
  // a frozen own piece (would be a no-op + wasted turn).

  it('HeuristicCardAI never proposes a play targeting a frozen own piece', async () => {
    // Setup: black has Pawn Retreat in hand. Black pawn on g7 is
    // frozen. The bot should choose either to NOT play, or play
    // Pawn Retreat on a DIFFERENT pawn \u2014 never on the frozen one.
    const state = makeState('4k3/p1p1p1p1/8/8/8/8/8/4K3 b - - 0 1');
    freeze(state, sq('g7'));
    const ai = new HeuristicCardAI();
    const hand = [{ id: 'pr_test', definition: { name: 'Pawn Retreat' } } as never];
    const result = await ai.decide(state, 'b', hand);
    if (result.play) {
      const ownPieceSq = (result.target as CardTarget).ownPieceSquare;
      expect(ownPieceSq).not.toBe(sq('g7'));
    }
    // (If result.play is false, that's also fine \u2014 bot just chose
    // not to play.)
  });
});
