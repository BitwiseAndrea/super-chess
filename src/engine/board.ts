// src/engine/board.ts
import type { Square, PieceColor, PieceType, PieceStr, Board, ChessState, CastlingRights } from './types.ts';

export function squareToRC(sq: Square): [row: number, col: number] {
  return [sq >> 3, sq & 7];
}

export function rcToSquare(row: number, col: number): Square {
  return (row << 3) | col;
}

export function squareToAlgebraic(sq: Square): string {
  const [row, col] = squareToRC(sq);
  return String.fromCharCode(97 + col) + String(8 - row);
}

export function algebraicToSquare(alg: string): Square {
  const col = alg.charCodeAt(0) - 97;
  const row = 8 - parseInt(alg[1], 10);
  return rcToSquare(row, col);
}

export function pieceColor(p: PieceStr): PieceColor {
  return p[0] as PieceColor;
}

export function pieceType(p: PieceStr): PieceType {
  return p[1] as PieceType;
}

export function makePiece(color: PieceColor, type: PieceType): PieceStr {
  return color + type;
}

export function pieceValue(type: PieceType): number {
  switch (type) {
    case 'P': return 100;
    case 'N': return 320;
    case 'B': return 330;
    case 'R': return 500;
    case 'Q': return 900;
    case 'K': return 20000;
  }
}

export function totalMaterial(board: Board, color: PieceColor): number {
  let total = 0;
  for (const p of board) {
    if (p !== null && pieceColor(p) === color) {
      total += pieceValue(pieceType(p));
    }
  }
  return total;
}

export function findKing(board: Board, color: PieceColor): Square {
  const king = color + 'K';
  for (let i = 0; i < 64; i++) {
    if (board[i] === king) return i;
  }
  throw new Error(`King not found for color ${color}`);
}

export function cloneCastlingRights(cr: CastlingRights): CastlingRights {
  return { wKingside: cr.wKingside, wQueenside: cr.wQueenside, bKingside: cr.bKingside, bQueenside: cr.bQueenside };
}

export function cloneState(state: ChessState): ChessState {
  return {
    board: [...state.board],
    turn: state.turn,
    enPassantSquare: state.enPassantSquare,
    halfMoveClock: state.halfMoveClock,
    fullMoveNumber: state.fullMoveNumber,
    castlingRights: cloneCastlingRights(state.castlingRights),
  };
}

export function initialState(): ChessState {
  const board: Board = new Array(64).fill(null);
  // Black back rank (row 0)
  const backRankTypes: PieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let col = 0; col < 8; col++) {
    board[col] = makePiece('b', backRankTypes[col]);
    board[8 + col] = makePiece('b', 'P');
    board[48 + col] = makePiece('w', 'P');
    board[56 + col] = makePiece('w', backRankTypes[col]);
  }
  return {
    board,
    turn: 'w',
    enPassantSquare: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    castlingRights: { wKingside: true, wQueenside: true, bKingside: true, bQueenside: true },
  };
}

export function opponent(color: PieceColor): PieceColor {
  return color === 'w' ? 'b' : 'w';
}
