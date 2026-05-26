// tests/engine/board.test.ts
import { describe, it, expect } from 'vitest';
import {
  squareToRC, rcToSquare, squareToAlgebraic, algebraicToSquare,
  pieceColor, pieceType, makePiece, pieceValue, totalMaterial, findKing,
  cloneState, initialState,
} from '../../src/engine/board.ts';

describe('squareToRC / rcToSquare', () => {
  it('converts a8 (sq 0) to row 0, col 0', () => {
    expect(squareToRC(0)).toEqual([0, 0]);
  });
  it('converts h1 (sq 63) to row 7, col 7', () => {
    expect(squareToRC(63)).toEqual([7, 7]);
  });
  it('converts e4 (row 4, col 4) to sq 36', () => {
    expect(rcToSquare(4, 4)).toBe(36);
  });
  it('round-trips', () => {
    for (let sq = 0; sq < 64; sq++) {
      const [r, c] = squareToRC(sq);
      expect(rcToSquare(r, c)).toBe(sq);
    }
  });
});

describe('squareToAlgebraic / algebraicToSquare', () => {
  it('a8 → sq 0', () => {
    expect(algebraicToSquare('a8')).toBe(0);
  });
  it('h1 → sq 63', () => {
    expect(algebraicToSquare('h1')).toBe(63);
  });
  it('e4 → sq 36', () => {
    expect(algebraicToSquare('e4')).toBe(36);
  });
  it('sq 0 → a8', () => {
    expect(squareToAlgebraic(0)).toBe('a8');
  });
  it('sq 63 → h1', () => {
    expect(squareToAlgebraic(63)).toBe('h1');
  });
  it('round-trips all squares', () => {
    for (let sq = 0; sq < 64; sq++) {
      expect(algebraicToSquare(squareToAlgebraic(sq))).toBe(sq);
    }
  });
});

describe('piece helpers', () => {
  it('pieceColor("wQ") → "w"', () => expect(pieceColor('wQ')).toBe('w'));
  it('pieceColor("bK") → "b"', () => expect(pieceColor('bK')).toBe('b'));
  it('pieceType("wQ") → "Q"', () => expect(pieceType('wQ')).toBe('Q'));
  it('makePiece("w","N") → "wN"', () => expect(makePiece('w', 'N')).toBe('wN'));

  it('pieceValue Q=900, R=500, B=330, N=320, P=100, K=20000', () => {
    expect(pieceValue('Q')).toBe(900);
    expect(pieceValue('R')).toBe(500);
    expect(pieceValue('B')).toBe(330);
    expect(pieceValue('N')).toBe(320);
    expect(pieceValue('P')).toBe(100);
    expect(pieceValue('K')).toBe(20000);
  });
});

describe('initialState', () => {
  it('has white pieces on rank 1 (row 7)', () => {
    const s = initialState();
    expect(s.board[56]).toBe('wR');
    expect(s.board[57]).toBe('wN');
    expect(s.board[60]).toBe('wK');
    expect(s.board[63]).toBe('wR');
  });
  it('has black pieces on rank 8 (row 0)', () => {
    const s = initialState();
    expect(s.board[0]).toBe('bR');
    expect(s.board[4]).toBe('bK');
  });
  it('has 8 white pawns on rank 2', () => {
    const s = initialState();
    let count = 0;
    for (let c = 0; c < 8; c++) {
      if (s.board[48 + c] === 'wP') count++;
    }
    expect(count).toBe(8);
  });
  it('starts with white to move', () => {
    expect(initialState().turn).toBe('w');
  });
});

describe('findKing', () => {
  it('finds white king at e1 (sq 60) in starting position', () => {
    expect(findKing(initialState().board, 'w')).toBe(60);
  });
  it('finds black king at e8 (sq 4)', () => {
    expect(findKing(initialState().board, 'b')).toBe(4);
  });
});

describe('totalMaterial', () => {
  it('both sides have equal material at start', () => {
    const s = initialState();
    expect(totalMaterial(s.board, 'w')).toBe(totalMaterial(s.board, 'b'));
  });
});

describe('cloneState', () => {
  it('creates a deep clone', () => {
    const s = initialState();
    const c = cloneState(s);
    c.board[0] = null;
    expect(s.board[0]).toBe('bR'); // original unchanged
  });
});
