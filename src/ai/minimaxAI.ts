// src/ai/minimaxAI.ts
import type { PieceColor, Move } from '../engine/types.ts';
import type { SuperChessState } from '../game/types.ts';
import type { ChessAI } from './types.ts';
import { search } from '../engine/search.ts';
import type { SearchConfig } from '../engine/search.ts';
import type { CardEvalContext } from '../engine/evaluate.ts';

export class MinimaxAI implements ChessAI {
  name = 'Minimax';
  private depth: number;
  private timeLimitMs?: number;

  constructor(depth = 2, timeLimitMs?: number) {
    this.depth = depth;
    this.timeLimitMs = timeLimitMs;
  }

  setDepth(depth: number): void {
    this.depth = depth;
  }

  async selectMove(state: SuperChessState, color: PieceColor): Promise<Move> {
    // The search uses `state.chess.turn` to decide who is moving. If the
    // caller's `color` argument disagrees we'd silently return moves for
    // the WRONG side (this was the bug behind the bug-report we got — bot
    // returning a white move while it was black's turn). Refuse loudly so
    // the caller fixes their state before invoking us.
    if (state.chess.turn !== color) {
      throw new Error(
        `MinimaxAI.selectMove: chess.turn is ${state.chess.turn} but caller asked for ${color}. ` +
        'Adjust state.chess.turn before calling.',
      );
    }

    const frozenSquares = new Set<number>(state.superState.frozenSquares.keys());
    const shieldedSquares = new Set<number>(state.superState.shieldedSquares.keys());
    const ctx: CardEvalContext = {
      frozenSquares,
      shieldedSquares,
      foulSquares: state.superState.foulSquares as ReadonlyMap<number, 'w' | 'b'>,
    };
    const config: SearchConfig = { depth: this.depth, timeLimitMs: this.timeLimitMs };
    const result = search(state.chess, config, frozenSquares, ctx, shieldedSquares);

    if (!result.bestMove) {
      throw new Error('MinimaxAI: no legal moves available');
    }

    if (import.meta.env?.DEV) {
      console.debug(`[MinimaxAI] depth=${this.depth} nodes=${result.nodesVisited} score=${result.score}`);
    }

    return result.bestMove;
  }
}
