// src/simulation/types.ts
import type { ChessAI, CardAI } from '../ai/types.ts';
import type { CardDefinition } from '../cards/types.ts';
import type { GameResult, CardStats } from '../game/types.ts';

export interface SimulationConfig {
  games: number;
  chessAI: { white: ChessAI; black: ChessAI };
  cardAI: { white: CardAI; black: CardAI };
  searchDepth: number;
  speedMs: number;       // delay between moves in watch mode (0 = instant)
  maxMovesPerGame: number;
  seed?: number;
  cardConfig?: Partial<CardDefinition>[];
}

export interface SimulationResult {
  config: Omit<SimulationConfig, 'chessAI' | 'cardAI'>;
  games: GameResult[];
  stats: AggregatedStats;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}

export interface Histogram {
  buckets: number[];
  min: number;
  max: number;
  step: number;
}

export interface AggregatedStats {
  totalGames: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  winRates: { white: number; black: number; draw: number };
  avgGameLength: number;
  medianGameLength: number;
  avgCardsDrawnPerGame: number;
  avgCardsPlayedPerGame: number;
  cardUtilizationRate: number;
  perCard: Map<string, CardStats>;
}

export interface BalanceReport {
  overperforming: string[];
  underperforming: string[];
  situational: string[];
  catchUpEffective: boolean;
  recommendedAdjustments: string[];
}
