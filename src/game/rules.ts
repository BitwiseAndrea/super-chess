// src/game/rules.ts
// Super Chess rule enforcement layered on top of the chess engine.
import type { Move, Square, PieceColor, PieceType } from '../engine/types.ts';
import type { SuperChessState, SuperState } from './types.ts';
import {
  generateLegal,
  isSquareAttackedBy,
  isInCheck,
  applyMoveInPlace,
  undoMove,
  findKing,
  pieceType,
  squareToRC,
  rcToSquare,
  slidingMoves,
  knightMoves,
  pieceColor,
} from '../engine/index.ts';

// Returns null if legal, error string if illegal
export function validateSuperChessMove(
  move: Move,
  state: SuperChessState,
  color: PieceColor,
): string | null {
  const { chess, superState } = state;

  // Piece frozen?
  if (superState.frozenSquares.has(move.from)) return 'Piece is frozen';

  // Foul ground?
  if (superState.foulSquares.get(move.to) === color) return 'Target square is fouled';

  // Disrupt constraint?
  const mustMove = superState.mustMoveType.get(color);
  if (mustMove) {
    const p = chess.board[move.from];
    if (!p || pieceType(p) !== mustMove) return `Must move a ${mustMove}`;
  }

  // Shield: cannot capture shielded piece
  if (move.capture && superState.shieldedSquares.has(move.to)) {
    const shieldOwner = superState.shieldedSquares.get(move.to)!;
    if (shieldOwner !== color) return 'Target piece is shielded';
  }

  return null;
}

// Generate legal moves respecting Super Chess constraints.
//
// `color` MUST equal `state.chess.turn` — the engine generates moves for
// whichever side is on the move, and silently filtering by color after the
// fact masks real lifecycle bugs (e.g. the Extra Move bonus calling this
// with `color='w'` while turn was 'b', getting black's moves back, and
// nobody noticing). Assert loudly so callers fix their state first.
export function getSuperChessLegalMoves(state: SuperChessState, color: PieceColor): Move[] {
  if (state.chess.turn !== color) {
    throw new Error(
      `getSuperChessLegalMoves: chess.turn is ${state.chess.turn} but caller asked for ${color}. ` +
      'Adjust state.chess.turn before calling (or, if mid-bonus-move, after un-flipping the turn).',
    );
  }
  const { chess, superState } = state;
  const frozen = new Set<Square>(superState.frozenSquares.keys());

  let baseMoves = generateLegal(chess, frozen);

  // Apply Disrupt: filter to only moves of required type
  const mustMove = superState.mustMoveType.get(color);
  if (mustMove) {
    const filtered = baseMoves.filter((m) => {
      const p = chess.board[m.from];
      return p && pieceType(p) === mustMove;
    });
    if (filtered.length > 0) baseMoves = filtered;
    // If no legal moves with that type, constraint is ignored
  }

  // Apply Foul Ground: remove moves to fouled squares
  baseMoves = baseMoves.filter((m) => superState.foulSquares.get(m.to) !== color);

  // Shield: capturing a shielded enemy piece is not legal. Previously the
  // shield check lived only in `validateSuperChessMove`, which isn't on
  // any commit path \u2014 so the bot would happily pick "take the shielded
  // bishop" and the move would go through unfiltered. Filtering at the
  // legal-moves source ensures both AI search and human drag-and-drop
  // see the same rule. (A piece can never capture its OWN-color shielded
  // piece because friendly captures aren't legal in standard chess
  // anyway, but the explicit owner check keeps the intent obvious.)
  baseMoves = baseMoves.filter((m) => {
    if (m.capture === null) return true;
    const shieldOwner = superState.shieldedSquares.get(m.to);
    if (shieldOwner === undefined) return true;
    return shieldOwner === color;
  });

  // Apply Knight's Path: add knight moves from flagged piece
  if (superState.knightsPathSquare !== null) {
    const kpSq = superState.knightsPathSquare;
    const p = chess.board[kpSq];
    if (p && pieceColor(p) === color) {
      // Temporarily treat piece as knight
      const knightState = { ...chess, board: [...chess.board] };
      knightState.board[kpSq] = color + 'N';
      const knightLegal = generateLegal(knightState, frozen).filter((m) => m.from === kpSq);
      // Remove normal moves from that piece, add knight moves
      baseMoves = baseMoves.filter((m) => m.from !== kpSq);
      baseMoves.push(...knightLegal);
    }
  }

  // Apply Fortify: pawn can move like a rook
  if (superState.fortifiedPawnSquare !== null) {
    const fpSq = superState.fortifiedPawnSquare;
    const p = chess.board[fpSq];
    if (p && pieceColor(p) === color && pieceType(p) === 'P') {
      const rookState = { ...chess, board: [...chess.board] };
      rookState.board[fpSq] = color + 'R';
      const rookLegal = generateLegal(rookState, frozen).filter((m) => m.from === fpSq);
      baseMoves = baseMoves.filter((m) => m.from !== fpSq);
      baseMoves.push(...rookLegal);
    }
  }

  // Apply Ghost Step: piece ignores blocking pieces
  if (superState.ghostStepSquare !== null) {
    const gsSq = superState.ghostStepSquare;
    const p = chess.board[gsSq];
    if (p && pieceColor(p) === color) {
      const type = pieceType(p);
      // Generate all squares the piece type could reach ignoring blockers
      const ghostMoves = generateGhostMoves(chess.board, gsSq, type, color, frozen);
      // Filter: no landing on friendly, no leaving king in check
      const validGhost = ghostMoves.filter((m) => {
        const target = chess.board[m.to];
        if (target && pieceColor(target) === color) return false;
        // Check legality
        const saved = applyMoveInPlace(chess, m);
        const kingSq = findKing(chess.board, color);
        const inCheck = isSquareAttackedBy(chess.board, kingSq, color === 'w' ? 'b' : 'w');
        undoMove(chess, m, saved);
        return !inCheck;
      });
      baseMoves = baseMoves.filter((m) => m.from !== gsSq);
      baseMoves.push(...validGhost);
    }
  }

  return baseMoves;
}

