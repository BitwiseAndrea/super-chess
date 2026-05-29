// src/engine/fen.ts
import type { ChessState, Board, PieceStr } from './types.ts';
import { initialState } from './board.ts';

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const FEN_PIECE_MAP: Record<string, PieceStr> = {
  'r': 'bR', 'n': 'bN', 'b': 'bB', 'q': 'bQ', 'k': 'bK', 'p': 'bP',
  'R': 'wR', 'N': 'wN', 'B': 'wB', 'Q': 'wQ', 'K': 'wK', 'P': 'wP',
};

const PIECE_FEN_MAP: Record<string, string> = {
  'bR': 'r', 'bN': 'n', 'bB': 'b', 'bQ': 'q', 'bK': 'k', 'bP': 'p',
  'wR': 'R', 'wN': 'N', 'wB': 'B', 'wQ': 'Q', 'wK': 'K', 'wP': 'P',
};

export function parseFEN(fen: string): ChessState {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error(`Invalid FEN: ${fen}`);

  const board: Board = new Array(64).fill(null);
  const rows = parts[0].split('/');
  if (rows.length !== 8) throw new Error('FEN: expected 8 ranks');

  for (let r = 0; r < 8; r++) {
    let c = 0;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '8') {
        c += parseInt(ch, 10);
      } else {
        const p = FEN_PIECE_MAP[ch];
        if (!p) throw new Error(`FEN: unknown piece '${ch}'`);
        board[r * 8 + c] = p;
        c++;
      }
    }
  }

  // Reject malformed turn tokens loudly rather than silently defaulting to 'w'.
  // (The old `parts[1] === 'b' ? 'b' : 'w'` was a guess that hid bugs in
  // callers that pass garbage instead of a real FEN.)
  if (parts[1] !== 'w' && parts[1] !== 'b') {
    throw new Error(`FEN: invalid turn token '${parts[1]}' (expected 'w' or 'b')`);
  }
  const turn = parts[1];

  const cr = parts[2];
  const castlingRights = {
    wKingside: cr.includes('K'),
    wQueenside: cr.includes('Q'),
    bKingside: cr.includes('k'),
    bQueenside: cr.includes('q'),
  };

  let enPassantSquare: number | null = null;
  if (parts[3] !== '-') {
    const col = parts[3].charCodeAt(0) - 97;
    const row = 8 - parseInt(parts[3][1], 10);
    enPassantSquare = row * 8 + col;
  }

  const halfMoveClock = parts.length > 4 ? parseInt(parts[4], 10) : 0;
  const fullMoveNumber = parts.length > 5 ? parseInt(parts[5], 10) : 1;

  return { board, turn, enPassantSquare, halfMoveClock, fullMoveNumber, castlingRights };
}

export function toFEN(state: ChessState): string {
  let fen = '';

  // Board
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = state.board[r * 8 + c];
      if (p === null) {
        empty++;
      } else {
        if (empty > 0) { fen += empty; empty = 0; }
        const ch = PIECE_FEN_MAP[p];
        if (ch === undefined) {
          // A FEN containing '?' is meaningless to any other chess tool. If
          // we have a piece string we don't recognise, it's a bug — fail
          // loudly instead of producing garbage output.
          throw new Error(`toFEN: unknown piece string '${p}' on square ${r * 8 + c}`);
        }
        fen += ch;
      }
    }
    if (empty > 0) fen += empty;
    if (r < 7) fen += '/';
  }

  fen += ' ' + state.turn;

  // Castling
  const cr = state.castlingRights;
  let castleStr = '';
  if (cr.wKingside) castleStr += 'K';
  if (cr.wQueenside) castleStr += 'Q';
  if (cr.bKingside) castleStr += 'k';
  if (cr.bQueenside) castleStr += 'q';
  fen += ' ' + (castleStr || '-');

  // En passant
  if (state.enPassantSquare !== null) {
    const sq = state.enPassantSquare;
    fen += ' ' + String.fromCharCode(97 + (sq & 7)) + String(8 - (sq >> 3));
  } else {
    fen += ' -';
  }

  fen += ' ' + state.halfMoveClock;
  fen += ' ' + state.fullMoveNumber;

  return fen;
}

export { initialState };
