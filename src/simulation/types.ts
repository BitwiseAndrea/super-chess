// src/simulation/types.ts
import type { ChessAI, CardAI } from '../ai/types.ts';
import type { CardDefinition } from '../cards/types.ts';
import type { GameResult, CardStats } from '../game/types.ts';

/** Card-draw rules. Defaults preserve the original behaviour; override
 * to A/B-test alternative pacing (e.g. "give black a starting card to
 * compensate for moving second"). */
export interface DrawRules {
  /** Cards each color is dealt at the start of the game, BEFORE any
   * moves are played. Capped per side at maxHandSize. */
  startingHand: { white: number; black: number };
  /** When true, white's first capture-triggered draw is skipped to
   * compensate for first-move advantage. The original behaviour. */
  whiteFirstDrawSkip: boolean;
}

export const DEFAULT_DRAW_RULES: DrawRules = {
  // Variant 6 (chosen 2026-05-28): both colors open with one card in
  // hand and white DOES get a card on their first capture (no skip).
  // Sim showed this trades a few percent of color balance for far
  // fewer drawn games and noticeably more card action — playable
  // games feel much less like "just chess" with this default.
  startingHand: { white: 1, black: 1 },
  whiteFirstDrawSkip: false,
};

export interface SimulationConfig {
  games: number;
  chessAI: { white: ChessAI; black: ChessAI };
  cardAI: { white: CardAI; black: CardAI };
  searchDepth: number;
  speedMs: number;       // delay between moves in watch mode (0 = instant)
  maxMovesPerGame: number;
  seed?: number;
  cardConfig?: Partial<CardDefinition>[];
  /** Optional override for card-draw pacing rules. */
  drawRules?: DrawRules;
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
