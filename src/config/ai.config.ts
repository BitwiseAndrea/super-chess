// src/config/ai.config.ts
export type ChessBackend = 'minimax' | 'stockfish';
export type CardBackend = 'heuristic' | 'claude';

export interface AIConfig {
  chess: { white: ChessBackend; black: ChessBackend };
  card: { white: CardBackend; black: CardBackend };
  minimaxDepth: number;
  stockfishSkill: number;
  stockfishThinkMs: number;
  claudeApiKey?: string;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  chess: { white: 'minimax', black: 'minimax' },
  card: { white: 'heuristic', black: 'heuristic' },
  minimaxDepth: 2,
  stockfishSkill: 10,
  stockfishThinkMs: 100,
  claudeApiKey: undefined,
};
