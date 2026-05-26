// src/cards/types.ts
export type CardRarity = 'common' | 'uncommon' | 'rare';
export type CardCategory = 'movement' | 'disruption' | 'defense' | 'power' | 'chaos';

export interface CardDefinition {
  name: string;
  rarity: CardRarity;
  category: CardCategory;
  copies: number;
  emoji: string;
  shortDesc: string;
  rulesText: string;
  requiresTarget: boolean;
  targetType?: 'square' | 'ownPiece' | 'oppPiece' | 'pieceType' | 'pawn';
}

export interface CardInstance {
  id: string; // e.g. "Freeze_0", "Freeze_1"
  definition: CardDefinition;
}

export interface Hand {
  white: CardInstance[];
  black: CardInstance[];
}

export interface DeckState {
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  hand: Hand;
}
