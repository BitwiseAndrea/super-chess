// src/cards/effects.ts
// One exported function per card. All effects take a SuperChessState and return a new state + log.
import type { PieceColor, Square, PieceStr, PieceType } from '../engine/types.ts';
import type { SuperChessState, CardTarget } from '../game/types.ts';
import { squareToRC, rcToSquare, pieceColor, pieceType, makePiece, isSquareAttackedBy, generateLegal, findKing, applyMove } from '../engine/index.ts';

export interface CardEffectResult {
  newState: SuperChessState;
  logEntry: string;
  materialDelta: number; // positive = good for the player who played it
}

function cloneSuperState(state: SuperChessState): SuperChessState {
  const ss = state.superState;
  return {
    ...state,
    chess: { ...state.chess, board: [...state.chess.board], castlingRights: { ...state.chess.castlingRights } },
    superState: {
      frozenSquares: new Map(ss.frozenSquares),
      shieldedSquares: new Map(ss.shieldedSquares),
      shieldTurns: new Map(ss.shieldTurns),
      foulSquares: new Map(ss.foulSquares),
      mustMoveType: new Map(ss.mustMoveType),
      capturedByColor: new Map([
        ['w', [...(ss.capturedByColor.get('w') ?? [])]],
        ['b', [...(ss.capturedByColor.get('b') ?? [])]],
      ]),
      lastMove: ss.lastMove,
      turnsSinceCapture: ss.turnsSinceCapture,
      knightsPathSquare: ss.knightsPathSquare,
      ghostStepSquare: ss.ghostStepSquare,
      fortifiedPawnSquare: ss.fortifiedPawnSquare,
      extraMoveRemaining: ss.extraMoveRemaining,
      fogActive: ss.fogActive,
      timeWarpUsed: new Map(ss.timeWarpUsed),
    },
    history: [...state.history],
    snapshots: [...state.snapshots],
  };
}

function materialDiff(state: SuperChessState, color: PieceColor): number {
  let w = 0, b = 0;
  for (const p of state.chess.board) {
    if (!p) continue;
    if (p[0] === 'w') w += pieceValueFor(p[1] as PieceType);
    else b += pieceValueFor(p[1] as PieceType);
  }
  return color === 'w' ? w - b : b - w;
}

function pieceValueFor(t: PieceType): number {
  const vals: Record<string, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
  return vals[t] ?? 0;
}

export type CardEffectFn = (
  state: SuperChessState,
  playedBy: PieceColor,
  target: CardTarget,
) => CardEffectResult;

