// src/engine/movegen.ts
import type { Square, Move, ChessState, PieceStr, PieceType, SavedState } from './types.ts';
import { squareToRC, rcToSquare, pieceColor, pieceType, makePiece, findKing, cloneCastlingRights } from './board.ts';

// ─── helpers ───────────────────────────────────────────────────────────────

function makeMove(
  from: Square,
  to: Square,
  capture: PieceStr | null,
  promotion: PieceStr | null,
): Move {
  return { from, to, capture, promotion, enPassantCaptureSq: null, newEnPassantSq: null, isCastle: false };
}

// ─── per-piece pseudo-legal generators ─────────────────────────────────────

export function pawnMoves(state: ChessState, sq: Square): Move[] {
  const moves: Move[] = [];
  const { board, enPassantSquare } = state;
  const piece = board[sq]!;
  const color = pieceColor(piece);
  const [row, col] = squareToRC(sq);

  // Guard: if a card effect placed this pawn on the promotion rank without promoting it,
  // it has no valid moves — treat as if already promoted (no-op).
  if ((color === 'w' && row === 0) || (color === 'b' && row === 7)) return moves;

  if (color === 'w') {
    const fwd = sq - 8;
    // One square forward
    if (row > 0 && board[fwd] === null) {
      if (row - 1 === 0) {
        for (const pt of ['wQ', 'wR', 'wB', 'wN'] as PieceStr[]) {
          moves.push(makeMove(sq, fwd, null, pt));
        }
      } else {
        moves.push(makeMove(sq, fwd, null, null));
        // Double push from rank 2 (row 6)
        if (row === 6 && board[sq - 16] === null) {
          const m = makeMove(sq, sq - 16, null, null);
          m.newEnPassantSq = fwd;
          moves.push(m);
        }
      }
    }
    // Captures
    for (const dc of [-1, 1]) {
      const nc = col + dc;
      if (nc < 0 || nc > 7) continue;
      const capSq = rcToSquare(row - 1, nc);
      const target = board[capSq];
      if (target != null && pieceColor(target) === 'b') {
        if (row - 1 === 0) {
          for (const pt of ['wQ', 'wR', 'wB', 'wN'] as PieceStr[]) {
            moves.push(makeMove(sq, capSq, target, pt));
          }
        } else {
          moves.push(makeMove(sq, capSq, target, null));
        }
      } else if (enPassantSquare === capSq) {
        const m = makeMove(sq, capSq, 'bP', null);
        m.enPassantCaptureSq = rcToSquare(row, nc);
        moves.push(m);
      }
    }
  } else {
    // Black
    const fwd = sq + 8;
    if (row < 7 && board[fwd] === null) {
      if (row + 1 === 7) {
        for (const pt of ['bQ', 'bR', 'bB', 'bN'] as PieceStr[]) {
          moves.push(makeMove(sq, fwd, null, pt));
        }
      } else {
        moves.push(makeMove(sq, fwd, null, null));
        if (row === 1 && board[sq + 16] === null) {
          const m = makeMove(sq, sq + 16, null, null);
          m.newEnPassantSq = fwd;
          moves.push(m);
        }
      }
    }
    for (const dc of [-1, 1]) {
      const nc = col + dc;
      if (nc < 0 || nc > 7) continue;
      const capSq = rcToSquare(row + 1, nc);
      const target = board[capSq];
      if (target != null && pieceColor(target) === 'w') {
        if (row + 1 === 7) {
          for (const pt of ['bQ', 'bR', 'bB', 'bN'] as PieceStr[]) {
            moves.push(makeMove(sq, capSq, target, pt));
          }
        } else {
          moves.push(makeMove(sq, capSq, target, null));
        }
      } else if (enPassantSquare === capSq) {
        const m = makeMove(sq, capSq, 'wP', null);
        m.enPassantCaptureSq = rcToSquare(row, nc);
        moves.push(m);
      }
    }
  }
  return moves;
}

export function knightMoves(state: ChessState, sq: Square): Move[] {
  const moves: Move[] = [];
  const { board } = state;
  const piece = board[sq]!;
  const color = pieceColor(piece);
  const [row, col] = squareToRC(sq);
  const offsets: [number, number][] = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

  for (const [dr, dc] of offsets) {
    const nr = row + dr, nc = col + dc;
    if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
    const to = rcToSquare(nr, nc);
    const target = board[to];
    if (target === null) {
      moves.push(makeMove(sq, to, null, null));
    } else if (pieceColor(target) !== color) {
      moves.push(makeMove(sq, to, target, null));
    }
  }
  return moves;
}

