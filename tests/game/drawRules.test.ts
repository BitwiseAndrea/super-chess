// tests/game/drawRules.test.ts
// Locks in the variant-6 default: each side opens with a card, white
// gets a card on their first capture (no skip).
import { describe, it, expect } from 'vitest';
import { SuperChessGame } from '../../src/game/superChess.ts';
import { MinimaxAI } from '../../src/ai/minimaxAI.ts';
import { HeuristicCardAI } from '../../src/ai/heuristicCardAI.ts';
import type { SimulationConfig } from '../../src/simulation/types.ts';
import { DEFAULT_DRAW_RULES } from '../../src/simulation/types.ts';

function makeConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  const chessAI = new MinimaxAI(1);
  const cardAI = new HeuristicCardAI();
  return {
    games: 1,
    chessAI: { white: chessAI, black: chessAI },
    cardAI: { white: cardAI, black: cardAI },
    searchDepth: 1,
    speedMs: 0,
    maxMovesPerGame: 50,
    seed: 7,
    ...overrides,
  };
}

describe('DrawRules default (variant 6)', () => {
  it('default rules deal one starting card to each color', () => {
    expect(DEFAULT_DRAW_RULES.startingHand).toEqual({ white: 1, black: 1 });
    expect(DEFAULT_DRAW_RULES.whiteFirstDrawSkip).toBe(false);
  });

  it('SuperChessGame logs two starting-hand cardDraw entries before any moves', async () => {
    const game = new SuperChessGame(makeConfig());
    const state = game.getState();
    const startingDraws = state.history.filter(
      (e) => e.type === 'cardDraw' && (e.data as { reason: string }).reason === 'startingHand',
    );
    expect(startingDraws.length).toBe(2);
    const colors = startingDraws.map((e) => (e.data as { color: 'w' | 'b' }).color).sort();
    expect(colors).toEqual(['b', 'w']);
  });

  it('honors a custom drawRules override (e.g. baseline rules)', async () => {
    const game = new SuperChessGame(
      makeConfig({
        drawRules: {
          startingHand: { white: 0, black: 0 },
          whiteFirstDrawSkip: true,
        },
      }),
    );
    const state = game.getState();
    const startingDraws = state.history.filter(
      (e) => e.type === 'cardDraw' && (e.data as { reason: string }).reason === 'startingHand',
    );
    expect(startingDraws.length).toBe(0);
  });
});
