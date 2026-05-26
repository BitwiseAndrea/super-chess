// src/engine/search.ts
import type { ChessState, Move, Square } from './types.ts';
import { generateLegal, applyMoveInPlace, undoMove, isInCheck } from './movegen.ts';
import { evaluate } from './evaluate.ts';
import type { CardEvalContext } from './evaluate.ts';
import { pieceType } from './board.ts';

export interface SearchConfig {
  depth: number;
  timeLimitMs?: number;
}

export interface SearchResult {
  bestMove: Move | null;
  score: number;
  nodesVisited: number;
  depthReached: number;
}

// Move ordering: captures first (by MVV-LVA), then killers, then quiet
const PIECE_ORDER: Record<string, number> = { Q: 5, R: 4, B: 3, N: 2, P: 1, K: 0 };

function scoreMove(move: Move): number {
  if (move.capture !== null) {
    const attacker = PIECE_ORDER[pieceType(move.capture)] ?? 0;
    return 10 + attacker;
  }
  if (move.promotion !== null) return 9;
  return 0;
}

function sortMoves(moves: Move[]): Move[] {
  return moves.sort((a, b) => scoreMove(b) - scoreMove(a));
}

const MATE_SCORE = 100000;

export function alphaBeta(
  state: ChessState,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  frozenSquares: Set<Square>,
  startTime: number,
  timeLimitMs: number | undefined,
  nodesRef: { count: number },
  ctx?: CardEvalContext,
): number {
  nodesRef.count++;

  if (timeLimitMs !== undefined && nodesRef.count % 1000 === 0) {
    if (Date.now() - startTime > timeLimitMs) {
      return maximizing ? -MATE_SCORE : MATE_SCORE;
    }
  }

  if (depth === 0) return quiescence(state, alpha, beta, maximizing, frozenSquares, nodesRef, ctx);

  const moves = generateLegal(state, frozenSquares);

  if (moves.length === 0) {
    if (isInCheck(state)) {
      return maximizing ? -(MATE_SCORE - depth) : (MATE_SCORE - depth);
    }
    return 0; // stalemate
  }

  sortMoves(moves);

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      const saved = applyMoveInPlace(state, move);
      const score = alphaBeta(state, depth - 1, alpha, beta, false, frozenSquares, startTime, timeLimitMs, nodesRef, ctx);
      undoMove(state, move, saved);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      const saved = applyMoveInPlace(state, move);
      const score = alphaBeta(state, depth - 1, alpha, beta, true, frozenSquares, startTime, timeLimitMs, nodesRef, ctx);
      undoMove(state, move, saved);
      if (score < best) best = score;
      if (score < beta) beta = score;
      if (alpha >= beta) break;
    }
    return best;
  }
}

function quiescence(
  state: ChessState,
  alpha: number,
  beta: number,
  maximizing: boolean,
  frozenSquares: Set<Square>,
  nodesRef: { count: number },
  ctx?: CardEvalContext,
): number {
  nodesRef.count++;
  const standPat = evaluate(state, ctx);

  if (maximizing) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    const moves = generateLegal(state, frozenSquares).filter(m => m.capture !== null || m.promotion !== null);
    sortMoves(moves);
    for (const move of moves) {
      const saved = applyMoveInPlace(state, move);
      const score = quiescence(state, alpha, beta, false, frozenSquares, nodesRef, ctx);
      undoMove(state, move, saved);
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return alpha;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;
    const moves = generateLegal(state, frozenSquares).filter(m => m.capture !== null || m.promotion !== null);
    sortMoves(moves);
    for (const move of moves) {
      const saved = applyMoveInPlace(state, move);
      const score = quiescence(state, alpha, beta, true, frozenSquares, nodesRef, ctx);
      undoMove(state, move, saved);
      if (score < beta) beta = score;
      if (alpha >= beta) break;
    }
    return beta;
  }
}

export function search(
  state: ChessState,
  config: SearchConfig,
  frozenSquares?: Set<Square>,
  ctx?: CardEvalContext,
): SearchResult {
  const frozen = frozenSquares ?? new Set<Square>();
  const moves = generateLegal(state, frozen);

  if (moves.length === 0) {
    return { bestMove: null, score: 0, nodesVisited: 0, depthReached: 0 };
  }

  sortMoves(moves);

  const startTime = Date.now();
  const nodesRef = { count: 0 };
  const maximizing = state.turn === 'w';

  let bestMove = moves[0];
  let bestScore = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const saved = applyMoveInPlace(state, move);
    const score = alphaBeta(
      state, config.depth - 1,
      -Infinity, Infinity,
      !maximizing,
      frozen, startTime, config.timeLimitMs, nodesRef, ctx,
    );
    undoMove(state, move, saved);

    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return {
    bestMove,
    score: bestScore,
    nodesVisited: nodesRef.count,
    depthReached: config.depth,
  };
}