function generateGhostMoves(
  board: (string | null)[],
  sq: Square,
  type: PieceType,
  color: PieceColor,
  frozen: Set<Square>,
): Move[] {
  // Create a board with only own pieces (no blocking opponents)
  const ghostBoard = board.map((p, i) => {
    if (i === sq) return p;
    if (p && pieceColor(p) !== color) return null; // remove opponents for pathing
    return p;
  });
  const ghostState = {
    board: ghostBoard,
    turn: color,
    enPassantSquare: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    castlingRights: { wKingside: false, wQueenside: false, bKingside: false, bQueenside: false },
  };
  // Now re-add opponents to destination (can still capture)
  const diags: [number, number][] = [[-1,-1],[-1,1],[1,-1],[1,1]];
  const ortho: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1]];
  let moves: Move[] = [];
  switch (type) {
    case 'B': moves = slidingMoves(ghostState, sq, diags); break;
    case 'R': moves = slidingMoves(ghostState, sq, ortho); break;
    case 'Q': moves = slidingMoves(ghostState, sq, [...diags, ...ortho]); break;
    case 'N': moves = knightMoves(ghostState, sq); break;
    default: moves = generateLegal(ghostState, frozen).filter(m => m.from === sq);
  }
  // Now restore capture info from the real board
  return moves.map((m) => ({
    ...m,
    capture: board[m.to] && pieceColor(board[m.to]!) !== color ? board[m.to] : null,
  }));
}