export function slidingMoves(state: ChessState, sq: Square, dirs: [number, number][]): Move[] {
  const moves: Move[] = [];
  const { board } = state;
  const piece = board[sq]!;
  const color = pieceColor(piece);
  const [row, col] = squareToRC(sq);

  for (const [dr, dc] of dirs) {
    let nr = row + dr, nc = col + dc;
    while (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
      const to = rcToSquare(nr, nc);
      const target = board[to];
      if (target === null) {
        moves.push(makeMove(sq, to, null, null));
      } else {
        if (pieceColor(target) !== color) {
          moves.push(makeMove(sq, to, target, null));
        }
        break;
      }
      nr += dr; nc += dc;
    }
  }
  return moves;
}

export function kingMoves(state: ChessState, sq: Square): Move[] {
  const moves: Move[] = [];
  const { board, castlingRights } = state;
  const piece = board[sq]!;
  const color = pieceColor(piece);
  const [row, col] = squareToRC(sq);
  const opp = color === 'w' ? 'b' : 'w';

  // Normal moves
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      const to = rcToSquare(nr, nc);
      const target = board[to];
      if (target === null || pieceColor(target) !== color) {
        moves.push(makeMove(sq, to, target ?? null, null));
      }
    }
  }

  // Castling
  if (color === 'w' && sq === 60) {
    if (castlingRights.wKingside && board[61] === null && board[62] === null &&
        !isSquareAttackedBy(board, 60, opp) &&
        !isSquareAttackedBy(board, 61, opp) &&
        !isSquareAttackedBy(board, 62, opp)) {
      const m = makeMove(60, 62, null, null);
      m.isCastle = true; m.castleRookFrom = 63; m.castleRookTo = 61;
      moves.push(m);
    }
    if (castlingRights.wQueenside && board[59] === null && board[58] === null && board[57] === null &&
        !isSquareAttackedBy(board, 60, opp) &&
        !isSquareAttackedBy(board, 59, opp) &&
        !isSquareAttackedBy(board, 58, opp)) {
      const m = makeMove(60, 58, null, null);
      m.isCastle = true; m.castleRookFrom = 56; m.castleRookTo = 59;
      moves.push(m);
    }
  } else if (color === 'b' && sq === 4) {
    if (castlingRights.bKingside && board[5] === null && board[6] === null &&
        !isSquareAttackedBy(board, 4, opp) &&
        !isSquareAttackedBy(board, 5, opp) &&
        !isSquareAttackedBy(board, 6, opp)) {
      const m = makeMove(4, 6, null, null);
      m.isCastle = true; m.castleRookFrom = 7; m.castleRookTo = 5;
      moves.push(m);
    }
    if (castlingRights.bQueenside && board[3] === null && board[2] === null && board[1] === null &&
        !isSquareAttackedBy(board, 4, opp) &&
        !isSquareAttackedBy(board, 3, opp) &&
        !isSquareAttackedBy(board, 2, opp)) {
      const m = makeMove(4, 2, null, null);
      m.isCastle = true; m.castleRookFrom = 0; m.castleRookTo = 3;
      moves.push(m);
    }
  }

  return moves;
}

// ─── attack detection ───────────────────────────────────────────────────────

export function isSquareAttackedBy(board: (PieceStr | null)[], sq: Square, byColor: 'w' | 'b'): boolean {
  const [row, col] = squareToRC(sq);

  // Pawn attacks
  if (byColor === 'w') {
    // White pawns attack upward (decreasing row). A white pawn at (row+1, col±1) attacks sq.
    for (const dc of [-1, 1]) {
      const pr = row + 1, pc = col + dc;
      if (pr >= 0 && pr <= 7 && pc >= 0 && pc <= 7) {
        const p = board[rcToSquare(pr, pc)];
        if (p === 'wP') return true;
      }
    }
  } else {
    // Black pawns attack downward (increasing row). A black pawn at (row-1, col±1) attacks sq.
    for (const dc of [-1, 1]) {
      const pr = row - 1, pc = col + dc;
      if (pr >= 0 && pr <= 7 && pc >= 0 && pc <= 7) {
        const p = board[rcToSquare(pr, pc)];
        if (p === 'bP') return true;
      }
    }
  }

  // Knight attacks
  const knight = byColor + 'N';
  for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as [number, number][]) {
    const nr = row + dr, nc = col + dc;
    if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7 && board[rcToSquare(nr, nc)] === knight) return true;
  }

  // Diagonal attacks (bishop + queen)
  const bishop = byColor + 'B', queen = byColor + 'Q';
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as [number, number][]) {
    let nr = row + dr, nc = col + dc;
    while (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
      const p = board[rcToSquare(nr, nc)];
      if (p !== null) {
        if (p === bishop || p === queen) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }

  // Orthogonal attacks (rook + queen)
  const rook = byColor + 'R';
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
    let nr = row + dr, nc = col + dc;
    while (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
      const p = board[rcToSquare(nr, nc)];
      if (p !== null) {
        if (p === rook || p === queen) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }

  // King attacks
  const king = byColor + 'K';
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr, nc = col + dc;
      if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7 && board[rcToSquare(nr, nc)] === king) return true;
    }
  }

  return false;
}

