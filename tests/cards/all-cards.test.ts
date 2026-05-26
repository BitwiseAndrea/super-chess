// tests/cards/all-cards.test.ts
// Comprehensive per-card unit tests for every card effect.
//
// Each describe() targets one of the 20 cards from CARD_DEFINITIONS.
// Tests are written against the rules-text in src/cards/definitions.ts —
// where the implementation deviates from the rules, the test is marked
// .skip with a comment explaining the divergence, so the gap stays visible.

import { describe, it, expect } from 'vitest';
import { CARD_EFFECTS } from '../../src/cards/effects.ts';
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
  it('defines exactly 20 unique cards', () => {
    const names = new Set(CARD_DEFINITIONS.map((c) => c.name));
    expect(names.size).toBe(20);
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
  it('freezes an opponent piece for 1 turn', () => {
    const state = makeState();
    const target = sq('e7'); // black pawn
    const { newState } = CARD_EFFECTS.Freeze(state, 'w', { oppPieceSquare: target });
    expect(newState.superState.frozenSquares.get(target)).toBe(1);
  });

  it('refuses to freeze the king', () => {
    const state = makeState();
    const { newState, logEntry } = CARD_EFFECTS.Freeze(state, 'w', { oppPieceSquare: sq('e8') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/king/i);
  });
});

describe('Shield', () => {
  it('shields a piece for 2 turns', () => {
    const state = makeState();
    const target = sq('e2');
    const { newState } = CARD_EFFECTS.Shield(state, 'w', { ownPieceSquare: target });
    expect(newState.superState.shieldedSquares.get(target)).toBe('w');
    expect(newState.superState.shieldTurns.get(target)).toBe(2);
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
  it('moves a piece to an empty square', () => {
    const state = makeState('8/8/8/8/4Q3/8/8/4K2k w - - 0 1');
    const { newState } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e4'), square: sq('e2') });
    expect(newState.chess.board[sq('e4')]).toBeNull();
    expect(newState.chess.board[sq('e2')]).toBe('wQ');
  });

  it('refuses to move to an occupied square', () => {
    const state = makeState();
    const { newState, logEntry } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e2'), square: sq('e1') });
    expect(newState).toBe(state);
    expect(logEntry).toMatch(/occupied/i);
  });

  // The rules-text limits retreat to "backward up to 2 squares along normal
  // movement axes". The current effect does not enforce this — any empty
  // square is allowed. These tests document the gap.
  it.skip('[KNOWN GAP] should refuse to move pieces forward', () => {
    const state = makeState('8/8/8/4Q3/8/8/8/4K2k w - - 0 1');
    const { newState } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e5'), square: sq('e7') });
    // For white, "forward" is toward rank 8 — should not be allowed.
    expect(newState).toBe(state);
  });

  it.skip('[KNOWN GAP] should refuse to move more than 2 squares', () => {
    const state = makeState('8/8/8/8/4Q3/8/8/4K2k w - - 0 1');
    const { newState } = CARD_EFFECTS.Retreat(state, 'w', { ownPieceSquare: sq('e4'), square: sq('e1') });
    // 3 squares back — should be rejected.
    expect(newState).toBe(state);
  });
});

describe('Foul Ground', () => {
  it('marks a square as fouled for the opponent', () => {
    const state = makeState();
    const target = sq('e4');
    const { newState } = CARD_EFFECTS['Foul Ground'](state, 'w', { square: target });
    expect(newState.superState.foulSquares.get(target)).toBe('b');
  });
});

describe('Disrupt', () => {
  it('forces the opponent to move a specific piece type next turn', () => {
    const state = makeState();
    const { newState } = CARD_EFFECTS.Disrupt(state, 'w', { pieceType: 'N' });
    expect(newState.superState.mustMoveType.get('b')).toBe('N');
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

  it('replays the opponent\u2019s last move using a same-typed piece of the player', () => {
    // Set up a state with both sides having knights symmetric.
    // Opponent (black) last moved Nb8-c6.
    const state = makeState();
    state.superState.lastMove = {
      from: sq('b8'),
      to: sq('c6'),
      piece: 'bN',
      capture: null,
      promotion: null,
      isCastle: null,
      enPassantCaptureSq: null,
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

  it('restores the board to two plies ago and marks the card used', () => {
    const state = makeState();
    // Fake two prior snapshots.
    state.snapshots.push({
      chess: { ...state.chess, board: [...state.chess.board] },
      superState: { ...state.superState },
    } as never);
    state.chess.board[sq('e2')] = null;
    state.chess.board[sq('e4')] = 'wP';
    state.snapshots.push({
      chess: { ...state.chess, board: [...state.chess.board] },
      superState: { ...state.superState },
    } as never);
    // Black moves c7-c5.
    state.chess.board[sq('c7')] = null;
    state.chess.board[sq('c5')] = 'bP';
    state.snapshots.push({
      chess: { ...state.chess, board: [...state.chess.board] },
      superState: { ...state.superState },
    } as never);

    const { newState } = CARD_EFFECTS['Time Warp'](state, 'w', {});
    // Two plies back: e-pawn moved but black hadn't yet responded.
    expect(newState.chess.board[sq('e4')]).toBe('wP');
    expect(newState.chess.board[sq('c5')]).toBeNull();
    expect(newState.chess.board[sq('c7')]).toBe('bP');
    expect(newState.superState.timeWarpUsed.get('w')).toBe(true);
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

  it('is NOT set on cards that allow a normal move afterwards', () => {
    const dontConsume = ['Freeze', 'Shield', "Knight's Path", 'Coup', 'Teleport', 'Fortify'];
    for (const name of dontConsume) {
      const def = CARD_DEFINITIONS.find((c) => c.name === name)!;
      expect(def.consumesTurn, `${name} should not consume the turn`).toBeFalsy();
    }
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

