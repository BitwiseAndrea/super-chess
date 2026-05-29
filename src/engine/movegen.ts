// src/engine/movegen.ts
import type { Square, Move, ChessState, PieceStr, SavedState } from './types.ts';
import { squareToRC, rcToSquare, pieceColor, pieceType, makePiece, findKing, cloneCastlingRights } from './board.ts';

// ─── helpers ───────────────────────────────────────────────────────────────

function makeMove(
  movingPiece: PieceStr,
  from: Square,
  to: Square,
  capture: PieceStr | null,
  promotion: PieceStr | null,
): Move {
  return {
    movingPiece,
    from, to, capture, promotion,
    enPassantCaptureSq: null, newEnPassantSq: null, isCastle: false,
  };
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
          moves.push(makeMove(piece, sq, fwd, null, pt));
        }
      } else {
        moves.push(makeMove(piece, sq, fwd, null, null));
        // Double push from rank 2 (row 6)
        if (row === 6 && board[sq - 16] === null) {
          const m = makeMove(piece, sq, sq - 16, null, null);
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
            moves.push(makeMove(piece, sq, capSq, target, pt));
          }
        } else {
          moves.push(makeMove(piece, sq, capSq, target, null));
        }
      } else if (enPassantSquare === capSq) {
        // Defensive: only generate the e.p. move when there's
        // actually a black pawn at the e.p. capture square. The e.p.
        // square can desync from the board in contrived states (turn
        // flipped manually, card effects, etc); without this guard
        // we'd generate a "fake" capture move and undoMove would
        // later restore a phantom piece to move.to. Caught by
        // state-purity tests.
        const epCapSq = rcToSquare(row, nc);
        const epCapPiece = board[epCapSq];
        if (epCapPiece && pieceColor(epCapPiece) === 'b' && pieceType(epCapPiece) === 'P') {
          const m = makeMove(piece, sq, capSq, epCapPiece, null);
          m.enPassantCaptureSq = epCapSq;
          moves.push(m);
        }
      }
    }
  } else {
    // Black
    const fwd = sq + 8;
    if (row < 7 && board[fwd] === null) {
      if (row + 1 === 7) {
        for (const pt of ['bQ', 'bR', 'bB', 'bN'] as PieceStr[]) {
          moves.push(makeMove(piece, sq, fwd, null, pt));
        }
      } else {
        moves.push(makeMove(piece, sq, fwd, null, null));
        if (row === 1 && board[sq + 16] === null) {
          const m = makeMove(piece, sq, sq + 16, null, null);
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
            moves.push(makeMove(piece, sq, capSq, target, pt));
          }
        } else {
          moves.push(makeMove(piece, sq, capSq, target, null));
        }
      } else if (enPassantSquare === capSq) {
        // Defensive: same guard as the white-pawn branch above. Only
        // generate the e.p. move when there's actually a white pawn
        // at the e.p. capture square; otherwise skip it. See the
        // matching branch for the full rationale.
        const epCapSq = rcToSquare(row, nc);
        const epCapPiece = board[epCapSq];
        if (epCapPiece && pieceColor(epCapPiece) === 'w' && pieceType(epCapPiece) === 'P') {
          const m = makeMove(piece, sq, capSq, epCapPiece, null);
          m.enPassantCaptureSq = epCapSq;
          moves.push(m);
        }
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
      moves.push(makeMove(piece, sq, to, null, null));
    } else if (pieceColor(target) !== color) {
      moves.push(makeMove(piece, sq, to, target, null));
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
        moves.push(makeMove(piece, sq, to, null, null));
      } else {
        if (pieceColor(target) !== color) {
          moves.push(makeMove(piece, sq, to, target, null));
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
        moves.push(makeMove(piece, sq, to, target ?? null, null));
      }
    }
  }

  // Castling — only legal from the king's starting square. We derive the
  // starting square from color (no hardcoded magic numbers): white king on
  // e1 (rcToSquare(7,4)), black king on e8 (rcToSquare(0,4)).
  const homeRow = HOME_ROW[color];
  const kingHome = rcToSquare(homeRow, 4);
  if (sq !== kingHome) return moves;

  const ownRook = makePiece(color, 'R');
  // Kingside: rook home file h (col 7), king travels e→g (cols 4→6),
  // rook ends on f (col 5). Squares between must be empty and not attacked.
  if (castlingRights[`${color}Kingside`]) {
    const rookFrom = rcToSquare(homeRow, 7);
    const fSq = rcToSquare(homeRow, 5);
    const gSq = rcToSquare(homeRow, 6);
    if (
      board[rookFrom] === ownRook &&
      board[fSq] === null && board[gSq] === null &&
      !isSquareAttackedBy(board, sq, opp) &&
      !isSquareAttackedBy(board, fSq, opp) &&
      !isSquareAttackedBy(board, gSq, opp)
    ) {
      const m = makeMove(piece, sq, gSq, null, null);
      m.isCastle = true; m.castleRookFrom = rookFrom; m.castleRookTo = fSq;
      moves.push(m);
    }
  }
  // Queenside: rook home file a (col 0), king travels e→c (cols 4→2),
  // rook ends on d (col 3). b-file (col 1) must be empty but isn't checked
  // for attack (rook passes through it).
  if (castlingRights[`${color}Queenside`]) {
    const rookFrom = rcToSquare(homeRow, 0);
    const bSq = rcToSquare(homeRow, 1);
    const cSq = rcToSquare(homeRow, 2);
    const dSq = rcToSquare(homeRow, 3);
    if (
      board[rookFrom] === ownRook &&
      board[bSq] === null && board[cSq] === null && board[dSq] === null &&
      !isSquareAttackedBy(board, sq, opp) &&
      !isSquareAttackedBy(board, dSq, opp) &&
      !isSquareAttackedBy(board, cSq, opp)
    ) {
      const m = makeMove(piece, sq, cSq, null, null);
      m.isCastle = true; m.castleRookFrom = rookFrom; m.castleRookTo = dSq;
      moves.push(m);
    }
  }

  return moves;
}

