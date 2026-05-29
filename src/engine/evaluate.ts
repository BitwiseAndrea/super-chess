// src/engine/evaluate.ts
// Material + piece-square table evaluation. White-positive.
//
// All tunable constants and tables live in `public/super-chess.json` (the
// single source of truth shared with the Roblox port). Edit there and re-run
// `pnpm cards:sync` to regenerate the Luau snapshot.
import type { ChessState, PieceType } from './types.ts';
import { pieceColor, pieceType, pieceValue } from './board.ts';
import {
  PIECE_SQUARE_TABLES,
  TEMPO_COMPENSATION_CP as DATA_TEMPO,
  FROZEN_PENALTY as DATA_FROZEN,
  SHIELD_BONUS as DATA_SHIELD,
  FOUL_SQ_PENALTY as DATA_FOUL,
} from '../data/superChessData.ts';

// Card-state context passed in from Super Chess layer (avoids circular deps).
export interface CardEvalContext {
  frozenSquares: ReadonlySet<number>;    // immobile pieces — penalty to owner
  shieldedSquares: ReadonlySet<number>;  // uncapturable pieces — bonus to owner
  foulSquares: ReadonlyMap<number, 'w' | 'b'>; // sq → color FORBIDDEN from entering
}

const FROZEN_PENALTY  = DATA_FROZEN;
const SHIELD_BONUS    = DATA_SHIELD;
const FOUL_SQ_PENALTY = DATA_FOUL;

export const TEMPO_COMPENSATION_CP = DATA_TEMPO;
export const PST: Record<PieceType, number[]> = PIECE_SQUARE_TABLES;

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