export function isInCheck(state: ChessState): boolean {
  let kingSq: number;
  try {
    kingSq = findKing(state.board, state.turn);
  } catch {
    // King missing — treat as not-in-check (game over will be handled upstream)
    return false;
  }
  return isSquareAttackedBy(state.board, kingSq, state.turn === 'w' ? 'b' : 'w');
}

// ─── move application ───────────────────────────────────────────────────────

export function applyMove(state: ChessState, move: Move): ChessState {
  const next: ChessState = {
    board: [...state.board],
    turn: state.turn,
    enPassantSquare: null,
    halfMoveClock: state.halfMoveClock,
    fullMoveNumber: state.fullMoveNumber,
    castlingRights: cloneCastlingRights(state.castlingRights),
  };
  applyMoveToBoard(next, move);
  return next;
}

export function applyMoveInPlace(state: ChessState, move: Move): SavedState {
  const saved: SavedState = {
    capturedPiece: move.capture,
    enPassantCapturePiece: move.enPassantCaptureSq !== null ? state.board[move.enPassantCaptureSq] : null,
    previousEnPassantSq: state.enPassantSquare,
    previousCastlingRights: cloneCastlingRights(state.castlingRights),
    previousHalfMoveClock: state.halfMoveClock,
    previousFullMoveNumber: state.fullMoveNumber,
  };
  applyMoveToBoard(state, move);
  return saved;
}

function applyMoveToBoard(state: ChessState, move: Move): void {
  const { board } = state;
  const moving = board[move.from]!;
  const color = pieceColor(moving);
  const type = pieceType(moving);

  // Move piece
  board[move.to] = move.promotion ?? moving;
  board[move.from] = null;

  // En passant capture
  if (move.enPassantCaptureSq !== null) {
    board[move.enPassantCaptureSq] = null;
  }

  // Castling rook
  if (move.isCastle && move.castleRookFrom !== undefined && move.castleRookTo !== undefined) {
    board[move.castleRookTo] = board[move.castleRookFrom];
    board[move.castleRookFrom] = null;
  }

  // Update castling rights
  if (type === 'K') {
    if (color === 'w') {
      state.castlingRights.wKingside = false;
      state.castlingRights.wQueenside = false;
    } else {
      state.castlingRights.bKingside = false;
      state.castlingRights.bQueenside = false;
    }
  }
  if (type === 'R') {
    if (move.from === 63) state.castlingRights.wKingside = false;
    if (move.from === 56) state.castlingRights.wQueenside = false;
    if (move.from === 7) state.castlingRights.bKingside = false;
    if (move.from === 0) state.castlingRights.bQueenside = false;
  }
  // If a rook is captured on its starting square
  if (move.to === 63 && move.capture) state.castlingRights.wKingside = false;
  if (move.to === 56 && move.capture) state.castlingRights.wQueenside = false;
  if (move.to === 7 && move.capture) state.castlingRights.bKingside = false;
  if (move.to === 0 && move.capture) state.castlingRights.bQueenside = false;

  // En passant square
  state.enPassantSquare = move.newEnPassantSq;

  // Half-move clock
  if (type === 'P' || move.capture !== null) {
    state.halfMoveClock = 0;
  } else {
    state.halfMoveClock++;
  }

  // Full move number
  if (color === 'b') state.fullMoveNumber++;

  // Switch turn
  state.turn = color === 'w' ? 'b' : 'w';
}

