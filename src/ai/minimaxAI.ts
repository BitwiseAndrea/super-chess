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

  async selectMove(state: SuperChessState, _color: PieceColor): Promise<Move> {
    const frozenSquares = new Set<number>(state.superState.frozenSquares.keys());
    const ctx: CardEvalContext = {
      frozenSquares,
      shieldedSquares: new Set(state.superState.shieldedSquares.keys()),
      foulSquares: state.superState.foulSquares as ReadonlyMap<number, 'w' | 'b'>,
    };
    const config: SearchConfig = { depth: this.depth, timeLimitMs: this.timeLimitMs };
    const result = search(state.chess, config, frozenSquares, ctx);

    if (!result.bestMove) {
      throw new Error('MinimaxAI: no legal moves available');
    }

    if (import.meta.env?.DEV) {
      console.debug(`[MinimaxAI] depth=${this.depth} nodes=${result.nodesVisited} score=${result.score}`);
    }

    return result.bestMove;
  }
}
