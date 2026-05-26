// src/config/simulation.config.ts
import type { SimulationConfig } from '../simulation/types.ts';
import type { ChessAI, CardAI } from '../ai/types.ts';

export const DEFAULT_SIM_CONFIG: Omit<SimulationConfig, 'chessAI' | 'cardAI'> = {
  games: 100,
  searchDepth: 2,
  speedMs: 0,
  maxMovesPerGame: 200,
  seed: undefined,
  cardConfig: [],
};

export function makeSimConfig(
  chessAI: { white: ChessAI; black: ChessAI },
  cardAI: { white: CardAI; black: CardAI },
  overrides: Partial<Omit<SimulationConfig, 'chessAI' | 'cardAI'>> = {},
): SimulationConfig {
  return { ...DEFAULT_SIM_CONFIG, ...overrides, chessAI, cardAI };
}
