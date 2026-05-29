// tests/cards/definitions.test.ts
// Unit tests for the deck-builder filtering behaviour and the pool group
// metadata table consumed by the new-game card-pool picker.

import { describe, it, expect } from 'vitest';
import {
  CARD_DEFINITIONS,
  CARD_POOL_GROUPS,
  buildDeck,
} from '../../src/cards/definitions.ts';
import type { CardCategory } from '../../src/cards/types.ts';

describe('buildDeck()', () => {
  it('returns every card definition when called with no args', () => {
    const deck = buildDeck();
    expect(deck.length).toBe(CARD_DEFINITIONS.length);
  });

  it('returns every card when given an empty overrides array (legacy shape)', () => {
    // Older call-sites (simulate mode) passed `[]` for overrides. The new
    // shape accepts either an overrides array or an options object — both
    // must continue to work.
    const deck = buildDeck([]);
    expect(deck.length).toBe(CARD_DEFINITIONS.length);
  });

  it('filters the deck to a single category', () => {
    const deck = buildDeck({ categories: ['default'] });
    expect(deck.length).toBeGreaterThan(0);
    for (const card of deck) {
      expect(card.category).toBe('default');
    }
  });

  it('filters the deck to a union of categories', () => {
    const cats: CardCategory[] = ['default', 'power'];
    const deck = buildDeck({ categories: cats });
    const expected = CARD_DEFINITIONS.filter((c) => cats.includes(c.category)).length;
    expect(deck.length).toBe(expected);
    for (const card of deck) {
      expect(cats).toContain(card.category);
    }
  });

  it('returns all cards when `categories` is an empty array (defensive)', () => {
    // An empty enabled-categories list shouldn't accidentally produce an
    // empty deck — that would make the game unplayable. The current
    // behaviour is to fall back to the full deck.
    const deck = buildDeck({ categories: [] });
    expect(deck.length).toBe(CARD_DEFINITIONS.length);
  });

  it('applies per-card overrides on top of the category filter', () => {
    const deck = buildDeck({
      categories: ['default'],
      overrides: [{ name: 'Freeze', copies: 99 }],
    });
    const freeze = deck.find((c) => c.name === 'Freeze');
    expect(freeze).toBeDefined();
    expect(freeze!.copies).toBe(99);
    // Overrides don't reintroduce filtered-out cards.
    expect(deck.find((c) => c.name === 'Time Warp')).toBeUndefined();
  });

  it('honors a copies-zero override (the "exclude this card" shape)', () => {
    // The per-card UI in newGamePanel models "exclude" by setting copies to
    // 0 \u2014 buildDeck should pass that through faithfully so the controller
    // can drop the card before constructing the Deck.
    const deck = buildDeck({
      categories: ['default'],
      overrides: [{ name: 'Freeze', copies: 0 }],
    });
    const freeze = deck.find((c) => c.name === 'Freeze');
    expect(freeze).toBeDefined();
    expect(freeze!.copies).toBe(0);
  });
});

describe('CARD_POOL_GROUPS', () => {
  it('lists every category that has at least one card', () => {
    const usedCategories = new Set(CARD_DEFINITIONS.map((c) => c.category));
    const groupIds = new Set(CARD_POOL_GROUPS.map((g) => g.id));
    for (const cat of usedCategories) {
      expect(groupIds.has(cat)).toBe(true);
    }
  });

  it('puts "default" first so it leads the picker', () => {
    expect(CARD_POOL_GROUPS[0].id).toBe('default');
  });

  it('marks only "default" as on-by-default (the simple beginner experience)', () => {
    const onByDefault = CARD_POOL_GROUPS.filter((g) => g.defaultEnabled).map((g) => g.id);
    expect(onByDefault).toEqual(['default']);
  });
});

describe('cardPhase()', () => {
  // The phase model splits a turn into pre-move (offensive / move-modifier),
  // instead-of-move (turn-consuming), and post-move (defensive). The deck
  // loader auto-derives `phase` for cards that don't declare one in JSON,
  // so this test locks that derivation in. Concrete cards are sampled
  // because the user's defensive set is short and explicit.
  const byName = new Map(CARD_DEFINITIONS.map((c) => [c.name, c] as const));

  it('classifies Shield, Freeze, and Foul Ground as post (defensive)', () => {
    const defensive = ['Shield', 'Freeze', 'Foul Ground'];
    for (const name of defensive) {
      const def = byName.get(name);
      expect(def, `missing card ${name}`).toBeDefined();
      expect(def!.phase).toBe('post');
    }
  });

  it('classifies consumesTurn cards as instead', () => {
    for (const card of CARD_DEFINITIONS) {
      if (card.consumesTurn) {
        expect(card.phase, `${card.name} should be 'instead'`).toBe('instead');
      }
    }
  });

  it('classifies non-defensive non-consumesTurn cards as pre', () => {
    const defensiveSet = new Set(['Shield', 'Freeze', 'Foul Ground']);
    for (const card of CARD_DEFINITIONS) {
      if (card.consumesTurn) continue;
      if (defensiveSet.has(card.name)) continue;
      expect(card.phase, `${card.name} should be 'pre'`).toBe('pre');
    }
  });

  it('every card has a resolved phase (no undefined leak through the loader)', () => {
    for (const card of CARD_DEFINITIONS) {
      expect(card.phase, `${card.name} has no phase`).toBeDefined();
      expect(['pre', 'instead', 'post']).toContain(card.phase);
    }
  });
});
