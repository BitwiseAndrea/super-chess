// src/ai/types.ts
import type { PieceColor, Move } from '../engine/types.ts';
import type { SuperChessState, CardTarget } from '../game/types.ts';
import type { CardInstance } from '../cards/types.ts';

export interface ChessAI {
  name: string;
  selectMove(state: SuperChessState, color: PieceColor): Promise<Move>;
  setDepth?(depth: number): void;
}

export interface CardAIDecision {
  shouldPlay: boolean;
  card?: CardInstance;
  target?: CardTarget;
  reasoning?: string;
}

export interface CardAI {
  name: string;
  decide(
    state: SuperChessState,
    color: PieceColor,
    hand: CardInstance[],
  ): Promise<CardAIDecision>;
}
