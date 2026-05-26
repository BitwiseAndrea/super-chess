// tests/engine/fen.test.ts
import { describe, it, expect } from 'vitest';
import { parseFEN, toFEN, STARTING_FEN } from '../../src/engine/fen.ts';
import { initialState } from '../../src/engine/board.ts';
import { POSITIONS } from '../fixtures/positions.ts';

describe('FEN parsing', () => {
  it('parses starting FEN correctly', () => {
    const s = parseFEN(STARTING_FEN);
    expect(s.turn).toBe('w');
    expect(s.board[0]).toBe('bR');
    expect(s.board[4]).toBe('bK');
    expect(s.board[56]).toBe('wR');
    expect(s.board[60]).toBe('wK');
    expect(s.castlingRights).toEqual({ wKingside: true, wQueenside: true, bKingside: true, bQueenside: true });
    expect(s.enPassantSquare).toBeNull();
    expect(s.halfMoveClock).toBe(0);
    expect(s.fullMoveNumber).toBe(1);
  });

  it('parses en passant square', () => {
    const s = parseFEN(POSITIONS.AFTER_E4);
    expect(s.enPassantSquare).not.toBeNull();
    expect(s.turn).toBe('b');
  });

  it('parses partial castling rights', () => {
    const s = parseFEN('r3k2r/8/8/8/8/8/8/R3K2R w Kq - 0 1');
    expect(s.castlingRights.wKingside).toBe(true);
    expect(s.castlingRights.wQueenside).toBe(false);
    expect(s.castlingRights.bKingside).toBe(false);
    expect(s.castlingRights.bQueenside).toBe(true);
  });
});

describe('FEN serialization', () => {
  it('round-trips the starting FEN', () => {
    const s = parseFEN(STARTING_FEN);
    expect(toFEN(s)).toBe(STARTING_FEN);
  });

  it('round-trips initialState', () => {
    const s = initialState();
    const fen = toFEN(s);
    const s2 = parseFEN(fen);
    expect(toFEN(s2)).toBe(fen);
  });

  it('round-trips mid-game position', () => {
    const fen = POSITIONS.MIDGAME;
    expect(toFEN(parseFEN(fen))).toBe(fen);
  });
});
