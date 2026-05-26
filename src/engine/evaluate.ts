// src/engine/evaluate.ts
// Material + piece-square table evaluation. White-positive.
import type { ChessState, PieceType } from './types.ts';
import { pieceColor, pieceType, pieceValue } from './board.ts';

// Card-state context passed in from Super Chess layer (avoids circular deps).
export interface CardEvalContext {
  frozenSquares: ReadonlySet<number>;    // immobile pieces — penalty to owner
  shieldedSquares: ReadonlySet<number>;  // uncapturable pieces — bonus to owner
  foulSquares: ReadonlyMap<number, 'w' | 'b'>; // sq → color FORBIDDEN from entering
}

// Bonus/penalty values (centipawns)
const FROZEN_PENALTY  = 50;   // immobile piece is effectively weaker
const SHIELD_BONUS    = 35;   // piece can't be instantly taken
const FOUL_SQ_PENALTY = 20;   // square off-limits → positional restriction

// Tune this to balance white's first-move structural advantage.
// Target: ~55% white / ~30% draw / ~15% black in engine-vs-engine.
// Increase if white still wins too often; decrease if black starts dominating.
export const TEMPO_COMPENSATION_CP = 75;

// Piece-square tables (from white's perspective, index 0 = a8, 63 = h1)
// Positive values encourage pieces to go to those squares.
const PST_PAWN: number[] = [
   0,  0,  0,  0,  0,  0,  0,  0,  // rank 8 (promotion handled separately)
  50, 50, 50, 50, 50, 50, 50, 50,  // rank 7
  10, 10, 20, 30, 30, 20, 10, 10,  // rank 6
   5,  5, 10, 25, 25, 10,  5,  5,  // rank 5
   0,  0,  0, 20, 20,  0,  0,  0,  // rank 4
   5, -5,-10,  0,  0,-10, -5,  5,  // rank 3
   5, 10, 10,-20,-20, 10, 10,  5,  // rank 2
   0,  0,  0,  0,  0,  0,  0,  0,  // rank 1
];

const PST_KNIGHT: number[] = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];

const PST_BISHOP: number[] = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];

const PST_ROOK: number[] = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0,
];

const PST_QUEEN: number[] = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
];

const PST_KING_MG: number[] = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20,
];

export const PST: Record<PieceType, number[]> = {
  P: PST_PAWN,
  N: PST_KNIGHT,
  B: PST_BISHOP,
  R: PST_ROOK,
  Q: PST_QUEEN,
  K: PST_KING_MG,
};

export interface EvalBreakdown {
  material: number;
  positional: number;
  total: number;
}

export function evaluate(state: ChessState, ctx?: CardEvalContext): number {
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (p === null) continue;
    const color = pieceColor(p);
    const type = pieceType(p);
    const val = pieceValue(type);
    // PST index: white uses sq directly, black mirrors vertically
    const pstIdx = color === 'w' ? sq : (7 - (sq >> 3)) * 8 + (sq & 7);
    const pst = (PST[type]?.[pstIdx] ?? 0);
    const sign = color === 'w' ? 1 : -1;
    let pieceScore = val + pst;

    if (ctx) {
      if (ctx.frozenSquares.has(sq))  pieceScore -= FROZEN_PENALTY;
      if (ctx.shieldedSquares.has(sq)) pieceScore += SHIELD_BONUS;
    }

    score += sign * pieceScore;
  }

  // Foul squares: penalise the colour that is forbidden from those squares
  if (ctx) {
    for (const [, forbiddenColor] of ctx.foulSquares) {
      score += forbiddenColor === 'w' ? -FOUL_SQ_PENALTY : FOUL_SQ_PENALTY;
    }
  }

  // Black tempo compensation: structural head-start to offset white moving first
  score -= TEMPO_COMPENSATION_CP;

  return score;
}

export function evaluateDetailed(state: ChessState): EvalBreakdown {
  let material = 0, positional = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (p === null) continue;
    const color = pieceColor(p);
    const type = pieceType(p);
    const val = pieceValue(type);
    const pstIdx = color === 'w' ? sq : (7 - (sq >> 3)) * 8 + (sq & 7);
    const pst = (PST[type]?.[pstIdx] ?? 0);
    const sign = color === 'w' ? 1 : -1;
    material += sign * val;
    positional += sign * pst;
  }
  return { material, positional, total: material + positional };
}
