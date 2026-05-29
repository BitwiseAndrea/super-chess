// src/cards/definitions.ts
// Thin re-export wrapper around `public/super-chess.json` (the single source of
// truth shared with the Roblox port). To change card text/rarities/copies,
// edit `public/super-chess.json` and re-run `pnpm cards:sync` to regenerate the
// Luau fallback snapshot.
import type { CardDefinition, CardCategory } from './types.ts';
import { CARD_DEFINITIONS as DATA_CARDS } from '../data/superChessData.ts';

export const CARD_DEFINITIONS: CardDefinition[] = DATA_CARDS;

/** UI metadata for the "card pool" picker on the new-game screen. Order
 * here is also the display order: `default` always comes first since it's
 * the curated beginner pool. Update this when adding a new category. */
export interface CardPoolGroup {
  id: CardCategory;
  label: string;
  blurb: string;
  /** Set true for groups that should be on by default for new players. */
  defaultEnabled: boolean;
}

export const CARD_POOL_GROUPS: CardPoolGroup[] = [
  {
    id: 'default',
    label: 'default',
    blurb: 'simple, fast, low-mental-overhead. start here.',
    defaultEnabled: true,
  },
  {
    id: 'movement',
    label: 'movement',
    blurb: 'extra ways to push pieces around (teleport, ghost step, swap, etc.).',
    defaultEnabled: false,
  },
  {
    id: 'disruption',
    label: 'disruption',
    blurb: 'screw with your opponent\u2019s plans (disrupt, fog).',
    defaultEnabled: false,
  },
  {
    id: 'defense',
    label: 'defense',
    blurb: 'protective cards. (currently empty \u2014 reserved for future.)',
    defaultEnabled: false,
  },
  {
    id: 'power',
    label: 'power',
    blurb: 'big swings: capture-by-fiat, resurrect lost pieces.',
    defaultEnabled: false,
  },
  {
    id: 'chaos',
    label: 'chaos',
    blurb: 'wild, hard-to-predict effects (mirror, trade, time warp).',
    defaultEnabled: false,
  },
];

/** Build a deck. By default returns ALL cards (current/legacy behavior).
 *
 * Pass `categories` to restrict the deck to one or more pools — used by the
 * new-game card-pool picker so players can start with just the simple
 * "default" set and opt into more cards over time. An empty / undefined
 * categories list falls back to returning everything.
 *
 * Per-card overrides (rarity / copies / etc.) are merged in on top of the
 * filtered set; the override only applies if the named card survived the
 * category filter.
 */
export function buildDeck(
  overridesOrCategories: Partial<CardDefinition>[] | { categories?: CardCategory[]; overrides?: Partial<CardDefinition>[] } = [],
): CardDefinition[] {
  // Backwards-compatible shape: a bare array is treated as overrides.
  const opts = Array.isArray(overridesOrCategories)
    ? { overrides: overridesOrCategories }
    : overridesOrCategories;
  const overrides = opts.overrides ?? [];
  const categories = opts.categories;

  const base = categories && categories.length > 0
    ? CARD_DEFINITIONS.filter((c) => categories.includes(c.category))
    : [...CARD_DEFINITIONS];

  if (overrides.length === 0) return base;
  return base.map((def) => {
    const override = overrides.find((o) => o.name === def.name);
    return override ? { ...def, ...override } : def;
  });
}

/** Resolve the play phase of a card definition. Cards loaded via the
 * superChessData enricher always have `phase` set, but a few synthetic
 * test fixtures construct CardDefinitions inline without it; this helper
 * gives those a sane default so they don't NPE the gating logic. */
export function cardPhase(def: CardDefinition): 'pre' | 'instead' | 'post' {
  if (def.phase) return def.phase;
  if (def.consumesTurn) return 'instead';
  return 'pre';
}
