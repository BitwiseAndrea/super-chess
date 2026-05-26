// tests/simulation/runner.test.ts
import { describe, it, expect } from 'vitest';
import { SimulationRunner } from '../../src/simulation/runner.ts';
import { MinimaxAI } from '../../src/ai/minimaxAI.ts';
import { HeuristicCardAI } from '../../src/ai/heuristicCardAI.ts';
import type { SimulationConfig } from '../../src/simulation/types.ts';

function makeConfig(games: number): SimulationConfig {
  const chessAI = new MinimaxAI(1);
  const cardAI = new HeuristicCardAI();
  return {
    games,
    chessAI: { white: chessAI, black: chessAI },
    cardAI: { white: cardAI, black: cardAI },
    searchDepth: 1,
    speedMs: 0,
    maxMovesPerGame: 80,
    seed: 42,
  };
}

describe('SimulationRunner', () => {
  it('runs 3 games to completion', async () => {
    const runner = new SimulationRunner(makeConfig(3));
    const result = await runner.runAll();
    expect(result.games.length).toBe(3);
    expect(result.stats.totalGames).toBe(3);
  }, 60000);

  it('produces valid win rates that sum to 1', async () => {
    const runner = new SimulationRunner(makeConfig(5));
    const result = await runner.runAll();
    const wr = result.stats.winRates;
    expect(Math.abs(wr.white + wr.black + wr.draw - 1)).toBeLessThan(0.001);
  }, 120000);
});
