// src/cards/types.ts
export type CardRarity = 'common' | 'uncommon' | 'rare';
// `default` is the curated beginner set — a small, easy-to-understand pool of
// cards (Freeze, Shield, Foul Ground, Pawn Retreat, Double Step, Sidestep).
// The other categories are thematic groupings of the more advanced cards.
// Players opt into extra categories on the new-game setup screen; the deck
// is built by filtering CARD_DEFINITIONS by the enabled set.
export type CardCategory =
  | 'default'
  | 'movement'
  | 'disruption'
  | 'defense'
  | 'power'
  | 'chaos';

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
  /** If true, playing this card IS the player's entire turn — the chess-move
   * phase is skipped. (Pawn Storm, Mirror.) */
  consumesTurn?: boolean;
  /** Which card-play phase this card is eligible for. Defaults are derived
   * from `consumesTurn` and the legacy "defensive set" (Shield, Freeze, Foul
   * Ground) when the JSON omits it, so existing data files don't need to be
   * updated en masse:
   *   - 'pre'     \u2013 played BEFORE your chess move. Move-modifiers, deck
   *                 manipulation, "next turn" disrupters. The default for
   *                 most cards. The card's effect typically sets per-turn
   *                 flags that `tickSuperState` would clear if the card
   *                 were played after the move.
   *   - 'instead' \u2013 the card IS the move. consumesTurn cards always map
   *                 here: Pawn Retreat, Sidestep, Teleport, Swap, Trade,
   *                 Pawn Storm, Mirror, Resurrect.
   *   - 'post'    \u2013 played AFTER your chess move, before the turn ends.
   *                 Defensive state-setters whose protection should
   *                 survive into the opponent's reply: Shield, Freeze,
   *                 Foul Ground.
   *
   * The play-phase gate is enforced both in the UI (ineligible cards are
   * dimmed with a tooltip) and in the controller (handleCardClick refuses
   * mismatched phases). */
  phase?: 'pre' | 'instead' | 'post';
  /** Short badge label describing how long the effect lingers. Shown as a
   * chip on the in-hand card UI so the player can scan at a glance. Common
   * values: 'instant' (applied and done), 'opp turn' (active during the
   * opponent's next turn), 'your turn' (active during your current/next
   * chess move), '2 turns', 'until moved' (Shield-style), etc. */
  duration?: string;
  /** True iff the card can directly capture or remove an opponent piece
   * (Coup, Mirror-when-it-mirrors-a-capture, or knight-like moves on a
   * non-empty square). Rendered as a chip on the card UI so the player
   * knows whether to expect material change. */
  capture?: boolean;
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