export const CARD_EFFECTS: Record<string, CardEffectFn> = {

  Freeze(state, color, target) {
    const sq = target.oppPieceSquare;
    if (sq === undefined || state.chess.board[sq] === null) {
      return { newState: state, logEntry: 'Freeze: invalid target', materialDelta: 0 };
    }
    const p = state.chess.board[sq]!;
    if (pieceType(p) === 'K') {
      return { newState: state, logEntry: 'Freeze: cannot freeze king', materialDelta: 0 };
    }
    const next = cloneSuperState(state);
    next.superState.frozenSquares.set(sq, 1);
    return {
      newState: next,
      logEntry: `Freeze applied to ${p} at ${sqStr(sq)}`,
      materialDelta: 0,
    };
  },

  Shield(state, color, target) {
    const sq = target.ownPieceSquare;
    if (sq === undefined || state.chess.board[sq] === null) {
      return { newState: state, logEntry: 'Shield: invalid target', materialDelta: 0 };
    }
    const next = cloneSuperState(state);
    next.superState.shieldedSquares.set(sq, color);
    next.superState.shieldTurns.set(sq, 2);
    return {
      newState: next,
      logEntry: `Shield on ${state.chess.board[sq]} at ${sqStr(sq)}`,
      materialDelta: 0,
    };
  },

  "Knight's Path"(state, color, target) {
    const sq = target.ownPieceSquare;
    if (sq === undefined || state.chess.board[sq] === null) {
      return { newState: state, logEntry: "Knight's Path: invalid target", materialDelta: 0 };
    }
    const next = cloneSuperState(state);
    next.superState.knightsPathSquare = sq;
    return {
      newState: next,
      logEntry: `Knight's Path: ${state.chess.board[sq]} at ${sqStr(sq)} moves as knight`,
      materialDelta: 0,
    };
  },

  'Extra Move'(state, color, _target) {
    const next = cloneSuperState(state);
    next.superState.extraMoveRemaining = color;
    return { newState: next, logEntry: `Extra Move granted to ${color}`, materialDelta: 0 };
  },

  Coup(state, color, target) {
    const sq = target.oppPieceSquare;
    if (sq === undefined || state.chess.board[sq] === null) {
      return { newState: state, logEntry: 'Coup: invalid target', materialDelta: 0 };
    }
    const p = state.chess.board[sq]!;
    if (pieceType(p) === 'K') {
      return { newState: state, logEntry: 'Coup: cannot target king', materialDelta: 0 };
    }
    if (pieceColor(p) === color) {
      return { newState: state, logEntry: 'Coup: must target opponent piece', materialDelta: 0 };
    }
    // Check reachability: at least one own piece attacks sq
    if (!isSquareAttackedBy(state.chess.board, sq, color)) {
      return { newState: state, logEntry: 'Coup: piece not reachable', materialDelta: 0 };
    }
    const val = pieceValueFor(pieceType(p));
    const next = cloneSuperState(state);
    next.chess.board[sq] = null;
    next.superState.capturedByColor.get(color)!.push(p);
    return {
      newState: next,
      logEntry: `Coup: removed ${p} at ${sqStr(sq)}`,
      materialDelta: val,
    };
  },

  Resurrection(state, color, target) {
    const sq = target.square;
    if (sq === undefined) {
      return { newState: state, logEntry: 'Resurrection: no target square', materialDelta: 0 };
    }
    const opp: PieceColor = color === 'w' ? 'b' : 'w';
    // capturedByColor.get(opp) = pieces captured BY the opponent = our own lost pieces
    const captured = state.superState.capturedByColor.get(opp) ?? [];
    // Find most recently captured minor piece (N, B, R) that belongs to color
    const eligibleTypes: PieceType[] = ['R', 'B', 'N'];
    let pieceToPlace: PieceStr | null = null;
    let capturedIdx = -1;
    for (let i = captured.length - 1; i >= 0; i--) {
      if (pieceColor(captured[i]) === color && eligibleTypes.includes(pieceType(captured[i]) as PieceType)) {
        pieceToPlace = captured[i];
        capturedIdx = i;
        break;
      }
    }
    if (!pieceToPlace) {
      return { newState: state, logEntry: 'Resurrection: no eligible captured piece', materialDelta: 0 };
    }
    if (state.chess.board[sq] !== null) {
      return { newState: state, logEntry: 'Resurrection: target square not empty', materialDelta: 0 };
    }
    // Validate: square must be in own back 2 ranks
    const [row] = squareToRC(sq);
    const validRow = color === 'w' ? row >= 6 : row <= 1;
    if (!validRow) {
      return { newState: state, logEntry: 'Resurrection: must place in own back 2 ranks', materialDelta: 0 };
    }
    const val = pieceValueFor(pieceType(pieceToPlace));
    const next = cloneSuperState(state);
    next.chess.board[sq] = pieceToPlace;
    const newCaptured = [...captured];
    newCaptured.splice(capturedIdx, 1);
    // Remove from opp's captured list (those are pieces captured BY opp = our lost pieces)
    next.superState.capturedByColor.set(opp, newCaptured);
    return {
      newState: next,
      logEntry: `Resurrection: placed ${pieceToPlace} at ${sqStr(sq)}`,
      materialDelta: val,
    };
  },

  Teleport(state, color, target) {
    const from = target.ownPieceSquare;
    const to = target.square;
    if (from === undefined || to === undefined) {
      return { newState: state, logEntry: 'Teleport: invalid target', materialDelta: 0 };
    }
    const p = state.chess.board[from];
    if (!p || pieceColor(p) !== color) {
      return { newState: state, logEntry: 'Teleport: invalid source piece', materialDelta: 0 };
    }
    if (state.chess.board[to] !== null) {
      return { newState: state, logEntry: 'Teleport: destination not empty', materialDelta: 0 };
    }
    const next = cloneSuperState(state);
    next.chess.board[to] = p;
    next.chess.board[from] = null;
    // Move shield if present
    if (next.superState.shieldedSquares.has(from)) {
      const shieldColor = next.superState.shieldedSquares.get(from)!;
      const shieldTurns = next.superState.shieldTurns.get(from) ?? 0;
      next.superState.shieldedSquares.delete(from);
      next.superState.shieldTurns.delete(from);
      next.superState.shieldedSquares.set(to, shieldColor);
      next.superState.shieldTurns.set(to, shieldTurns);
    }
    return {
      newState: next,
      logEntry: `Teleport: ${p} from ${sqStr(from)} to ${sqStr(to)}`,
      materialDelta: 0,
    };
  },

  'Pawn Storm'(state, color, _target) {
    const next = cloneSuperState(state);
    const board = next.chess.board;
    const dir = color === 'w' ? -8 : 8;
    const promRow = color === 'w' ? 0 : 7;
    const pawnStr = makePiece(color, 'P');

    // ⚠️ Architecture note: we MUST snapshot all pawn source squares up-front
    // and treat them as a fixed set, because the destination of one pawn can
    // overlap with the source we're about to visit. Iterating `board` 0→63
    // while also writing the moved pawn ahead of the cursor caused every
    // black pawn (dir=+8) to be re-read at its new square and advanced again,
    // cascading the whole rank from 7 down to 3.
    //
    // The fix is to read positions once from a snapshot, then mutate `board`.
    const sourceSquares: number[] = [];
    for (let sq = 0; sq < 64; sq++) {
      if (board[sq] === pawnStr) sourceSquares.push(sq);
    }

    for (const sq of sourceSquares) {
      const target = sq + dir;
      if (target < 0 || target >= 64) continue;
      if (board[target] !== null) continue;
      // Reject pseudo-legal moves that leave own king in check.
      const testBoard = [...board];
      const [targetRow] = squareToRC(target);
      testBoard[sq] = null;
      testBoard[target] = targetRow === promRow ? makePiece(color, 'Q') : pawnStr;
      const kingSq = findKing(testBoard as typeof board, color);
      if (isSquareAttackedBy(testBoard as typeof board, kingSq, color === 'w' ? 'b' : 'w')) continue;
      board[sq] = null;
      board[target] = targetRow === promRow ? makePiece(color, 'Q') : pawnStr;
    }

    return { newState: next, logEntry: `Pawn Storm: all ${color} pawns advanced`, materialDelta: 0 };
  },

  'Promotion Rush'(state, color, target) {
    const sq = target.ownPieceSquare ?? target.square;
    if (sq === undefined) {
      return { newState: state, logEntry: 'Promotion Rush: no target', materialDelta: 0 };
    }
    const p = state.chess.board[sq];
    if (!p || pieceType(p) !== 'P' || pieceColor(p) !== color) {
      return { newState: state, logEntry: 'Promotion Rush: must target own pawn', materialDelta: 0 };
    }
    const destRow = color === 'w' ? 1 : 6;
    const [srcRow, srcCol] = squareToRC(sq);
    if (srcRow === destRow) {
      return { newState: state, logEntry: 'Promotion Rush: pawn already at promotion rank', materialDelta: 0 };
    }
    const dest = rcToSquare(destRow, srcCol);
    if (state.chess.board[dest] !== null) {
      return { newState: state, logEntry: 'Promotion Rush: destination blocked', materialDelta: 0 };
    }
    const next = cloneSuperState(state);
    next.chess.board[dest] = p;
    next.chess.board[sq] = null;
    return {
      newState: next,
      logEntry: `Promotion Rush: pawn from ${sqStr(sq)} to ${sqStr(dest)}`,
      materialDelta: 0,
    };
  },

  'Ghost Step'(state, color, target) {
    const sq = target.ownPieceSquare;
    if (sq === undefined || state.chess.board[sq] === null) {
      return { newState: state, logEntry: 'Ghost Step: invalid target', materialDelta: 0 };
    }
    const next = cloneSuperState(state);
    next.superState.ghostStepSquare = sq;
    return {
      newState: next,
      logEntry: `Ghost Step: ${state.chess.board[sq]} at ${sqStr(sq)} phases through pieces`,
      materialDelta: 0,
    };
  },

  Swap(state, color, target) {
    const sq1 = target.ownPieceSquare;
    const sq2 = target.secondOwnPieceSquare ?? target.square;
    if (sq1 === undefined || sq2 === undefined || sq1 === sq2) {
      return { newState: state, logEntry: 'Swap: need two distinct own pieces', materialDelta: 0 };
    }
    const p1 = state.chess.board[sq1], p2 = state.chess.board[sq2];
    if (!p1 || !p2 || pieceColor(p1) !== color || pieceColor(p2) !== color) {
      return { newState: state, logEntry: 'Swap: must target two own pieces', materialDelta: 0 };
    }
    const next = cloneSuperState(state);
    next.chess.board[sq1] = p2;
    next.chess.board[sq2] = p1;
    // Move shields
    const moveShield = (from: Square, to: Square) => {
      if (next.superState.shieldedSquares.has(from)) {
        next.superState.shieldedSquares.set(to, next.superState.shieldedSquares.get(from)!);
        next.superState.shieldedSquares.delete(from);
        if (next.superState.shieldTurns.has(from)) {
          next.superState.shieldTurns.set(to, next.superState.shieldTurns.get(from)!);
          next.superState.shieldTurns.delete(from);
        }
      }
    };
    const tmp1Shield = next.superState.shieldedSquares.has(sq1);
    moveShield(sq1, -1 as Square); // temp
    moveShield(sq2, sq1);
    if (tmp1Shield) {
      next.superState.shieldedSquares.set(sq2, color);
    }
    return {
      newState: next,
      logEntry: `Swap: ${p1} ↔ ${p2} (${sqStr(sq1)} ↔ ${sqStr(sq2)})`,
      materialDelta: 0,
    };
  },

  Fortify(state, color, target) {
    const sq = target.ownPieceSquare ?? target.square;
    if (sq === undefined) {
      return { newState: state, logEntry: 'Fortify: no target', materialDelta: 0 };
    }
    const p = state.chess.board[sq];
    if (!p || pieceType(p) !== 'P' || pieceColor(p) !== color) {
      return { newState: state, logEntry: 'Fortify: must target own pawn', materialDelta: 0 };
    }
    const next = cloneSuperState(state);
    next.superState.fortifiedPawnSquare = sq;
    return {
      newState: next,
      logEntry: `Fortify: pawn at ${sqStr(sq)} moves like a rook`,
      materialDelta: 0,
    };
  },

  'Double Step'(state, color, target) {
    const sq = target.ownPieceSquare ?? target.square;
    if (sq === undefined) {
      return { newState: state, logEntry: 'Double Step: no target', materialDelta: 0 };
    }
    const p = state.chess.board[sq];
    if (!p || pieceType(p) !== 'P' || pieceColor(p) !== color) {
      return { newState: state, logEntry: 'Double Step: must target own pawn', materialDelta: 0 };
    }
    const dir = color === 'w' ? -8 : 8;
    const mid = sq + dir;
    const dest = sq + dir * 2;
    if (dest < 0 || dest >= 64) {
      return { newState: state, logEntry: 'Double Step: out of bounds', materialDelta: 0 };
    }
    if (state.chess.board[mid] !== null || state.chess.board[dest] !== null) {
      return { newState: state, logEntry: 'Double Step: path blocked', materialDelta: 0 };
    }
    const next = cloneSuperState(state);
    // Auto-promote if landing on promotion rank (card effect can skip ranks)
    const destRow = dest >> 3;
    const promRow = color === 'w' ? 0 : 7;
    next.chess.board[dest] = destRow === promRow ? makePiece(color, 'Q') : p;
    next.chess.board[sq] = null;
    if (destRow !== promRow) next.chess.enPassantSquare = mid; // e.p. target only for non-promotion
    return {
      newState: next,
      logEntry: `Double Step: pawn from ${sqStr(sq)} to ${sqStr(dest)}`,
      materialDelta: 0,
    };
  },

  Retreat(state, color, target) {
    const sq = target.ownPieceSquare;
    const dest = target.square;
    if (sq === undefined || dest === undefined) {
      return { newState: state, logEntry: 'Retreat: need source and destination', materialDelta: 0 };
    }
    const p = state.chess.board[sq];
    if (!p || pieceColor(p) !== color) {
      return { newState: state, logEntry: 'Retreat: invalid piece', materialDelta: 0 };
    }
    if (state.chess.board[dest] !== null) {
      return { newState: state, logEntry: 'Retreat: destination occupied', materialDelta: 0 };
    }
    if (!isValidRetreat(p, sq, dest, color, state.chess.board)) {
      return { newState: state, logEntry: 'Retreat: must move backward up to 2 squares along normal axes', materialDelta: 0 };
    }
    // Cannot leave own king in check.
    const testBoard = [...state.chess.board];
    testBoard[dest] = p;
    testBoard[sq] = null;
    const kingSq = findKing(testBoard as typeof state.chess.board, color);
    if (isSquareAttackedBy(testBoard as typeof state.chess.board, kingSq, color === 'w' ? 'b' : 'w')) {
      return { newState: state, logEntry: 'Retreat: would leave king in check', materialDelta: 0 };
    }
    const next = cloneSuperState(state);
    next.chess.board[dest] = p;
    next.chess.board[sq] = null;
    return {
      newState: next,
      logEntry: `Retreat: ${p} from ${sqStr(sq)} to ${sqStr(dest)}`,
      materialDelta: 0,
    };
  },

  'Foul Ground'(state, color, target) {
    const sq = target.square;
    if (sq === undefined) {
      return { newState: state, logEntry: 'Foul Ground: no target square', materialDelta: 0 };
    }
    const opp: PieceColor = color === 'w' ? 'b' : 'w';
    const next = cloneSuperState(state);
    next.superState.foulSquares.set(sq, opp);
    return {
      newState: next,
      logEntry: `Foul Ground: opponent cannot move to ${sqStr(sq)}`,
      materialDelta: 0,
    };
  },

  Disrupt(state, color, target) {
    if (!target.pieceType) {
      return { newState: state, logEntry: 'Disrupt: no piece type specified', materialDelta: 0 };
    }
    const opp: PieceColor = color === 'w' ? 'b' : 'w';
    const next = cloneSuperState(state);
    next.superState.mustMoveType.set(opp, target.pieceType);
    return {
      newState: next,
      logEntry: `Disrupt: opponent must move a ${target.pieceType} next turn`,
      materialDelta: 0,
    };
  },

  Mirror(state, color, _target) {
    const lastMove = state.superState.lastMove;
    if (!lastMove) {
      return { newState: state, logEntry: 'Mirror: no last move to mirror', materialDelta: 0 };
    }
    // Mirror only applies when chess.turn matches the caller. If we got here
    // mid-turn for some reason, bail.
    if (state.chess.turn !== color) {
      return { newState: state, logEntry: 'Mirror: not your turn', materialDelta: 0 };
    }
    const opp: PieceColor = color === 'w' ? 'b' : 'w';
    const movedPieceType = pieceType(state.chess.board[lastMove.from] ?? (opp + lastMove.color[1]));
    const targetSq = lastMove.to;

    // Find own piece of same type that can reach targetSq
    const legalMoves = generateLegal(state.chess);
    const mirror = legalMoves.find(m => {
      const p = state.chess.board[m.from];
      return p && pieceColor(p) === color && pieceType(p) === movedPieceType && m.to === targetSq;
    }) ?? legalMoves.find(m => {
      const p = state.chess.board[m.from];
      return p && pieceColor(p) === color && pieceType(p) === movedPieceType;
    });

    if (!mirror) {
      return { newState: state, logEntry: 'Mirror: no mirroring possible, card wasted', materialDelta: 0 };
    }

    const capture = mirror.capture ? pieceValueFor(pieceType(mirror.capture)) : 0;
    const next = cloneSuperState(state);
    // Apply the move's board effects but un-toggle turn/full-move so the
    // runner's consumeTurnBookkeeping can handle them uniformly with other
    // turn-consuming cards.
    const afterMove = applyMove(state.chess, mirror);
    next.chess = {
      ...afterMove,
      turn: state.chess.turn,
      fullMoveNumber: state.chess.fullMoveNumber,
    };
    if (mirror.capture) {
      next.superState.capturedByColor.get(color)!.push(mirror.capture);
    }
    return {
      newState: next,
      logEntry: `Mirror: ${state.chess.board[mirror.from]} from ${sqStr(mirror.from)} to ${sqStr(mirror.to)}`,
      materialDelta: capture,
    };
  },

  Trade(state, color, _target) {
    const opp: PieceColor = color === 'w' ? 'b' : 'w';
    const board = state.chess.board;

    // Find own most-advanced pawn (closest to promotion)
    let myBest: Square | null = null;
    let myBestRow = color === 'w' ? 999 : -1;
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (!p || pieceColor(p) !== color || pieceType(p) !== 'P') continue;
      const [row] = squareToRC(sq);
      if (color === 'w' ? row < myBestRow : row > myBestRow) {
        myBestRow = row; myBest = sq;
      }
    }

    // Find opponent's least-advanced pawn
    let oppBest: Square | null = null;
    let oppBestRow = opp === 'w' ? -1 : 999;
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (!p || pieceColor(p) !== opp || pieceType(p) !== 'P') continue;
      const [row] = squareToRC(sq);
      if (opp === 'w' ? row > oppBestRow : row < oppBestRow) {
        oppBestRow = row; oppBest = sq;
      }
    }

    if (myBest === null || oppBest === null) {
      return { newState: state, logEntry: 'Trade: not enough pawns on both sides', materialDelta: 0 };
    }

    const next = cloneSuperState(state);
    const p1 = board[myBest]!, p2 = board[oppBest]!;
    next.chess.board[myBest] = p2;
    next.chess.board[oppBest] = p1;
    return {
      newState: next,
      logEntry: `Trade: ${p1} at ${sqStr(myBest)} ↔ ${p2} at ${sqStr(oppBest)}`,
      materialDelta: 0,
    };
  },

  Fog(state, _color, _target) {
    const next = cloneSuperState(state);
    next.superState.fogActive = true;
    return { newState: next, logEntry: 'Fog of War active — opponent must pre-declare move', materialDelta: 0 };
  },

  'Time Warp'(state, color, _target) {
    if (state.superState.timeWarpUsed.get(color)) {
      return { newState: state, logEntry: 'Time Warp: already used this game', materialDelta: 0 };
    }
    if (state.snapshots.length < 2) {
      return { newState: state, logEntry: 'Time Warp: not enough history', materialDelta: 0 };
    }
    // Pop last 2 snapshots, restore to 2 plies ago
    const snapshots = [...state.snapshots];
    snapshots.pop(); // remove current
    const prev = snapshots.pop()!; // state from 2 plies ago
    const next: SuperChessState = {
      chess: { ...prev.chess, board: [...prev.chess.board], castlingRights: { ...prev.chess.castlingRights } },
      deck: state.deck,
      superState: {
        ...prev.superState,
        frozenSquares: new Map(prev.superState.frozenSquares),
        shieldedSquares: new Map(prev.superState.shieldedSquares),
        shieldTurns: new Map(prev.superState.shieldTurns),
        foulSquares: new Map(prev.superState.foulSquares),
        mustMoveType: new Map(prev.superState.mustMoveType),
        capturedByColor: new Map([
          ['w', [...(prev.superState.capturedByColor.get('w') ?? [])]],
          ['b', [...(prev.superState.capturedByColor.get('b') ?? [])]],
        ]),
        timeWarpUsed: new Map(state.superState.timeWarpUsed),
      },
      history: state.history.slice(0, -2),
      result: null,
      snapshots,
    };
    next.superState.timeWarpUsed.set(color, true);
    return {
      newState: next,
      logEntry: `Time Warp: board restored 2 plies, ${color} must play different move`,
      materialDelta: 0,
    };
  },
};

