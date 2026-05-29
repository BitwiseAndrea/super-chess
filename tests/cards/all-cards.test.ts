// tests/cards/all-cards.test.ts
// Comprehensive per-card unit tests for every card effect.
//
// Each describe() targets one of the 20 cards from CARD_DEFINITIONS.
// Tests are written against the rules-text in src/cards/definitions.ts —
// where the implementation deviates from the rules, the test is marked
// .skip with a comment explaining the divergence, so the gap stays visible.

import { describe, it, expect } from 'vitest';
import { CARD_EFFECTS } from '../../src/cards/effects.ts';
import { tickSuperState } from '../../src/game/rules.ts';
import { CARD_DEFINITIONS, buildDeck } from '../../src/cards/definitions.ts';
import { parseFEN, STARTING_FEN } from '../../src/engine/fen.ts';
import { createSuperState } from '../../src/game/types.ts';
import { Deck } from '../../src/cards/deck.ts';
import type { SuperChessState } from '../../src/game/types.ts';
import { algebraicToSquare } from '../../src/engine/board.ts';
import type { Square, PieceColor } from '../../src/engine/types.ts';

// ─── helpers ───────────────────────────────────────────────────────────────

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

function sq(alg: string): Square {
  return algebraicToSquare(alg);
}

function pawnCount(state: SuperChessState, color: PieceColor): number {
  return state.chess.board.filter((p) => p === color + 'P').length;
}

// ─── definitions metadata ──────────────────────────────────────────────────

describe('CARD_DEFINITIONS', () => {
  it('defines exactly 22 unique cards (20 original + Pawn Retreat + Sidestep)', () => {
    const names = new Set(CARD_DEFINITIONS.map((c) => c.name));
    expect(names.size).toBe(22);
  });

  it('every definition has an effect implementation', () => {
    for (const def of CARD_DEFINITIONS) {
      expect(
        CARD_EFFECTS[def.name],
        `missing effect for ${def.name}`,
      ).toBeTypeOf('function');
    }
  });

  it('every effect has a definition', () => {
    for (const name of Object.keys(CARD_EFFECTS)) {
      const def = CARD_DEFINITIONS.find((d) => d.name === name);
      expect(def, `effect ${name} has no matching definition`).toBeDefined();
    }
  });
});

// ─── individual card tests ─────────────────────────────────────────────────

describe("Knight's Path", () => {
  it('sets knightsPathSquare to the targeted piece', () => {
    const state = makeState();
    const target = sq('b1'); // white knight
    const { newState } = CARD_EFFECTS["Knight's Path"](state, 'w', { ownPieceSquare: target });
    expect(newState.superState.knightsPathSquare).toBe(target);
  });

  it('does not mutate the input state', () => {
    const state = makeState();
    CARD_EFFECTS["Knight's Path"](state, 'w', { ownPieceSquare: sq('b1') });
    expect(state.superState.knightsPathSquare).toBeNull();
  });

  it('rejects an invalid target (empty square)', () => {
    const state = makeState();
    const { newState, logEntry } = CARD_EFFECTS["Knight's Path"](state, 'w', { ownPieceSquare: sq('e4') });
    expect(newState).toBe(state); // unchanged
    expect(logEntry).toMatch(/invalid/i);
  });
});