// Tick / clean Super Chess state after a turn.
//
// IMPORTANT: this fires after EVERY ply (each color's chess move OR each
// turn-consuming card play). For effects intended to last "one OPPONENT
// turn", the timer must therefore start at 2 plies (1 for the setter's
// own tick + 1 for the opponent's tick after their move). Setting an
// effect with timer=1 means it expires before the opponent ever sees it.
// See the SuperState type comment for the convention.
export function tickSuperState(ss: SuperState): SuperState {
  const next: SuperState = {
    frozenSquares: new Map(),
    shieldedSquares: new Map(ss.shieldedSquares),
    shieldTurns: new Map(),
    foulSquares: new Map(),
    foulTurns: new Map(),
    mustMoveType: new Map(),
    mustMoveTurns: new Map(),
    capturedByColor: ss.capturedByColor,
    lastMove: ss.lastMove,
    turnsSinceCapture: ss.turnsSinceCapture,
    knightsPathSquare: null,        // expires each turn
    ghostStepSquare: null,
    fortifiedPawnSquare: null,
    // PRESERVED. Extra Move card sets this in the card phase; it MUST survive
    // the post-chess-move tick so the bonus-move handler downstream can fire.
    // The handler clears it explicitly once consumed.
    extraMoveRemaining: ss.extraMoveRemaining,
    fogActive: false,               // expires after opponent's turn
    timeWarpUsed: ss.timeWarpUsed,
  };

  // Tick freeze counters
  for (const [sq, turns] of ss.frozenSquares) {
    if (turns - 1 > 0) next.frozenSquares.set(sq, turns - 1);
  }

  // Tick shield turns
  for (const [sq, turns] of ss.shieldTurns) {
    if (turns - 1 > 0) {
      next.shieldTurns.set(sq, turns - 1);
    } else {
      next.shieldedSquares.delete(sq);
    }
  }

  // Tick foul squares (forbidden-entry markers from Foul Ground). Effect
  // and timer are kept in sync — clear from BOTH maps when the timer
  // expires, and only keep entries whose timer is still > 0. Previously
  // this just wiped foulSquares unconditionally, which meant the foul
  // expired before the opponent ever saw it.
  for (const [sq, turns] of ss.foulTurns) {
    if (turns - 1 > 0) {
      next.foulTurns.set(sq, turns - 1);
      const color = ss.foulSquares.get(sq);
      if (color !== undefined) next.foulSquares.set(sq, color);
    }
    // else: drop from both maps
  }

  // Tick the "must move this piece type" constraint set by Disrupt. Same
  // bug as foul squares had — unconditional wipe meant the constraint
  // never reached the opponent.
  for (const [color, turns] of ss.mustMoveTurns) {
    if (turns - 1 > 0) {
      next.mustMoveTurns.set(color, turns - 1);
      const type = ss.mustMoveType.get(color);
      if (type !== undefined) next.mustMoveType.set(color, type);
    }
  }

  return next;
}

/**
 * Apply end-of-turn bookkeeping when a card consumes the entire turn (no
 * chess-move phase): toggle chess.turn, increment fullMoveNumber as needed,
 * tick freeze/shield/etc., bump turnsSinceCapture, and clear en-passant.
 *
 * Returns a new state — caller must use the return value.
 */
export function consumeTurnBookkeeping(
  state: SuperChessState,
  playedBy: PieceColor,
  options: { pawnMovedOrCaptured: boolean },
): SuperChessState {
  const nextTurn: PieceColor = playedBy === 'w' ? 'b' : 'w';
  const chess = {
    ...state.chess,
    turn: nextTurn,
    enPassantSquare: null,
    halfMoveClock: options.pawnMovedOrCaptured ? 0 : state.chess.halfMoveClock + 1,
    fullMoveNumber: playedBy === 'b' ? state.chess.fullMoveNumber + 1 : state.chess.fullMoveNumber,
  };
  let superState: SuperState = {
    ...state.superState,
    turnsSinceCapture: state.superState.turnsSinceCapture + 1,
  };
  superState = tickSuperState(superState);
  return { ...state, chess, superState };
}