function sqStr(sq: Square): string {
  return String.fromCharCode(97 + (sq & 7)) + String(8 - (sq >> 3));
}

/**
 * Retreat-card legality: backward (toward own home rank), up to 2 squares,
 * along the piece's normal movement axes, path clear for sliders.
 *
 * "Backward" means destination row is strictly closer to home rank than source.
 * - White's home rank is row 7 (rank 1) → backward = dRow > 0.
 * - Black's home rank is row 0 (rank 8) → backward = dRow < 0.
 *
 * Each piece type's axes are honored:
 * - Pawn: same file only (no diagonals).
 * - Knight: L-shape (1,2)/(2,1), no path check.
 * - Bishop: diagonal only.
 * - Rook: straight along the file only (sideways isn't "backward").
 * - Queen: file or diagonal backward.
 * - King: 1 square only, file or diagonal backward.
 */
export function isValidRetreat(
  piece: PieceStr,
  fromSq: Square,
  toSq: Square,
  color: PieceColor,
  board: SuperChessState['chess']['board'],
): boolean {
  const [srcR, srcC] = squareToRC(fromSq);
  const [destR, destC] = squareToRC(toSq);
  const dRow = destR - srcR;
  const dCol = destC - srcC;
  if (dRow === 0 && dCol === 0) return false;

  const backwardSign = color === 'w' ? 1 : -1; // row delta toward own home rank
  if (Math.sign(dRow) !== backwardSign) return false; // not strictly backward

  const absDR = Math.abs(dRow);
  const absDC = Math.abs(dCol);
  if (Math.max(absDR, absDC) > 2) return false;

  const type = pieceType(piece);

  if (type === 'N') {
    return (absDR === 1 && absDC === 2) || (absDR === 2 && absDC === 1);
  }

  if (type === 'P') {
    if (absDC !== 0) return false;
    if (absDR === 2) {
      const midSq = rcToSquare(srcR + backwardSign, srcC);
      if (board[midSq] !== null) return false;
    }
    return true;
  }

  const isStraight = absDR > 0 && absDC === 0;
  const isDiagonal = absDR === absDC && absDR > 0;
  if (type === 'R' && !isStraight) return false;
  if (type === 'B' && !isDiagonal) return false;
  if (type === 'Q' && !isStraight && !isDiagonal) return false;
  if (type === 'K') {
    if (Math.max(absDR, absDC) > 1) return false;
    if (!isStraight && !isDiagonal) return false;
  }

  // Path-clear check for 2-square slides.
  if (Math.max(absDR, absDC) === 2 && (type === 'R' || type === 'B' || type === 'Q')) {
    const stepR = Math.sign(dRow);
    const stepC = Math.sign(dCol);
    const midSq = rcToSquare(srcR + stepR, srcC + stepC);
    if (board[midSq] !== null) return false;
  }

  return true;
}