export function undoMove(state: ChessState, move: Move, saved: SavedState): void {
  const { board } = state;
  const movedPiece = move.promotion !== null ? (move.from < 8 || move.from > 55 ? 'bP' : 'wP') : board[move.to]!;

  // Undo promotion: restore pawn
  const originalPiece = move.promotion !== null
    ? makePiece(pieceColor(movedPiece), 'P')
    : movedPiece;

  board[move.from] = originalPiece;
  board[move.to] = saved.capturedPiece;

  // Restore en passant captured pawn
  if (move.enPassantCaptureSq !== null && saved.enPassantCapturePiece !== null) {
    board[move.enPassantCaptureSq] = saved.enPassantCapturePiece;
    board[move.to] = null;
  }

  // Restore castling rook
  if (move.isCastle && move.castleRookFrom !== undefined && move.castleRookTo !== undefined) {
    board[move.castleRookFrom] = board[move.castleRookTo];
    board[move.castleRookTo] = null;
  }

  // Restore state
  state.enPassantSquare = saved.previousEnPassantSq;
  state.castlingRights = saved.previousCastlingRights;
  state.halfMoveClock = saved.previousHalfMoveClock;
  state.fullMoveNumber = saved.previousFullMoveNumber;
  state.turn = pieceColor(originalPiece);
}

// ─── full move generation ───────────────────────────────────────────────────

export function generatePseudoLegal(state: ChessState, frozenSquares?: Set<Square>): Move[] {
  const moves: Move[] = [];
  const { board, turn } = state;

  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p === null || pieceColor(p) !== turn) continue;
    if (frozenSquares?.has(sq)) continue;

    const t = pieceType(p);
    switch (t) {
      case 'P': moves.push(...pawnMoves(state, sq)); break;
      case 'N': moves.push(...knightMoves(state, sq)); break;
      case 'B': moves.push(...slidingMoves(state, sq, [[-1,-1],[-1,1],[1,-1],[1,1]])); break;
      case 'R': moves.push(...slidingMoves(state, sq, [[-1,0],[1,0],[0,-1],[0,1]])); break;
      case 'Q': moves.push(...slidingMoves(state, sq, [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]])); break;
      case 'K': moves.push(...kingMoves(state, sq)); break;
    }
  }

  return moves;
}

export function generateLegal(state: ChessState, frozenSquares?: Set<Square>): Move[] {
  const pseudo = generatePseudoLegal(state, frozenSquares);
  const legal: Move[] = [];

  for (const move of pseudo) {
    // Never allow capturing a king — Super Chess card effects can create positions
    // where this is pseudo-legal, but it must remain illegal.
    if (move.capture && pieceType(move.capture) === 'K') continue;

    const saved = applyMoveInPlace(state, move);
    // After applying, turn has switched — check the PREVIOUS player's king
    const prevColor = state.turn === 'w' ? 'b' : 'w';
    let kingSq: number;
    try {
      kingSq = findKing(state.board, prevColor);
    } catch {
      // King not found after applying this move (Super Chess edge case).
      undoMove(state, move, saved);
      continue;
    }
    if (!isSquareAttackedBy(state.board, kingSq, state.turn)) {
      legal.push(move);
    }
    undoMove(state, move, saved);
  }

  return legal;
}

// ─── algebraic notation ─────────────────────────────────────────────────────

export function toAlgebraic(state: ChessState, move: Move): string {
  const { board } = state;
  const moving = board[move.from]!;
  const t = pieceType(moving);

  if (move.isCastle) {
    return move.to > move.from ? 'O-O' : 'O-O-O';
  }

  const dest = move.to;
  const { squareToAlgebraic: s2a } = { squareToAlgebraic: (sq: number) => String.fromCharCode(97 + (sq & 7)) + String(8 - (sq >> 3)) };

  if (t === 'P') {
    let n = '';
    if (move.capture !== null || move.enPassantCaptureSq !== null) {
      n = String.fromCharCode(97 + (move.from & 7)) + 'x';
    }
    n += s2a(dest);
    if (move.promotion) n += '=' + move.promotion[1];
    return n;
  }

  // Disambiguation: check if another piece of same type can also go to dest
  const legal = generateLegal(state);
  const ambiguous = legal.filter(m =>
    m.from !== move.from &&
    board[m.from] === moving &&
    m.to === dest
  );

  let disambig = '';
  if (ambiguous.length > 0) {
    const sameFile = ambiguous.some(m => (m.from & 7) === (move.from & 7));
    const sameRank = ambiguous.some(m => (m.from >> 3) === (move.from >> 3));
    if (!sameFile) disambig = String.fromCharCode(97 + (move.from & 7));
    else if (!sameRank) disambig = String(8 - (move.from >> 3));
    else disambig = s2a(move.from);
  }

  let n = t + disambig;
  if (move.capture !== null) n += 'x';
  n += s2a(dest);
  return n;
}
