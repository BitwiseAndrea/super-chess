// tests/cards/deck.test.ts
import { describe, it, expect } from 'vitest';
import { Deck } from '../../src/cards/deck.ts';
import { CARD_DEFINITIONS } from '../../src/cards/definitions.ts';

const totalCopies = CARD_DEFINITIONS.reduce((s, d) => s + d.copies, 0);

describe('Deck', () => {
  it('starts with correct number of cards', () => {
    const deck = new Deck(CARD_DEFINITIONS);
    expect(deck.drawPileSize).toBe(totalCopies);
  });

  it('shuffles deterministically with seed', () => {
    const d1 = new Deck(CARD_DEFINITIONS);
    const d2 = new Deck(CARD_DEFINITIONS);
    d1.shuffle(42);
    d2.shuffle(42);
    expect(d1.getState().drawPile.map((c) => c.id)).toEqual(d2.getState().drawPile.map((c) => c.id));
  });

  it('draws a card and puts it in hand', () => {
    const deck = new Deck(CARD_DEFINITIONS);
    deck.shuffle();
    const card = deck.draw('w');
    expect(card).not.toBeNull();
    expect(deck.getHand('w').length).toBe(1);
    expect(deck.drawPileSize).toBe(totalCopies - 1);
  });

  it('respects maxHandSize of 2', () => {
    const deck = new Deck(CARD_DEFINITIONS);
    deck.shuffle();
    deck.draw('w');
    deck.draw('w');
    const third = deck.draw('w'); // should return null
    expect(third).toBeNull();
    expect(deck.handSize('w')).toBe(2);
  });

  it('discard moves card from hand to discard pile', () => {
    const deck = new Deck(CARD_DEFINITIONS);
    deck.shuffle();
    const card = deck.draw('w')!;
    deck.discard('w', card);
    expect(deck.handSize('w')).toBe(0);
    expect(deck.discardPileSize).toBe(1);
  });

  it('reshuffles discard when draw pile empty', () => {
    const deck = new Deck(CARD_DEFINITIONS);
    deck.shuffle();
    // Drain all cards to discard
    const drawn: ReturnType<typeof deck.draw>[] = [];
    while (deck.drawPileSize > 0) {
      drawn.push(deck.draw('w'));
      if (deck.handSize('w') === 2) {
        deck.discard('w', deck.getHand('w')[0]);
      }
    }
    // Force reshuffle
    deck.reshuffleDiscard();
    expect(deck.drawPileSize).toBeGreaterThan(0);
  });
});

describe('CARD_DEFINITIONS', () => {
  it('has at least 19 cards', () => {
    expect(CARD_DEFINITIONS.length).toBeGreaterThanOrEqual(19);
  });

  it('all cards have required fields', () => {
    for (const def of CARD_DEFINITIONS) {
      expect(def.name).toBeTruthy();
      expect(def.rarity).toMatch(/^(common|uncommon|rare)$/);
      expect(def.copies).toBeGreaterThan(0);
      expect(def.rulesText).toBeTruthy();
    }
  });
});
