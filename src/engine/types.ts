// src/engine/types.ts
// All chess engine type definitions.
// Square 0 = a8 (top-left), 63 = h1 (bottom-right)
// Row 0 = rank 8, Row 7 = rank 1
// Col 0 = a-file, Col 7 = h-file

export type Square = number; // 0–63

export type PieceColor = 'w' | 'b';
export type PieceType = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K';

export interface Piece {
  color: PieceColor;
  type: PieceType;
}

// Compact piece string: 'wP', 'bK', 'wQ', etc.
export type PieceStr = string;

// 64 entries, null = empty
export type Board = (PieceStr | null)[];

export interface CastlingRights {
  wKingside: boolean;
  wQueenside: boolean;
  bKingside: boolean;
  bQueenside: boolean;
}

export interface ChessState {
  board: Board;
  turn: PieceColor;
  enPassantSquare: Square | null; // square the capturing pawn moves TO
  halfMoveClock: number;
  fullMoveNumber: number;
  castlingRights: CastlingRights;
}

export interface Move {
  from: Square;
  to: Square;
  capture: PieceStr | null;
  promotion: PieceStr | null;
  enPassantCaptureSq: Square | null; // square of the captured pawn in e.p.
  newEnPassantSq: Square | null;     // e.p. target set after double pawn push
  isCastle: boolean;
  castleRookFrom?: Square;
  castleRookTo?: Square;
}

export interface AnnotatedMove extends Move {
  algebraic: string;
  turnNumber: number;
  color: PieceColor;
}

// Saved state for undoMove
export interface SavedState {
  capturedPiece: PieceStr | null;
  enPassantCapturePiece: PieceStr | null;
  previousEnPassantSq: Square | null;
  previousCastlingRights: CastlingRights;
  previousHalfMoveClock: number;
  previousFullMoveNumber: number;
  // Saved explicitly: in normal play this equals the moving piece's color,
  // but Super Chess card effects (e.g. Trade) can place pieces on ranks
  // where the moved-piece color cannot be safely inferred from move.from.
  previousTurn: PieceColor;
}
