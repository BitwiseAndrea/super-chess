// src/config/cards.config.ts
// Override card definitions without touching engine code.
// Import and pass to buildDeck() to change balance.
import type { CardDefinition } from '../cards/types.ts';

// Example overrides — uncomment and modify to rebalance:
export const CARD_OVERRIDES: Partial<CardDefinition>[] = [
  // { name: 'Coup', copies: 0 },           // disable Coup
  // { name: 'Extra Move', copies: 1 },     // nerf Extra Move to 1 copy
  // { name: 'Freeze', copies: 4 },         // buff Freeze to 4 copies
];
