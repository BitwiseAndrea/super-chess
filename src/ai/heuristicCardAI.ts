// src/ai/heuristicCardAI.ts
import type { PieceColor } from '../engine/types.ts';
import type { SuperChessState } from '../game/types.ts';
import type { CardInstance } from '../cards/types.ts';
import type { CardAI, CardAIDecision } from './types.ts';
import { scoreCard, PLAY_THRESHOLD } from '../cards/cardAI.ts';

export class HeuristicCardAI implements CardAI {
  name = 'Heuristic';

  async decide(
    state: SuperChessState,
    color: PieceColor,
    hand: CardInstance[],
  ): Promise<CardAIDecision> {
    if (hand.length === 0) return { shouldPlay: false };

    let bestScore = -Infinity;
    let bestCard: CardInstance | undefined;
    let bestTarget = {};

    for (const card of hand) {
      const { score, target } = scoreCard(card, state, color);
      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
        bestTarget = target;
      }
    }

    if (!bestCard || bestScore < PLAY_THRESHOLD) {
      return { shouldPlay: false };
    }

    return {
      shouldPlay: true,
      card: bestCard,
      target: bestTarget,
      reasoning: `Heuristic score ${bestScore.toFixed(0)} for ${bestCard.definition.name}`,
    };
  }
}
