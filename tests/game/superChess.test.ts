// tests/game/superChess.test.ts
import { describe, it, expect } from 'vitest';
import { SuperChessGame } from '../../src/game/superChess.ts';
import { MinimaxAI } from '../../src/ai/minimaxAI.ts';
import { HeuristicCardAI } from '../../src/ai/heuristicCardAI.ts';
import type { SimulationConfig } from '../../src/simulation/types.ts';

function makeConfig(games = 1, seed = 0): SimulationConfig {
  const chessAI = new MinimaxAI(1); // depth 1 for speed
  const cardAI = new HeuristicCardAI();
  return {
    games,
    chessAI: { white: chessAI, black: chessAI },
    cardAI: { white: cardAI, black: cardAI },
    searchDepth: 1,
    speedMs: 0,
    maxMovesPerGame: 100,
    seed,
  };
}

describe('SuperChessGame', () => {
  it('completes a single game without error', async () => {
    const game = new SuperChessGame(makeConfig(1, 42));
    const result = await game.runToCompletion();
    expect(result).toBeDefined();
    expect(result.reason).toMatch(/checkmate|stalemate|50-move|move-limit/);
    expect(result.totalMoves).toBeGreaterThan(0);
  }, 30000);

  it('records move history', async () => {
    const game = new SuperChessGame(makeConfig(1, 1));
    const result = await game.runToCompletion();
    const state = game.getState();
    expect(state.history.filter((e) => e.type === 'move').length).toBeGreaterThan(0);
  }, 30000);

  it('game ends with a result', async () => {
    const game = new SuperChessGame(makeConfig(1, 2));
    const result = await game.runToCompletion();
    expect(result.winner === 'w' || result.winner === 'b' || result.winner === null).toBe(true);
  }, 30000);
});