// Each color's home rank (row index, where row 0 = rank 8 / black home).
const HOME_ROW: Record<'w' | 'b', number> = { w: 7, b: 0 };

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
    movingPiece: move.movingPiece,
    capturedPiece: move.capture,
    enPassantCapturePiece: move.enPassantCaptureSq !== null ? state.board[move.enPassantCaptureSq] : null,
    previousEnPassantSq: state.enPassantSquare,
    previousCastlingRights: cloneCastlingRights(state.castlingRights),
    previousHalfMoveClock: state.halfMoveClock,
    previousFullMoveNumber: state.fullMoveNumber,
    previousTurn: state.turn,
  };
  applyMoveToBoard(state, move);
  return saved;
}

function applyMoveToBoard(state: ChessState, move: Move): void {
  const { board } = state;
  const moving = move.movingPiece;
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

  // Update castling rights — driven by piece identity and home-row geometry,
  // not by hardcoded square numbers (would break if cards moved the rook).
  if (type === 'K') {
    state.castlingRights[`${color}Kingside`] = false;
    state.castlingRights[`${color}Queenside`] = false;
  }
  if (type === 'R') {
    const ownHomeRow = HOME_ROW[color];
    if (move.from === rcToSquare(ownHomeRow, 7)) state.castlingRights[`${color}Kingside`] = false;
    if (move.from === rcToSquare(ownHomeRow, 0)) state.castlingRights[`${color}Queenside`] = false;
  }
  // A rook captured on its own starting square revokes that side's rights.
  if (move.capture && pieceType(move.capture) === 'R') {
    const oppColor = pieceColor(move.capture);
    const oppHomeRow = HOME_ROW[oppColor];
    if (move.to === rcToSquare(oppHomeRow, 7)) state.castlingRights[`${oppColor}Kingside`] = false;
    if (move.to === rcToSquare(oppHomeRow, 0)) state.castlingRights[`${oppColor}Queenside`] = false;
  }

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
  // Restore exactly what was there before the move \u2014 no inference. The
  // moving piece is the one we recorded in SavedState (un-promoted shape).
  board[move.from] = saved.movingPiece;

  // For e.p. captures the captured pawn lived at `enPassantCaptureSq`,
  // NOT at `move.to`. Belt-and-braces guard: never restore a piece at
  // move.to for an e.p. move, even if `saved.capturedPiece` happens to
  // be set (which can happen in contrived states where pseudo-legal
  // generation produced a stale e.p. move). Caught by state-purity
  // tests after we hit the phantom-pawn bug.
  if (move.enPassantCaptureSq !== null) {
    board[move.to] = null;
    if (saved.enPassantCapturePiece !== null) {
      board[move.enPassantCaptureSq] = saved.enPassantCapturePiece;
    }
  } else {
    board[move.to] = saved.capturedPiece;
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
  state.turn = saved.previousTurn;
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
    // The PREVIOUS player (the one who just moved) is recorded in saved.previousTurn;
    // their king must not be in check after the move.
    const prevColor = saved.previousTurn;
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
  // Use the move's recorded movingPiece — works regardless of whether `state`
  // is pre- or post-apply, and tolerates card-induced board edits between
  // generation and rendering.
  const moving = move.movingPiece;
  const t = pieceType(moving);

  if (move.isCastle) {
    return move.to > move.from ? 'O-O' : 'O-O-O';
  }

  const dest = move.to;
  const s2a = (sq: number): string => String.fromCharCode(97 + (sq & 7)) + String(8 - (sq >> 3));

  if (t === 'P') {
    let n = '';
    if (move.capture !== null || move.enPassantCaptureSq !== null) {
      n = String.fromCharCode(97 + (move.from & 7)) + 'x';
    }
    n += s2a(dest);
    if (move.promotion) n += '=' + move.promotion[1];
    return n;
  }

  // Disambiguation: check if another piece of same type and color can also
  // go to dest in this state.
  const legal = generateLegal(state);
  const ambiguous = legal.filter(m =>
    m.from !== move.from &&
    m.movingPiece === moving &&
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
