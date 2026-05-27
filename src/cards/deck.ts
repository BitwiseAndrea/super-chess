// src/cards/deck.ts
import type { PieceColor } from '../engine/types.ts';
import type { CardDefinition, CardInstance, DeckState } from './types.ts';

export class Deck {
  private drawPile: CardInstance[] = [];
  private discardPile: CardInstance[] = [];
  readonly hands: { white: CardInstance[]; black: CardInstance[] } = { white: [], black: [] };
  readonly maxHandSize = 2;

  constructor(definitions: CardDefinition[]) {
    let idx = 0;
    for (const def of definitions) {
      for (let i = 0; i < def.copies; i++) {
        this.drawPile.push({ id: `${def.name}_${idx++}`, definition: def });
      }
    }
  }

  shuffle(seed?: number): void {
    // Fisher-Yates with optional seeded LCG
    let rng: () => number;
    if (seed !== undefined) {
      let s = seed;
      rng = () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0x100000000;
      };
    } else {
      rng = Math.random;
    }

    const arr = this.drawPile;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  draw(color: PieceColor): CardInstance | null {
    const hand = color === 'w' ? this.hands.white : this.hands.black;
    if (hand.length >= this.maxHandSize) return null;

    if (this.drawPile.length === 0) {
      if (this.discardPile.length === 0) return null;
      this.reshuffleDiscard();
    }

    const card = this.drawPile.pop()!;
    hand.push(card);
    return card;
  }

  /** Pop the top card off the draw pile (reshuffling the discard pile if
   * the draw pile is empty). Does NOT add it to any hand and DOES NOT
   * respect maxHandSize — the caller decides what to do with the result.
   *
   * Use this for "peek-and-choose" flows where the player gets to look at
   * the next card and pick which card to discard from a full hand. */
  forceDraw(): CardInstance | null {
    if (this.drawPile.length === 0) {
      if (this.discardPile.length === 0) return null;
      this.reshuffleDiscard();
    }
    return this.drawPile.pop() ?? null;
  }

  /** Add a card directly into a hand, bypassing maxHandSize. The caller is
   * responsible for ensuring the hand isn't over-large afterwards (e.g. by
   * having just discarded another card). Used to complete a peek-and-swap. */
  addToHand(color: PieceColor, card: CardInstance): void {
    const hand = color === 'w' ? this.hands.white : this.hands.black;
    hand.push(card);
  }

  /** Push a card directly to the discard pile. Used when the player rejects
   * a peeked card (or when the bot's heuristic decides not to swap). */
  sendToDiscard(card: CardInstance): void {
    this.discardPile.push(card);
  }

  discard(color: PieceColor, card: CardInstance): void {
    const hand = color === 'w' ? this.hands.white : this.hands.black;
    const idx = hand.findIndex((c) => c.id === card.id);
    if (idx !== -1) {
      hand.splice(idx, 1);
      this.discardPile.push(card);
    }
  }

  play(color: PieceColor, card: CardInstance): void {
    this.discard(color, card);
  }

  returnToHand(color: PieceColor, card: CardInstance): void {
    const hand = color === 'w' ? this.hands.white : this.hands.black;
    if (!hand.some((c) => c.id === card.id)) {
      hand.push(card);
    }
  }

  reshuffleDiscard(): void {
    this.drawPile.push(...this.discardPile);
    this.discardPile = [];
    this.shuffle();
  }

  handSize(color: PieceColor): number {
    return (color === 'w' ? this.hands.white : this.hands.black).length;
  }

  getHand(color: PieceColor): CardInstance[] {
    return color === 'w' ? this.hands.white : this.hands.black;
  }

  get drawPileSize(): number { return this.drawPile.length; }
  get discardPileSize(): number { return this.discardPile.length; }

  getState(): DeckState {
    return {
      drawPile: [...this.drawPile],
      discardPile: [...this.discardPile],
      hand: {
        white: [...this.hands.white],
        black: [...this.hands.black],
      },
    };
  }
}