describe('Freeze', () => {
  it('freezes an opponent piece with a 1-ply timer (POST card timing)', () => {
    const state = makeState();
    const target = sq('e7'); // black pawn
    const { newState } = CARD_EFFECTS.Freeze(state, 'w', { oppPieceSquare: target });
    // 1 ply, not 2 — see SuperState type comment. Freeze is a POST card,
    // so the setter's move-tick fires BEFORE the freeze is set; that means
    // 1 → 0 on the opponent's tick clears it cleanly. With timer=2 the
    // freeze leaks into the SETTER's next turn (playtester complaint).
    expect(newState.superState.frozenSquares.get(target)).toBe(1);
  });

  it('refuses to freeze the king', () => {
    const state = makeState();
    const { newState, logEntry } = CARD_EFFECTS.Freeze(state, 'w', { oppPieceSquare: sq('e8') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/king/i);
  });

  // Regression for the "Freeze leaks into setter's next turn" complaint. We
  // mimic the real POST-card flow: Freeze fires AFTER the setter's move-tick
  // (so we don't simulate that tick here). Then the opponent has a ply that
  // ticks at the end. After the opponent's tick the freeze MUST be cleared,
  // so the setter's next turn does NOT see it.
  it('is active during opponent\u2019s ply and cleared before setter\u2019s next turn', () => {
    const state = makeState();
    const target = sq('e7');
    const afterPlay = CARD_EFFECTS.Freeze(state, 'w', { oppPieceSquare: target }).newState;
    // Effect is live for the opponent's upcoming ply.
    expect(afterPlay.superState.frozenSquares.get(target)).toBe(1);
    // Opponent's tick (end of black's move) clears it.
    const afterOppTick = { ...afterPlay, superState: tickSuperState(afterPlay.superState) };
    expect(afterOppTick.superState.frozenSquares.has(target)).toBe(false);
  });
});

describe('Shield', () => {
  it('shields a piece with a 1-ply timer (POST card timing)', () => {
    const state = makeState();
    const target = sq('e2');
    const { newState } = CARD_EFFECTS.Shield(state, 'w', { ownPieceSquare: target });
    expect(newState.superState.shieldedSquares.get(target)).toBe('w');
    // 1 ply: Shield is POST, so the setter's tick has already happened.
    // Opp's tick will drop it cleanly to 0 by our next turn. See
    // SuperState type comment.
    expect(newState.superState.shieldTurns.get(target)).toBe(1);
  });

  it('does nothing if the source square is empty', () => {
    const state = makeState();
    const { newState, logEntry } = CARD_EFFECTS.Shield(state, 'w', { ownPieceSquare: sq('e4') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/invalid/i);
  });
});

describe('Extra Move', () => {
  it('flags the played color as having an extra move pending', () => {
    const state = makeState();
    const { newState } = CARD_EFFECTS['Extra Move'](state, 'b', {});
    expect(newState.superState.extraMoveRemaining).toBe('b');
  });

  // Regression: tickSuperState used to clobber extraMoveRemaining = null on
  // every turn-end, which silently neutralised the card. The flag must
  // survive a tick so the bonus-move handler downstream can read it.
  it('preserves extraMoveRemaining through tickSuperState', () => {
    const state = makeState();
    const { newState } = CARD_EFFECTS['Extra Move'](state, 'w', {});
    const ticked = tickSuperState(newState.superState);
    expect(ticked.extraMoveRemaining).toBe('w');
  });
});

describe('Coup', () => {
  it('removes a reachable opponent piece from the board', () => {
    // White queen on d1 attacks d7 (open file).
    const state = makeState('rnbqkbnr/ppp1pppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const victim = sq('d7'); // there is no piece at d7 in this FEN, place one
    const customFen = '8/3p4/8/8/8/8/8/3Q3K w - - 0 1';
    const custom = makeState(customFen);
    const { newState, materialDelta } = CARD_EFFECTS.Coup(custom, 'w', { oppPieceSquare: sq('d7') });
    expect(newState.chess.board[sq('d7')]).toBeNull();
    expect(materialDelta).toBe(1); // pawn value in effects.ts pieceValueFor
    void state; void victim;
  });

  it('refuses to coup an unreachable piece', () => {
    // Lone king vs lone king + pawn: pawn unreachable.
    const state = makeState('4k3/8/8/8/8/8/p7/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Coup(state, 'w', { oppPieceSquare: sq('a2') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/reachable/i);
  });

  it('refuses to coup the king', () => {
    const state = makeState('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Coup(state, 'w', { oppPieceSquare: sq('e8') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/king/i);
  });
});

describe('Resurrection', () => {
  it('places a captured minor piece back on an empty home-rank square', () => {
    const state = makeState();
    // Prime: pretend black captured our knight previously.
    state.superState.capturedByColor.get('b')!.push('wN');
    const dest = sq('b1'); // wait — b1 has the knight already
    // Better: clear b1.
    state.chess.board[sq('b1')] = null;
    const { newState } = CARD_EFFECTS.Resurrection(state, 'w', { square: dest });
    expect(newState.chess.board[dest]).toBe('wN');
    // captured pile should be empty after consumption
    expect(newState.superState.capturedByColor.get('b')!).not.toContain('wN');
  });

  it('returns the input state if no eligible piece is in the captured pile', () => {
    const state = makeState();
    state.chess.board[sq('e1')] = null; // make sure there's a free home-rank sq
    const { newState, logEntry } = CARD_EFFECTS.Resurrection(state, 'w', { square: sq('e1') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/no eligible/i);
  });

  it('refuses to place outside own back two ranks', () => {
    const state = makeState();
    state.superState.capturedByColor.get('b')!.push('wB');
    const { newState, logEntry } = CARD_EFFECTS.Resurrection(state, 'w', { square: sq('e4') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/back 2 ranks/i);
  });

  it('refuses to place on an occupied square', () => {
    const state = makeState();
    state.superState.capturedByColor.get('b')!.push('wN');
    const { newState, logEntry } = CARD_EFFECTS.Resurrection(state, 'w', { square: sq('e1') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/not empty/i);
  });
});

describe('Teleport', () => {
  it('moves a piece to any empty square', () => {
    const state = makeState('8/8/8/8/8/8/8/4K2R w - - 0 1');
    const { newState } = CARD_EFFECTS.Teleport(state, 'w', { ownPieceSquare: sq('h1'), square: sq('h5') });
    expect(newState.chess.board[sq('h1')]).toBeNull();
    expect(newState.chess.board[sq('h5')]).toBe('wR');
  });

  it('refuses to teleport to an occupied square', () => {
    const state = makeState();
    const { newState, logEntry } = CARD_EFFECTS.Teleport(state, 'w', { ownPieceSquare: sq('e2'), square: sq('e1') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/not empty/i);
  });

  it('moves a shield along with the piece', () => {
    const state = makeState('8/8/8/8/8/8/8/4K2R w - - 0 1');
    state.superState.shieldedSquares.set(sq('h1'), 'w');
    state.superState.shieldTurns.set(sq('h1'), 2);
    const { newState } = CARD_EFFECTS.Teleport(state, 'w', { ownPieceSquare: sq('h1'), square: sq('h5') });
    expect(newState.superState.shieldedSquares.has(sq('h1'))).toBe(false);
    expect(newState.superState.shieldedSquares.get(sq('h5'))).toBe('w');
    expect(newState.superState.shieldTurns.get(sq('h5'))).toBe(2);
  });

  it('rejects teleporting a pawn to its promotion rank', () => {
    // Regression: this used to leave a wP on a8 (back rank) without
    // promoting it, which broke validateState. Caught by the
    // full-game-validation fuzz once maxHandSize \u2265 3 surfaced more
    // card plays.
    const state = makeState('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Teleport(state, 'w', { ownPieceSquare: sq('a7'), square: sq('a8') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/promotion/i);
  });

  it('rejects teleporting a black pawn to its promotion rank (row 7)', () => {
    const state = makeState('4k3/8/8/8/8/8/p7/4K3 b - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Teleport(state, 'b', { ownPieceSquare: sq('a2'), square: sq('a1') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/promotion/i);
  });
});

describe('Pawn Storm', () => {
  it('advances every unblocked own pawn by one square', () => {
    const state = makeState();
    const before = pawnCount(state, 'w');
    const { newState } = CARD_EFFECTS['Pawn Storm'](state, 'w', {});
    expect(pawnCount(newState, 'w')).toBe(before);
    // every pawn is on rank 3 (row 5) afterwards
    for (let file = 0; file < 8; file++) {
      expect(newState.chess.board[sq(String.fromCharCode(97 + file) + '3')]).toBe('wP');
      expect(newState.chess.board[sq(String.fromCharCode(97 + file) + '2')]).toBeNull();
    }
  });

  it('does not advance pawns into occupied squares', () => {
    // Black pawn on e3 blocks the white e-pawn.
    const state = makeState('rnbqkbnr/pppppppp/8/8/8/4p3/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const { newState } = CARD_EFFECTS['Pawn Storm'](state, 'w', {});
    expect(newState.chess.board[sq('e2')]).toBe('wP'); // still there
    expect(newState.chess.board[sq('e3')]).toBe('bP');
  });

  it('auto-promotes pawns reaching the back rank to a queen', () => {
    const state = makeState('8/P7/8/8/8/8/8/4K2k w - - 0 1');
    const { newState } = CARD_EFFECTS['Pawn Storm'](state, 'w', {});
    expect(newState.chess.board[sq('a8')]).toBe('wQ');
    expect(newState.chess.board[sq('a7')]).toBeNull();
  });

  it('only advances pawns of the played color', () => {
    const state = makeState();
    const blackBefore = pawnCount(state, 'b');
    const { newState } = CARD_EFFECTS['Pawn Storm'](state, 'w', {});
    expect(pawnCount(newState, 'b')).toBe(blackBefore);
    // black's pawns still all on rank 7
    for (let file = 0; file < 8; file++) {
      expect(newState.chess.board[sq(String.fromCharCode(97 + file) + '7')]).toBe('bP');
    }
  });

  // ─── color symmetry ──────────────────────────────────────────────────────
  //
  // Regression: original implementation iterated the board 0→63 while writing
  // moved pawns ahead of the cursor. For black (dir=+8) that re-read each
  // just-moved pawn and advanced it AGAIN, cascading every black pawn down
  // to rank 3 instead of rank 6. The four white-only tests above never
  // exercised this. The next four mirror them for black.

  it('advances every unblocked black pawn by exactly one square', () => {
    const state = makeState();
    const before = pawnCount(state, 'b');
    const { newState } = CARD_EFFECTS['Pawn Storm'](state, 'b', {});
    expect(pawnCount(newState, 'b')).toBe(before);
    for (let file = 0; file < 8; file++) {
      const f = String.fromCharCode(97 + file);
      // each pawn moved from rank 7 to rank 6 — one square, not five.
      expect(newState.chess.board[sq(f + '6')]).toBe('bP');
      expect(newState.chess.board[sq(f + '7')]).toBeNull();
      // explicitly assert the cascade bug is gone: nothing past rank 6.
      expect(newState.chess.board[sq(f + '5')]).toBeNull();
      expect(newState.chess.board[sq(f + '4')]).toBeNull();
      expect(newState.chess.board[sq(f + '3')]).toBeNull();
    }
  });

  it('black: does not advance pawns into occupied squares', () => {
    // White pawn on e6 blocks the black e-pawn.
    const state = makeState('rnbqkbnr/pppppppp/4P3/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    const { newState } = CARD_EFFECTS['Pawn Storm'](state, 'b', {});
    expect(newState.chess.board[sq('e7')]).toBe('bP'); // blocked, still on e7
    expect(newState.chess.board[sq('e6')]).toBe('wP'); // blocker untouched
    // other black pawns still moved one square (not cascaded).
    expect(newState.chess.board[sq('d6')]).toBe('bP');
    expect(newState.chess.board[sq('d7')]).toBeNull();
    expect(newState.chess.board[sq('d5')]).toBeNull(); // would be set if cascading
  });

  it('black: auto-promotes pawns reaching the back rank to a queen', () => {
    const state = makeState('4k2K/8/8/8/8/8/p7/8 b - - 0 1');
    const { newState } = CARD_EFFECTS['Pawn Storm'](state, 'b', {});
    expect(newState.chess.board[sq('a1')]).toBe('bQ');
    expect(newState.chess.board[sq('a2')]).toBeNull();
  });

  it('black: only advances pawns of the played color', () => {
    const state = makeState();
    const whiteBefore = pawnCount(state, 'w');
    const { newState } = CARD_EFFECTS['Pawn Storm'](state, 'b', {});
    expect(pawnCount(newState, 'w')).toBe(whiteBefore);
    for (let file = 0; file < 8; file++) {
      expect(newState.chess.board[sq(String.fromCharCode(97 + file) + '2')]).toBe('wP');
    }
  });
});

describe('Promotion Rush', () => {
  it('teleports a pawn to the rank just before promotion', () => {
    const state = makeState('8/8/8/8/8/8/4P3/4K2k w - - 0 1');
    const { newState } = CARD_EFFECTS['Promotion Rush'](state, 'w', { ownPieceSquare: sq('e2') });
    expect(newState.chess.board[sq('e7')]).toBe('wP'); // rank just below promotion
    expect(newState.chess.board[sq('e2')]).toBeNull();
  });

  it('refuses if the pawn is already at the pre-promotion rank', () => {
    const state = makeState('8/4P3/8/8/8/8/8/4K2k w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS['Promotion Rush'](state, 'w', { ownPieceSquare: sq('e7') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/already/i);
  });

  it('refuses if the destination is blocked', () => {
    const state = makeState('4r3/8/8/8/8/8/4P3/4K2k w - - 0 1');
    // Move the rook to e7 so the destination is blocked.
    state.chess.board[sq('e7')] = 'bR';
    state.chess.board[sq('e8')] = null;
    const { newState, logEntry } = CARD_EFFECTS['Promotion Rush'](state, 'w', { ownPieceSquare: sq('e2') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/blocked/i);
  });

  it('refuses to target a non-pawn', () => {
    const state = makeState();
    const { newState, logEntry } = CARD_EFFECTS['Promotion Rush'](state, 'w', { ownPieceSquare: sq('b1') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/pawn/i);
  });
});

describe('Ghost Step', () => {
  it('flags one piece as phasing for next move', () => {
    const state = makeState();
    const { newState } = CARD_EFFECTS['Ghost Step'](state, 'w', { ownPieceSquare: sq('d1') });
    expect(newState.superState.ghostStepSquare).toBe(sq('d1'));
  });
});

describe('Swap', () => {
  it('exchanges the positions of two of the player\u2019s own pieces', () => {
    const state = makeState();
    const { newState } = CARD_EFFECTS.Swap(state, 'w', { ownPieceSquare: sq('b1'), secondOwnPieceSquare: sq('g1') });
    expect(newState.chess.board[sq('b1')]).toBe('wN'); // knights are symmetric, still wN
    expect(newState.chess.board[sq('g1')]).toBe('wN');
    // Use distinct types to confirm
    const queenKing = makeState();
    const { newState: nq } = CARD_EFFECTS.Swap(queenKing, 'w', { ownPieceSquare: sq('d1'), secondOwnPieceSquare: sq('a1') });
    expect(nq.chess.board[sq('d1')]).toBe('wR');
    expect(nq.chess.board[sq('a1')]).toBe('wQ');
  });

  it('refuses to swap if either piece is not own', () => {
    const state = makeState();
    const { newState, logEntry } = CARD_EFFECTS.Swap(state, 'w', { ownPieceSquare: sq('e2'), secondOwnPieceSquare: sq('e7') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/own/i);
  });

  // Regression: shield ownership used to be re-set to the caller after a
  // swap, which would silently overwrite who owned the shield. We now
  // preserve the actual stored owner from the map.
  it('preserves shield owner + remaining turns through a swap', () => {
    const state = makeState();
    // Place a shield on d1 (white queen) owned by white with 2 turns left.
    state.superState.shieldedSquares.set(sq('d1'), 'w');
    state.superState.shieldTurns.set(sq('d1'), 2);

    const { newState } = CARD_EFFECTS.Swap(state, 'w', {
      ownPieceSquare: sq('d1'),
      secondOwnPieceSquare: sq('a1'),
    });

    // The shield should now be on a1 (the destination of the d1 piece),
    // still owned by 'w', still 2 turns left.
    expect(newState.superState.shieldedSquares.get(sq('a1'))).toBe('w');
    expect(newState.superState.shieldTurns.get(sq('a1'))).toBe(2);
    expect(newState.superState.shieldedSquares.get(sq('d1'))).toBeUndefined();
  });

  it('rejects a swap that would land a pawn on its promotion rank', () => {
    // Regression: Swap used to silently leave a pawn on the back rank
    // without promoting it (breaks validateState). Caught by the
    // full-game-validation fuzz once maxHandSize \u2265 3.
    // Setup: white knight on a8 + white pawn on a7. Swapping them
    // would put the pawn on a8 \u2014 a no-promotion back-rank pawn.
    const state = makeState('N3k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Swap(state, 'w', {
      ownPieceSquare: sq('a7'),
      secondOwnPieceSquare: sq('a8'),
    });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/promotion/i);
  });

  it('rejects a swap symmetrically for black pawns', () => {
    // Black knight on a1 + black pawn on a2. Swapping would put the
    // black pawn on a1 \u2014 black's promotion rank.
    const state = makeState('4k3/8/8/8/8/8/p7/n3K3 b - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Swap(state, 'b', {
      ownPieceSquare: sq('a2'),
      secondOwnPieceSquare: sq('a1'),
    });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/promotion/i);
  });
});

describe('Fortify', () => {
  it('marks one pawn as moving like a rook this turn', () => {
    const state = makeState();
    const { newState } = CARD_EFFECTS.Fortify(state, 'w', { ownPieceSquare: sq('e2') });
    expect(newState.superState.fortifiedPawnSquare).toBe(sq('e2'));
  });

  it('refuses to target a non-pawn', () => {
    const state = makeState();
    const { newState, logEntry } = CARD_EFFECTS.Fortify(state, 'w', { ownPieceSquare: sq('b1') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/pawn/i);
  });
});

describe('Double Step', () => {
  it('moves a pawn two squares forward from any rank', () => {
    const state = makeState('8/8/8/8/8/4P3/8/4K2k w - - 0 1');
    const { newState } = CARD_EFFECTS['Double Step'](state, 'w', { ownPieceSquare: sq('e3') });
    expect(newState.chess.board[sq('e5')]).toBe('wP');
    expect(newState.chess.board[sq('e3')]).toBeNull();
    expect(newState.chess.enPassantSquare).toBe(sq('e4'));
  });

  it('refuses to jump over a blocking piece', () => {
    const state = makeState('8/8/8/8/4n3/4P3/8/4K2k w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS['Double Step'](state, 'w', { ownPieceSquare: sq('e3') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/blocked/i);
  });

  it('auto-promotes if the destination is the back rank', () => {
    // White pawn on a6 doing double-step lands on a8.
    const state = makeState('8/8/P7/8/8/8/8/4K2k w - - 0 1');
    const { newState } = CARD_EFFECTS['Double Step'](state, 'w', { ownPieceSquare: sq('a6') });
    expect(newState.chess.board[sq('a8')]).toBe('wQ');
    expect(newState.chess.enPassantSquare).toBeNull(); // no e.p. on promotion
  });

  it('refuses to target a non-pawn', () => {
    const state = makeState();
    const { newState, logEntry } = CARD_EFFECTS['Double Step'](state, 'w', { ownPieceSquare: sq('b1') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/pawn/i);
  });
});

describe('Retreat', () => {
  it('moves a queen 2 squares straight backward', () => {
    const state = makeState('8/8/8/8/4Q3/8/8/4K2k w - - 0 1');
    const { newState } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e4'), square: sq('e2') });
    expect(newState.chess.board[sq('e4')]).toBeNull();
    expect(newState.chess.board[sq('e2')]).toBe('wQ');
  });

  it('moves a queen 2 squares diagonally backward', () => {
    const state = makeState('8/8/8/8/4Q3/8/8/4K2k w - - 0 1');
    const { newState } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e4'), square: sq('c2') });
    expect(newState.chess.board[sq('c2')]).toBe('wQ');
  });

  it('refuses to move to an occupied square', () => {
    const state = makeState();
    const { newState, logEntry } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e2'), square: sq('e1') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/occupied/i);
  });

  it('refuses to move a piece forward (toward the opponent)', () => {
    const state = makeState('8/8/8/4Q3/8/8/8/4K2k w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e5'), square: sq('e7') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/backward/i);
  });

  it('refuses to move more than 2 squares backward', () => {
    // King out of the way on h1; queen on e5 tries to retreat all the way to e1.
    const state = makeState('8/8/8/4Q3/8/8/8/7K w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e5'), square: sq('e1') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/backward/i);
  });

  it('refuses to move a rook sideways (sideways is not backward)', () => {
    const state = makeState('8/8/8/8/4R3/8/8/4K2k w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e4'), square: sq('g4') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/backward/i);
  });

  it('refuses to move a bishop along the file (not its movement axis)', () => {
    const state = makeState('8/8/8/8/4B3/8/8/4K2k w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e4'), square: sq('e2') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/backward|axes/i);
  });

  it('allows a knight to retreat in an L (toward home)', () => {
    const state = makeState('8/8/8/4N3/8/8/8/4K2k w - - 0 1');
    const { newState } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e5'), square: sq('d7') });
    // d7 is FORWARD for white (toward rank 8). Should be rejected.
    expect(newState).toBe(state);
    const { newState: ok } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e5'), square: sq('d3') });
    expect(ok.chess.board[sq('d3')]).toBe('wN');
  });

  it('allows a pawn to retreat 1 square along its file', () => {
    const state = makeState('8/8/8/8/4P3/8/8/4K2k w - - 0 1');
    const { newState } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e4'), square: sq('e3') });
    expect(newState.chess.board[sq('e3')]).toBe('wP');
  });

  it('allows a pawn to retreat 2 squares if the path is clear', () => {
    const state = makeState('8/8/8/8/4P3/8/8/4K2k w - - 0 1');
    const { newState } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e4'), square: sq('e2') });
    expect(newState.chess.board[sq('e2')]).toBe('wP');
  });

  it('blocks a 2-square pawn retreat if the intermediate square is occupied', () => {
    // Place a friendly piece on e3 to block.
    const state = makeState('8/8/8/8/4P3/4B3/8/4K2k w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e4'), square: sq('e2') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/backward|axes/i);
  });

  it('refuses to leave the king in check', () => {
    // White bishop on c3 is pinned to the e1 king by the black queen on a5
    // along the a5-e1 diagonal. Retreating c3 \u2192 b2 (a backward-diagonal
    // bishop move) leaves the pin and exposes the king.
    const state = makeState('8/8/8/q7/8/2B5/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('c3'), square: sq('b2') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/check/i);
  });

  it('works symmetrically for black (backward is toward rank 8)', () => {
    // Black queen on e5 retreating to e7 should succeed for black; e3 should fail.
    const state = makeState('4k3/8/8/4q3/8/8/8/4K3 b - - 0 1');
    const { newState: ok } = CARD_EFFECTS.Retreat(state, 'b', { ownPieceSquare: sq('e5'), square: sq('e7') });
    expect(ok.chess.board[sq('e7')]).toBe('bQ');
    const { newState: bad } = CARD_EFFECTS.Retreat(state, 'b', { ownPieceSquare: sq('e5'), square: sq('e3') });
    expect(bad).toBe(state);
  });
});

describe('Pawn Retreat', () => {
  it('moves a pawn 1 square straight backward to an empty square', () => {
    // White pawn on e4 retreats to e3 (no other pieces in the way).
    const state = makeState('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1');
    const { newState } = CARD_EFFECTS['Pawn Retreat'](state, 'w', { ownPieceSquare: sq('e4'), square: sq('e3') });
    expect(newState.chess.board[sq('e4')]).toBeNull();
    expect(newState.chess.board[sq('e3')]).toBe('wP');
  });

  it('moves a pawn 1 square diagonally backward to an empty square', () => {
    // White pawn on e4 retreats diagonally to d3 \u2014 must be empty.
    const state = makeState('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1');
    const { newState } = CARD_EFFECTS['Pawn Retreat'](state, 'w', { ownPieceSquare: sq('e4'), square: sq('d3') });
    expect(newState.chess.board[sq('e4')]).toBeNull();
    expect(newState.chess.board[sq('d3')]).toBe('wP');
  });

  it('moves a pawn diagonally backward on the other diagonal too', () => {
    const state = makeState('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1');
    const { newState } = CARD_EFFECTS['Pawn Retreat'](state, 'w', { ownPieceSquare: sq('e4'), square: sq('f3') });
    expect(newState.chess.board[sq('e4')]).toBeNull();
    expect(newState.chess.board[sq('f3')]).toBe('wP');
  });

  it('rejects a 2-square retreat', () => {
    const state = makeState('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS['Pawn Retreat'](state, 'w', { ownPieceSquare: sq('e4'), square: sq('e2') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/one square/i);
  });

  it('rejects a 2-square diagonal retreat', () => {
    // 2-square diagonal (knight\u2019s-move-shaped) is not a valid 1-step retreat.
    const state = makeState('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS['Pawn Retreat'](state, 'w', { ownPieceSquare: sq('e4'), square: sq('c2') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/one square|straight or one square diagonal/i);
  });

  it('rejects a sideways move (must change rank)', () => {
    // Same rank, adjacent file \u2014 not backward at all.
    const state = makeState('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS['Pawn Retreat'](state, 'w', { ownPieceSquare: sq('e4'), square: sq('d4') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/one square backward/i);
  });

  it('rejects a forward move (must be backward)', () => {
    const state = makeState('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS['Pawn Retreat'](state, 'w', { ownPieceSquare: sq('e4'), square: sq('e5') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/one square backward/i);
  });

  it('rejects retreat onto an occupied square (no capture, even diagonally)', () => {
    // Black knight on d3 blocks the diagonal retreat. Must be empty.
    const state = makeState('4k3/8/8/8/4P3/3n4/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS['Pawn Retreat'](state, 'w', { ownPieceSquare: sq('e4'), square: sq('d3') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/empty/i);
  });

  it('rejects retreat onto an occupied square (straight)', () => {
    const state = makeState('4k3/8/8/8/4P3/4P3/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS['Pawn Retreat'](state, 'w', { ownPieceSquare: sq('e4'), square: sq('e3') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/empty/i);
  });

  it('rejects targeting a non-pawn', () => {
    const state = makeState('4k3/8/8/8/4N3/8/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS['Pawn Retreat'](state, 'w', { ownPieceSquare: sq('e4'), square: sq('e3') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/pawn/i);
  });

  it('rejects a retreat that would leave the king in check', () => {
    // White pawn on d2 blocks a check from a black bishop on h6.
    // Retreating it (straight or diagonal) exposes the king. We use
    // d2 \u2192 d1 to keep the test focused on the king-in-check guard.
    const state = makeState('4k3/8/7b/8/8/8/3P4/2K5 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS['Pawn Retreat'](state, 'w', { ownPieceSquare: sq('d2'), square: sq('d1') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/check/i);
  });

  it('works symmetrically for black (backward = toward rank 8)', () => {
    const state = makeState('4k3/8/8/8/4p3/8/8/4K3 b - - 0 1');
    const { newState } = CARD_EFFECTS['Pawn Retreat'](state, 'b', { ownPieceSquare: sq('e4'), square: sq('e5') });
    expect(newState.chess.board[sq('e4')]).toBeNull();
    expect(newState.chess.board[sq('e5')]).toBe('bP');
  });

  it('works diagonally for black too', () => {
    const state = makeState('4k3/8/8/8/4p3/8/8/4K3 b - - 0 1');
    const { newState } = CARD_EFFECTS['Pawn Retreat'](state, 'b', { ownPieceSquare: sq('e4'), square: sq('f5') });
    expect(newState.chess.board[sq('e4')]).toBeNull();
    expect(newState.chess.board[sq('f5')]).toBe('bP');
  });
});

describe('Sidestep', () => {
  it('moves a pawn 1 square diagonally forward to an empty square', () => {
    const state = makeState('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1');
    const { newState } = CARD_EFFECTS.Sidestep(state, 'w', { ownPieceSquare: sq('e4'), square: sq('d5') });
    expect(newState.chess.board[sq('e4')]).toBeNull();
    expect(newState.chess.board[sq('d5')]).toBe('wP');
  });

  it('rejects diagonal backward (must be forward)', () => {
    const state = makeState('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Sidestep(state, 'w', { ownPieceSquare: sq('e4'), square: sq('d3') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/forward/i);
  });

  it('rejects straight-forward (not diagonal)', () => {
    const state = makeState('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Sidestep(state, 'w', { ownPieceSquare: sq('e4'), square: sq('e5') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/diagonal/i);
  });

  it('rejects a capture (destination must be empty)', () => {
    // White pawn on e4, black knight on d5. Sidestep is non-capturing.
    const state = makeState('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Sidestep(state, 'w', { ownPieceSquare: sq('e4'), square: sq('d5') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/empty/i);
  });

  it('auto-promotes when landing on the promotion rank', () => {
    // White pawn on e7 sidesteps to d8 \u2014 lands on promotion rank.
    const state = makeState('4k3/4P3/8/8/8/8/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Sidestep(state, 'w', { ownPieceSquare: sq('e7'), square: sq('d8') });
    expect(newState.chess.board[sq('d8')]).toBe('wQ');
    expect(logEntry).toMatch(/promoted/i);
  });

  it('rejects a sidestep that would leave the king in check', () => {
    // h6-c1 diagonal: h6, g5, f4, e3, d2, c1. Pawn on d2 blocks the
    // bishop's attack on white king at c1. Sidestepping d2 -> c3 (or
    // e3) clears the block and exposes the king.
    const state = makeState('4k3/8/7b/8/8/8/3P4/2K5 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Sidestep(state, 'w', { ownPieceSquare: sq('d2'), square: sq('c3') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/check/i);
  });

  it('rejects targeting a non-pawn', () => {
    const state = makeState('4k3/8/8/8/4N3/8/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Sidestep(state, 'w', { ownPieceSquare: sq('e4'), square: sq('d5') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/pawn/i);
  });

  it('works symmetrically for black (forward = toward rank 1)', () => {
    const state = makeState('4k3/8/8/8/4p3/8/8/4K3 b - - 0 1');
    const { newState } = CARD_EFFECTS.Sidestep(state, 'b', { ownPieceSquare: sq('e4'), square: sq('d3') });
    expect(newState.chess.board[sq('e4')]).toBeNull();
    expect(newState.chess.board[sq('d3')]).toBe('bP');
  });
});

describe('Foul Ground', () => {
  it('marks a square as fouled for the opponent with a 1-ply timer (POST card)', () => {
    const state = makeState();
    const target = sq('e4');
    const { newState } = CARD_EFFECTS['Foul Ground'](state, 'w', { square: target });
    expect(newState.superState.foulSquares.get(target)).toBe('b');
    // 1 ply: Foul Ground is POST, so the setter's move-tick has already
    // happened by the time it fires. Opp's tick clears it before our
    // next turn. See SuperState type comment.
    expect(newState.superState.foulTurns.get(target)).toBe(1);
  });

  // Regression: the foul MUST be active during the opponent's move AND
  // be gone before the setter's next turn (no leak). Since Foul Ground
  // is POST, we don't simulate a setter's tick — the real flow has it
  // already happened in commitMove.
  it('is active for opponent\u2019s ply and cleared before setter\u2019s next turn', () => {
    const state = makeState();
    const target = sq('e4');
    const afterPlay = CARD_EFFECTS['Foul Ground'](state, 'w', { square: target }).newState;
    expect(afterPlay.superState.foulSquares.get(target)).toBe('b');
    expect(afterPlay.superState.foulTurns.get(target)).toBe(1);
    const afterOppTick = { ...afterPlay, superState: tickSuperState(afterPlay.superState) };
    expect(afterOppTick.superState.foulSquares.has(target)).toBe(false);
    expect(afterOppTick.superState.foulTurns.has(target)).toBe(false);
  });
});

describe('Disrupt', () => {
  it('forces the opponent to move a specific piece type next turn (2-ply timer)', () => {
    const state = makeState();
    const { newState } = CARD_EFFECTS.Disrupt(state, 'w', { pieceType: 'N' });
    expect(newState.superState.mustMoveType.get('b')).toBe('N');
    expect(newState.superState.mustMoveTurns.get('b')).toBe(2);
  });

  // Regression: Disrupt was being wiped on the setter's tick, so the
  // opponent was never actually constrained.
  it('persists through opponent\u2019s ply and clears after their tick', () => {
    const state = makeState();
    const after = CARD_EFFECTS.Disrupt(state, 'w', { pieceType: 'N' }).newState;
    const afterSetterTick = { ...after, superState: tickSuperState(after.superState) };
    expect(afterSetterTick.superState.mustMoveType.get('b')).toBe('N');
    expect(afterSetterTick.superState.mustMoveTurns.get('b')).toBe(1);
    const afterOppTick = { ...afterSetterTick, superState: tickSuperState(afterSetterTick.superState) };
    expect(afterOppTick.superState.mustMoveType.has('b')).toBe(false);
    expect(afterOppTick.superState.mustMoveTurns.has('b')).toBe(false);
  });

  it('refuses if no piece type is provided', () => {
    const state = makeState();
    const { newState, logEntry } = CARD_EFFECTS.Disrupt(state, 'w', {});
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/piece type/i);
  });
});

describe('Mirror', () => {
  it('does nothing if there is no last move on record', () => {
    const state = makeState();
    const { newState, logEntry } = CARD_EFFECTS.Mirror(state, 'w', {});
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/no last move/i);
  });

  // Regression: the old implementation tried to read the moving piece from
  // `state.chess.board[lastMove.from]`, falling back to `opp + lastMove.color[1]`
  // when that square was empty. But `lastMove.color` is 'w' or 'b', so [1] is
  // `undefined`, producing literal strings like "bundefined". Now Mirror reads
  // the piece directly from lastMove.movingPiece.
  it('reads movingPiece from lastMove, not the (possibly vacated) from-square', () => {
    const state = makeState();
    // Black moved a knight from b8 → c6, then on a later turn captured with
    // it (so b8 stays empty AND c6 may now hold something else). The old
    // code path would mis-identify the piece here.
    state.superState.lastMove = {
      movingPiece: 'bN',
      from: sq('b8'),
      to: sq('c6'),
      capture: null, promotion: null, isCastle: false,
      enPassantCaptureSq: null, newEnPassantSq: null,
      algebraic: 'Nc6', color: 'b', turnNumber: 1,
    } as never;
    // Now wipe both squares so the old "board[lastMove.from]" lookup returns
    // null and the broken fallback would have fired.
    state.chess.board[sq('b8')] = null;
    state.chess.board[sq('c6')] = null;

    const { newState, logEntry } = CARD_EFFECTS.Mirror(state, 'w', {});

    // A white knight should have moved (Mirror finds a same-typed reply).
    expect(newState).not.toBe(state);
    expect(logEntry).toMatch(/^Mirror: wN /); // not "bundefined" or similar
    const knightsStillHome = [sq('b1'), sq('g1')]
      .filter((s) => newState.chess.board[s] === 'wN').length;
    expect(knightsStillHome).toBeLessThan(2);
  });

  it('replays the opponent\u2019s last move using a same-typed piece of the player', () => {
    // Set up a state with both sides having knights symmetric.
    // Opponent (black) last moved Nb8-c6.
    const state = makeState();
    state.superState.lastMove = {
      movingPiece: 'bN',
      from: sq('b8'),
      to: sq('c6'),
      capture: null,
      promotion: null,
      isCastle: false,
      enPassantCaptureSq: null,
      newEnPassantSq: null,
      algebraic: 'Nc6',
      color: 'b',
      turnNumber: 1,
    } as never;
    // Move the black knight off c6 so the destination would be conceptually open,
    // but white's own knight should be able to reach c3-ish.
    const { newState } = CARD_EFFECTS.Mirror(state, 'w', {});
    // White had Nb1 and Ng1 available; one should have moved.
    // We can't be precise about destination because the implementation falls
    // back to "any legal move of that piece type" — assert at least that a
    // white knight moved somewhere.
    const whiteKnightSquaresBefore = [sq('b1'), sq('g1')];
    const knightsStillHome = whiteKnightSquaresBefore.filter((s) => newState.chess.board[s] === 'wN').length;
    expect(knightsStillHome).toBeLessThan(2);
  });
});

describe('Trade', () => {
  it('swaps your most-advanced pawn with the opponent\u2019s least-advanced pawn', () => {
    // White pawn on e4, black pawn on e7 (default start positions have d/e2 and d/e7 etc.)
    const state = makeState('rnbqkbnr/ppp1pppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1');
    const { newState } = CARD_EFFECTS.Trade(state, 'w', {});
    // The most advanced white pawn was e4 (row 4). Black's least advanced should
    // be one of rank-7 pawns. After swap, a black pawn sits at e4, a white pawn
    // sits where that black pawn was.
    expect(newState.chess.board[sq('e4')]).toBe('bP');
    // exactly one rank-7 black pawn should now be white
    let whitePawnsOnRank7 = 0;
    for (let f = 0; f < 8; f++) {
      if (newState.chess.board[sq(String.fromCharCode(97 + f) + '7')] === 'wP') whitePawnsOnRank7++;
    }
    expect(whitePawnsOnRank7).toBe(1);
  });

  it('refuses if either side has no pawns', () => {
    const state = makeState('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    const { newState, logEntry } = CARD_EFFECTS.Trade(state, 'w', {});
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/not enough pawns/i);
  });
});

describe('Fog', () => {
  it('flips fogActive on', () => {
    const state = makeState();
    const { newState } = CARD_EFFECTS.Fog(state, 'w', {});
    expect(newState.superState.fogActive).toBe(true);
  });
});

describe('Time Warp', () => {
  it('does nothing if there is no history to rewind', () => {
    const state = makeState();
    const { newState, logEntry } = CARD_EFFECTS['Time Warp'](state, 'w', {});
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/history/i);
  });

  // Card text: "Restore the board to the state before YOUR last chess move
  // and your opponent's response." That means we land at the start of MY
  // previous turn (chess.turn === me), where I get a do-over.
  it('rewinds to the start of the player\u2019s previous turn', () => {
    const state = makeState();

    // Snapshot 1: start of my (white\u2019s) previous turn — white to move,
    // initial position.
    const snap1Board = [...state.chess.board];
    state.snapshots.push({
      chess: { ...state.chess, board: snap1Board, turn: 'w' },
      superState: { ...state.superState },
      deckState: state.deck,
    } as never);

    // White plays e2-e4. Snapshot 2 is captured at the top of black\u2019s turn.
    state.chess.board[sq('e2')] = null;
    state.chess.board[sq('e4')] = 'wP';
    const snap2Board = [...state.chess.board];
    state.snapshots.push({
      chess: { ...state.chess, board: snap2Board, turn: 'b' },
      superState: { ...state.superState },
      deckState: state.deck,
    } as never);

    // Black plays c7-c5. Snapshot 3 is captured at the top of white\u2019s next
    // turn (the turn during which Time Warp is played).
    state.chess.board[sq('c7')] = null;
    state.chess.board[sq('c5')] = 'bP';
    state.chess.turn = 'w';
    state.snapshots.push({
      chess: { ...state.chess, board: [...state.chess.board], turn: 'w' },
      superState: { ...state.superState },
      deckState: state.deck,
    } as never);

    const { newState } = CARD_EFFECTS['Time Warp'](state, 'w', {});

    // Land at snapshot 1: initial position, white to move.
    expect(newState.chess.turn).toBe('w');
    expect(newState.chess.board[sq('e2')]).toBe('wP');
    expect(newState.chess.board[sq('e4')]).toBeNull();
    expect(newState.chess.board[sq('c7')]).toBe('bP');
    expect(newState.chess.board[sq('c5')]).toBeNull();
    expect(newState.superState.timeWarpUsed.get('w')).toBe(true);
  });

  it('refuses when there is not enough history (fewer than 3 snapshots)', () => {
    const state = makeState();
    state.snapshots.push({
      chess: { ...state.chess, board: [...state.chess.board], turn: 'w' },
      superState: { ...state.superState },
      deckState: state.deck,
    } as never);
    state.snapshots.push({
      chess: { ...state.chess, board: [...state.chess.board], turn: 'b' },
      superState: { ...state.superState },
      deckState: state.deck,
    } as never);
    const { newState, logEntry } = CARD_EFFECTS['Time Warp'](state, 'w', {});
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/not enough history/i);
  });

  it('refuses if the rewound snapshot doesn\u2019t actually belong to the caller', () => {
    // 3 snapshots but none of them has turn === 'w' at the 3-back position.
    const state = makeState();
    for (const turn of ['b', 'w', 'b'] as const) {
      state.snapshots.push({
        chess: { ...state.chess, board: [...state.chess.board], turn },
        superState: { ...state.superState },
        deckState: state.deck,
      } as never);
    }
    const { newState, logEntry } = CARD_EFFECTS['Time Warp'](state, 'w', {});
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/misaligned/i);
  });

  it('restores the deck state (hands, draw pile) from the snapshot', () => {
    const state = makeState();
    // Snapshot 1: my-previous-turn, with a "future-different" deck state.
    const pastDeck: typeof state.deck = {
      drawPile: [],
      discardPile: [],
      hand: { white: [], black: [] },
    };
    state.snapshots.push({
      chess: { ...state.chess, board: [...state.chess.board], turn: 'w' },
      superState: { ...state.superState },
      deckState: pastDeck,
    } as never);
    state.snapshots.push({
      chess: { ...state.chess, board: [...state.chess.board], turn: 'b' },
      superState: { ...state.superState },
      deckState: state.deck,
    } as never);
    state.snapshots.push({
      chess: { ...state.chess, board: [...state.chess.board], turn: 'w' },
      superState: { ...state.superState },
      deckState: state.deck,
    } as never);

    const { newState } = CARD_EFFECTS['Time Warp'](state, 'w', {});
    expect(newState.deck).toBe(pastDeck);
  });

  it('refuses a second use by the same color', () => {
    const state = makeState();
    state.superState.timeWarpUsed.set('w', true);
    state.snapshots.push({} as never, {} as never, {} as never);
    const { newState, logEntry } = CARD_EFFECTS['Time Warp'](state, 'w', {});
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/already used/i);
  });
});

// ─── turn-consumption integration ──────────────────────────────────────────
//
// Pawn Storm's rules-text says "This is your entire move for the turn".
// Same for Mirror ("Replay your opponent's last chess move ... This is your
// entire move for the turn."). The consumesTurn flag on CardDefinition is
// the source of truth — these tests assert it's set correctly and behaves.

describe('consumesTurn flag', () => {
  it('is set on Pawn Storm', () => {
    const def = CARD_DEFINITIONS.find((c) => c.name === 'Pawn Storm')!;
    expect(def.consumesTurn).toBe(true);
  });

  it('is set on Mirror', () => {
    const def = CARD_DEFINITIONS.find((c) => c.name === 'Mirror')!;
    expect(def.consumesTurn).toBe(true);
  });

  it('is set on the pawn-only movement cards (Double Step, Pawn Retreat, Sidestep)', () => {
    // These three cards ARE the player's chess move \u2014 they reposition a
    // pawn and that's it. Marking them consumesTurn keeps the
    // play-then-move flow from awarding the player a free chess move
    // after using the card.
    for (const name of ['Double Step', 'Pawn Retreat', 'Sidestep']) {
      const def = CARD_DEFINITIONS.find((c) => c.name === name)!;
      expect(def.consumesTurn, `${name} should consume the turn`).toBe(true);
    }
  });

  it('is NOT set on cards that allow a normal move afterwards', () => {
    const dontConsume = ['Freeze', 'Shield', "Knight's Path", 'Coup', 'Teleport', 'Fortify'];
    for (const name of dontConsume) {
      const def = CARD_DEFINITIONS.find((c) => c.name === name)!;
      expect(def.consumesTurn, `${name} should not consume the turn`).toBeFalsy();
    }
  });
});

describe('integration: card draw attribution after Trade swap (regression for "you drew" confusion)', () => {
  it('a capture by the bot after Trade gives the draw to the bot, not the human', async () => {
    // Trade swaps a white pawn into black's territory and vice-versa. If the
    // bot then captures the swapped white pawn on its same turn (e.g.
    // Ra8xa7), the capture-reward draw must go to BLACK (the mover), and the
    // cardDraw history entry must record color='b' so the log line reads
    // "they drew" — never "you drew".
    const { SuperChessGame } = await import('../../src/game/superChess.ts');
    type CardAI = import('../../src/ai/types.ts').CardAI;
    type ChessAI = import('../../src/ai/types.ts').ChessAI;

    // Bot AI: black always plays Trade if available.
    const tradeAI: CardAI = {
      name: 'trader',
      async decide(_s, color, hand) {
        if (color !== 'b') return { shouldPlay: false };
        const card = hand.find((h) => h.definition.name === 'Trade');
        return card ? { shouldPlay: true, card, target: {} } : { shouldPlay: false };
      },
    };
    const passAI: CardAI = { name: 'pass', async decide() { return { shouldPlay: false }; } };
    // Both chess AIs play the first legal move.
    const firstLegalAI: ChessAI = {
      name: 'first-legal',
      async selectMove(state, color) {
        const { getSuperChessLegalMoves } = await import('../../src/game/rules.ts');
        return getSuperChessLegalMoves(state, color)[0];
      },
    };

    const game = new SuperChessGame({
      games: 1,
      maxMovesPerGame: 60,
      chessAI: { white: firstLegalAI, black: firstLegalAI },
      cardAI: { white: passAI, black: tradeAI },
      searchDepth: 1,
      speedMs: 0,
      seed: 42,
      cardConfig: [{ name: 'Trade', copies: 60 }],
    } as never);

    await game.runToCompletion();

    // Assert that the cardDraw entries' `color` field correctly identifies
    // the mover. Specifically: every capture-reward draw must be attributed
    // to the color whose move immediately preceded it.
    const state = game.getState();
    type CardDrawEv = { color: string; reason: string };
    type MoveEv = { color: string; capture: unknown; algebraic: string };

    let lastMoveColor: string | null = null;
    for (const e of state.history) {
      if (e.type === 'move') {
        lastMoveColor = (e.data as MoveEv).color;
      } else if (e.type === 'cardDraw') {
        const d = e.data as CardDrawEv;
        if (d.reason === 'capture') {
          expect(d.color, `capture-reward draw on turn ${e.turn} should match the color of the preceding move`).toBe(lastMoveColor);
        }
      }
    }
  }, 30000);
});

describe('integration: SuperChessGame fires Extra Move bonus', () => {
  it('white plays Extra Move, then makes TWO chess moves before turn passes', async () => {
    const { SuperChessGame } = await import('../../src/game/superChess.ts');
    type CardAI = import('../../src/ai/types.ts').CardAI;
    type ChessAI = import('../../src/ai/types.ts').ChessAI;

    // White always plays Extra Move if available; black never plays anything.
    const bonusAI: CardAI = {
      name: 'bonus',
      async decide(_s, _c, hand) {
        const card = hand.find((h) => h.definition.name === 'Extra Move');
        if (card) return { shouldPlay: true, card, target: {} };
        return { shouldPlay: false };
      },
    };
    const passAI: CardAI = { name: 'pass', async decide() { return { shouldPlay: false }; } };
    const firstLegalAI: ChessAI = {
      name: 'first-legal',
      async selectMove(state, color) {
        const { getSuperChessLegalMoves } = await import('../../src/game/rules.ts');
        return getSuperChessLegalMoves(state, color)[0];
      },
    };

    const game = new SuperChessGame({
      games: 1,
      maxMovesPerGame: 4,
      chessAI: { white: firstLegalAI, black: firstLegalAI },
      cardAI: { white: bonusAI, black: passAI },
      searchDepth: 1,
      speedMs: 0,
      seed: 7,
      // Flood the deck with Extra Move so white draws it (after capture etc).
      // But white needs a CAPTURE to draw a card — easier: stuff white's
      // opening hand via cardConfig that puts lots of Extra Move cards into
      // the deck, plus a Trade or two so white has SOMETHING in hand turn 1.
      // Simpler approach: give white the card directly by mutating state
      // before driving the iterator.
      cardConfig: [{ name: 'Extra Move', copies: 60 }],
    });

    // Hand-deal Extra Move to white BEFORE the first turn.
    const s = game.getState();
    s.deck.hand.white.push({
      id: 'em-test', definition: CARD_DEFINITIONS.find((d) => d.name === 'Extra Move')!,
    });
    // Also sync the internal Deck instance.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (game as any).deck.hands.white.push(s.deck.hand.white[0]);

    const iter = game.playGame();
    await iter.next(); // white's turn

    const state = game.getState();
    // After white's full turn (card + 2 chess moves), it's black's turn.
    expect(state.chess.turn).toBe('b');
    // White should have made exactly TWO chess-move history events this turn.
    const whiteMoves = state.history.filter(
      (e) => e.type === 'move' && (e as any).data.color === 'w',
    );
    expect(whiteMoves.length).toBe(2);
    // Plus one cardPlay (Extra Move).
    const cardPlays = state.history.filter((e) => e.type === 'cardPlay');
    expect(cardPlays.length).toBe(1);
    expect((cardPlays[0] as any).data.cardName).toBe('Extra Move');
    // The bonus move must be a non-capture (per card rules).
    expect((whiteMoves[1].data as { capture: unknown }).capture).toBeNull();
    // extraMoveRemaining must have been cleared.
    expect(state.superState.extraMoveRemaining).toBeNull();
  });
});

describe('integration: SuperChessGame respects consumesTurn (the user-reported bug)', () => {
  it('Pawn Storm is the entire turn — only one ply per turn for that color', async () => {
    const { SuperChessGame } = await import('../../src/game/superChess.ts');
    type CardAI = import('../../src/ai/types.ts').CardAI;
    type ChessAI = import('../../src/ai/types.ts').ChessAI;

    // Force white's card AI to always play Pawn Storm if it's in hand.
    const stormyAI: CardAI = {
      name: 'stormy',
      async decide(_s, color, hand) {
        const card = hand.find((h) => h.definition.name === 'Pawn Storm');
        if (card) return { shouldPlay: true, card, target: {} };
        return { shouldPlay: false };
      },
    };
    const passAI: CardAI = { name: 'pass', async decide() { return { shouldPlay: false }; } };
    const firstLegalAI: ChessAI = {
      name: 'first-legal',
      async selectMove(state, color) {
        const { getSuperChessLegalMoves } = await import('../../src/game/rules.ts');
        return getSuperChessLegalMoves(state, color)[0];
      },
    };

    // Stack the deck so Pawn Storm is in white's opening hand.
    // Easier: use cardConfig override to make Pawn Storm super-common.
    const game = new SuperChessGame({
      games: 1,
      maxMovesPerGame: 2,
      chessAI: { white: firstLegalAI, black: firstLegalAI },
      cardAI: { white: stormyAI, black: passAI },
      searchDepth: 1,
      speedMs: 0,
      seed: 1,
      cardConfig: [{ name: 'Pawn Storm', copies: 60 }], // flood the deck
    });

    // Drive one yield (= one turn for white).
    const iter = game.playGame();
    await iter.next(); // white's turn

    const s = game.getState();
    // Turn should have flipped to black.
    expect(s.chess.turn).toBe('b');
    // White hasn't moved anything besides pawns: still 8 pawns, but all on rank 3.
    const whitePawnRanks = new Set<number>();
    for (let i = 0; i < 64; i++) {
      if (s.chess.board[i] === 'wP') whitePawnRanks.add(i >> 3);
    }
    // Either every pawn is on row 5 (rank 3) — if Pawn Storm played — or row 6
    // (rank 2) if for some reason it didn't. Critically: NO second chess move
    // should have moved anything off the back rank.
    expect(s.chess.board[60]).toBe('wK'); // king stays on e1
    expect(s.chess.board[58]).toBe('wB'); // c1 bishop didn't move
    // The fullMoveNumber should still be 1 (white plays, full-move increments on black).
    expect(s.chess.fullMoveNumber).toBe(1);
    void whitePawnRanks;
  });
});

describe('integration: consumeTurnBookkeeping', () => {
  it('toggles the turn, bumps fullMoveNumber on black play, ticks super state', async () => {
    const { consumeTurnBookkeeping: consume } = await import('../../src/game/rules.ts');

    // White plays a turn-consuming card.
    const sWhite = makeState();
    expect(sWhite.chess.turn).toBe('w');
    const after1 = consume(sWhite, 'w', { pawnMovedOrCaptured: true });
    expect(after1.chess.turn).toBe('b');
    expect(after1.chess.fullMoveNumber).toBe(1); // full-move increments on black, not white

    // Black plays a turn-consuming card → fullMoveNumber bumps.
    const sBlack = makeState();
    sBlack.chess.turn = 'b';
    const after2 = consume(sBlack, 'b', { pawnMovedOrCaptured: false });
    expect(after2.chess.turn).toBe('w');
    expect(after2.chess.fullMoveNumber).toBe(2);
    expect(after2.chess.halfMoveClock).toBe(1); // bumped since no pawn/capture
  });
});