/**
 * Transfer a piece's shield from its source square to its destination
 * when it moves. The shield follows the piece \u2014 a player who shields
 * their bishop and then moves it should keep the shield, otherwise
 * Shield is broken-feeling (reported as a bug in playtesting). For
 * castling, also transfer the rook's shield from its corner to its
 * post-castle square.
 */
export function transferMovedPieceShield(ss: SuperState, move: Move): SuperState {
  const hasFromShield = ss.shieldedSquares.has(move.from);
  const rookFrom = move.isCastle ? move.castleRookFrom : undefined;
  const rookTo = move.isCastle ? move.castleRookTo : undefined;
  const hasRookShield = rookFrom !== undefined && ss.shieldedSquares.has(rookFrom);
  if (!hasFromShield && !hasRookShield) return ss;

  const next = {
    ...ss,
    shieldedSquares: new Map(ss.shieldedSquares),
    shieldTurns: new Map(ss.shieldTurns),
  };

  if (hasFromShield) {
    const color = next.shieldedSquares.get(move.from)!;
    const turns = next.shieldTurns.get(move.from) ?? 0;
    next.shieldedSquares.delete(move.from);
    next.shieldTurns.delete(move.from);
    next.shieldedSquares.set(move.to, color);
    if (turns > 0) next.shieldTurns.set(move.to, turns);
  }

  if (hasRookShield && rookFrom !== undefined && rookTo !== undefined) {
    const color = next.shieldedSquares.get(rookFrom)!;
    const turns = next.shieldTurns.get(rookFrom) ?? 0;
    next.shieldedSquares.delete(rookFrom);
    next.shieldTurns.delete(rookFrom);
    next.shieldedSquares.set(rookTo, color);
    if (turns > 0) next.shieldTurns.set(rookTo, turns);
  }

  return next;
}

/**
 * @deprecated Use transferMovedPieceShield. Kept for legacy callers
 * that haven't been migrated; behaves identically to the original
 * "shield evaporates on movement" semantics.
 */
export function clearMovedPieceShield(ss: SuperState, from: Square): SuperState {
  if (!ss.shieldedSquares.has(from)) return ss;
  const next = { ...ss, shieldedSquares: new Map(ss.shieldedSquares), shieldTurns: new Map(ss.shieldTurns) };
  next.shieldedSquares.delete(from);
  next.shieldTurns.delete(from);
  return next;
}

export function satisfiesDisrupt(
  move: Move,
  board: (string | null)[],
  mustMoveType: PieceType | null,
): boolean {
  if (!mustMoveType) return true;
  const p = board[move.from];
  return !!p && pieceType(p) === mustMoveType;
}

// Check draw/win conditions
export function checkGameOver(
  state: SuperChessState,
  maxMoves: number,
): { winner: PieceColor | null; reason: string } | null {
  const { chess, superState, history } = state;

  // 50-move rule
  if (chess.halfMoveClock >= 100) return { winner: null, reason: '50-move' };

  // Move limit
  const moveCount = history.filter((e) => e.type === 'move').length;
  if (moveCount >= maxMoves) return { winner: null, reason: 'move-limit' };

  // Guard: if a king is missing (Super Chess card-effect edge case), award win to the other side
  const whiteKing = chess.board.includes('wK');
  const blackKing = chess.board.includes('bK');
  if (!whiteKing) return { winner: 'b', reason: 'checkmate' };
  if (!blackKing) return { winner: 'w', reason: 'checkmate' };

  const legalMoves = getSuperChessLegalMoves(state, chess.turn);

  if (legalMoves.length === 0) {
    if (isInCheck(chess)) {
      return { winner: chess.turn === 'w' ? 'b' : 'w', reason: 'checkmate' };
    }
    return { winner: null, reason: 'stalemate' };
  }

  return null;
}
