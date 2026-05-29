// tests/data/superChessData.test.ts
// Sanity checks for the canonical data file at `public/super-chess.json`.
// If you edit the JSON, these tests catch shape mistakes (missing fields,
// wrong PST lengths, duplicate card names, etc.) before they reach the engine.
import { describe, it, expect } from 'vitest';
import {
  SUPER_CHESS_DATA,
  CARD_DEFINITIONS,
  PIECE_VALUES,
  PIECE_SQUARE_TABLES,
} from '../../src/data/superChessData.ts';

const PIECE_TYPES = ['P', 'N', 'B', 'R', 'Q', 'K'] as const;
const VALID_RARITIES = new Set(['common', 'uncommon', 'rare']);
// 'default' is the curated beginner pool added when we introduced the
// new-game card-pool picker. The other categories are thematic groupings
// of the remaining advanced cards.
const VALID_CATEGORIES = new Set(['default', 'movement', 'disruption', 'defense', 'power', 'chaos']);
const VALID_TARGET_TYPES = new Set(['square', 'ownPiece', 'oppPiece', 'pieceType', 'pawn']);

describe('super-chess.json', () => {
  it('has a version', () => {
    expect(typeof SUPER_CHESS_DATA.version).toBe('string');
    expect(SUPER_CHESS_DATA.version.length).toBeGreaterThan(0);
  });

  it('has piece values for every piece type', () => {
    for (const t of PIECE_TYPES) {
      expect(typeof PIECE_VALUES[t]).toBe('number');
      expect(PIECE_VALUES[t]).toBeGreaterThan(0);
    }
  });

  it('has 64-square piece-square tables for every piece type', () => {
    for (const t of PIECE_TYPES) {
      const table = PIECE_SQUARE_TABLES[t];
      expect(table).toBeDefined();
      expect(table.length).toBe(64);
      expect(table.every((v) => typeof v === 'number')).toBe(true);
    }
  });

  it('has the expected rules section', () => {
    const { maxHandSize, maxMovesPerGame } = SUPER_CHESS_DATA.rules;
    expect(maxHandSize).toBeGreaterThan(0);
    expect(maxMovesPerGame).toBeGreaterThan(0);
  });

  it('has 22 cards (20 original + Pawn Retreat + Sidestep)', () => {
    expect(CARD_DEFINITIONS.length).toBe(22);
  });

  it('the default beginner pool contains exactly 6 simple cards', () => {
    const defaults = CARD_DEFINITIONS.filter((c) => c.category === 'default');
    expect(defaults.map((c) => c.name).sort()).toEqual([
      'Double Step',
      'Foul Ground',
      'Freeze',
      'Pawn Retreat',
      'Shield',
      'Sidestep',
    ]);
  });

  it('every card declares a duration label for the UI badge', () => {
    for (const c of CARD_DEFINITIONS) {
      expect(typeof c.duration).toBe('string');
      expect((c.duration as string).length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate card names', () => {
    const names = CARD_DEFINITIONS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every card has valid rarity, category, and (when present) targetType', () => {
    for (const card of CARD_DEFINITIONS) {
      expect(VALID_RARITIES.has(card.rarity)).toBe(true);
      expect(VALID_CATEGORIES.has(card.category)).toBe(true);
      expect(card.copies).toBeGreaterThan(0);
      expect(card.copies).toBeLessThanOrEqual(5);
      expect(typeof card.name).toBe('string');
      expect(typeof card.emoji).toBe('string');
      expect(typeof card.shortDesc).toBe('string');
      expect(typeof card.rulesText).toBe('string');
      expect(typeof card.requiresTarget).toBe('boolean');
      if (card.requiresTarget) {
        expect(card.targetType).toBeDefined();
        expect(VALID_TARGET_TYPES.has(card.targetType as string)).toBe(true);
      }
    }
  });

  it('the deck has enough cards for a full game (>=40)', () => {
    const total = CARD_DEFINITIONS.reduce((acc, c) => acc + c.copies, 0);
    expect(total).toBeGreaterThanOrEqual(40);
  });

  it('rare cards never have more than 1 copy', () => {
    for (const c of CARD_DEFINITIONS) {
      if (c.rarity === 'rare') {
        expect(c.copies).toBe(1);
      }
    }
  });
});
