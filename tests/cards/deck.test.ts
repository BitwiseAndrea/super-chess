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

  it('respects the default maxHandSize from JSON', () => {
    const deck = new Deck(CARD_DEFINITIONS);
    deck.shuffle();
    const max = deck.maxHandSize;
    for (let i = 0; i < max; i++) deck.draw('w');
    const overflow = deck.draw('w'); // should return null
    expect(overflow).toBeNull();
    expect(deck.handSize('w')).toBe(max);
  });

  it('honors a custom maxHandSize override', () => {
    const deck = new Deck(CARD_DEFINITIONS, { maxHandSize: 5 });
    deck.shuffle();
    expect(deck.maxHandSize).toBe(5);
    for (let i = 0; i < 5; i++) deck.draw('w');
    expect(deck.handSize('w')).toBe(5);
    expect(deck.draw('w')).toBeNull();
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
      if (deck.handSize('w') === deck.maxHandSize) {
        deck.discard('w', deck.getHand('w')[0]);
      }
    }
    // Force reshuffle
    deck.reshuffleDiscard();
    expect(deck.drawPileSize).toBeGreaterThan(0);
  });
});

// Peek-and-choose primitives used by the hand-full "draft" flow.
//   forceDraw() — pops next card, does NOT add to hand, ignores maxHandSize.
//   addToHand() — adds a card directly to a hand, no size check.
//   sendToDiscard() — pushes a card directly to discard pile.
//
// The combination supports: peek → ask user → (a) swap, or (b) reject.
describe('Deck.forceDraw / addToHand / sendToDiscard', () => {
  it('forceDraw pops a card and does NOT add it to any hand', () => {
    const deck = new Deck(CARD_DEFINITIONS);
    deck.shuffle(99);
    const before = deck.drawPileSize;
    const card = deck.forceDraw();
    expect(card).not.toBeNull();
    expect(deck.drawPileSize).toBe(before - 1);
    expect(deck.handSize('w')).toBe(0);
    expect(deck.handSize('b')).toBe(0);
    expect(deck.discardPileSize).toBe(0);
  });

  it('forceDraw bypasses maxHandSize (caller is responsible)', () => {
    const deck = new Deck(CARD_DEFINITIONS);
    deck.shuffle(7);
    deck.draw('w');
    deck.draw('w');
    expect(deck.handSize('w')).toBe(2);
    // Even with a full hand, forceDraw still gives us a card.
    const card = deck.forceDraw();
    expect(card).not.toBeNull();
    // Hand size is unchanged — forceDraw doesn't touch hands.
    expect(deck.handSize('w')).toBe(2);
  });

  it('forceDraw reshuffles the discard pile when empty', () => {
    const deck = new Deck(CARD_DEFINITIONS);
    deck.shuffle(13);
    // Send a few cards to discard.
    deck.draw('w');
    const c = deck.getHand('w')[0];
    deck.discard('w', c);
    // Drain the draw pile by repeatedly forceDrawing into discard.
    while (deck.drawPileSize > 0) {
      const x = deck.forceDraw();
      if (x) deck.sendToDiscard(x);
    }
    expect(deck.drawPileSize).toBe(0);
    expect(deck.discardPileSize).toBeGreaterThan(0);
    // Next forceDraw should trigger a reshuffle from discard.
    const after = deck.forceDraw();
    expect(after).not.toBeNull();
  });

  it('addToHand puts a card directly into the named hand', () => {
    const deck = new Deck(CARD_DEFINITIONS);
    deck.shuffle(1);
    const peeked = deck.forceDraw()!;
    deck.addToHand('b', peeked);
    expect(deck.handSize('b')).toBe(1);
    expect(deck.getHand('b')[0].id).toBe(peeked.id);
  });

  it('sendToDiscard pushes to the discard pile without touching hands', () => {
    const deck = new Deck(CARD_DEFINITIONS);
    deck.shuffle(2);
    const peeked = deck.forceDraw()!;
    deck.sendToDiscard(peeked);
    expect(deck.discardPileSize).toBe(1);
    expect(deck.handSize('w')).toBe(0);
  });

  it('full swap flow: peek → discard from hand → add peek (net hand size stable)', () => {
    const deck = new Deck(CARD_DEFINITIONS);
    deck.shuffle(123);
    deck.draw('w');
    deck.draw('w');
    expect(deck.handSize('w')).toBe(2);

    const peeked = deck.forceDraw()!;
    const existing = [...deck.getHand('w')];
    const toDiscard = existing[0];
    deck.discard('w', toDiscard);
    deck.addToHand('w', peeked);

    expect(deck.handSize('w')).toBe(2);
    expect(deck.getHand('w').map((c) => c.id)).toContain(peeked.id);
    expect(deck.getHand('w').map((c) => c.id)).not.toContain(toDiscard.id);
    // Discarded card is in the discard pile.
    expect(deck.getState().discardPile.map((c) => c.id)).toContain(toDiscard.id);
  });

  it('reject flow: peek then sendToDiscard leaves hand untouched', () => {
    const deck = new Deck(CARD_DEFINITIONS);
    deck.shuffle(321);
    deck.draw('w');
    deck.draw('w');
    const handBefore = deck.getHand('w').map((c) => c.id);

    const peeked = deck.forceDraw()!;
    deck.sendToDiscard(peeked);

    expect(deck.handSize('w')).toBe(2);
    expect(deck.getHand('w').map((c) => c.id)).toEqual(handBefore);
    expect(deck.getState().discardPile.map((c) => c.id)).toContain(peeked.id);
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
