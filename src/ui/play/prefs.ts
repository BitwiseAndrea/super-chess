// src/ui/play/prefs.ts
// Tiny localStorage wrapper for play-mode UI preferences. Safe in private
// browsing / disabled-storage contexts (everything degrades to defaults).

import type { ThemeMode } from '../theme.ts';
import type { CardCategory } from '../../cards/types.ts';

const KEY_OPEN_HAND = 'sc:openOpponentHand';
const KEY_THEME_MODE = 'sc:themeMode';
const KEY_PILOT_OPENING = 'sc:pilotOpeningId';
const KEY_ENABLED_CATEGORIES = 'sc:enabledCategories';
const KEY_MAX_HAND_SIZE = 'sc:maxHandSize';
const KEY_CARD_OVERRIDES = 'sc:cardOverrides';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore — private browsing, quota, etc.
  }
}

export function getOpenOpponentHandPref(): boolean {
  return safeGet(KEY_OPEN_HAND) === '1';
}

export function setOpenOpponentHandPref(value: boolean): void {
  safeSet(KEY_OPEN_HAND, value ? '1' : '0');
}

export function getThemeModePref(): ThemeMode | null {
  const v = safeGet(KEY_THEME_MODE);
  return v === 'light' || v === 'dark' ? v : null;
}

export function setThemeModePref(mode: ThemeMode): void {
  safeSet(KEY_THEME_MODE, mode);
}

/** Returns null for "no pilot", a non-empty string for the chosen opening id. */
export function getPilotOpeningPref(): string | null {
  const v = safeGet(KEY_PILOT_OPENING);
  return v && v.length > 0 ? v : null;
}

export function setPilotOpeningPref(id: string | null): void {
  safeSet(KEY_PILOT_OPENING, id ?? '');
}

/** Persisted set of enabled card-pool categories. Returns null when the
 * user has never set this — the new-game panel then falls back to the
 * defaults defined in CARD_POOL_GROUPS (today: just "default"). */
const VALID_CATEGORY_VALUES: ReadonlySet<string> = new Set<CardCategory>([
  'default', 'movement', 'disruption', 'defense', 'power', 'chaos',
]);

export function getEnabledCategoriesPref(): CardCategory[] | null {
  const v = safeGet(KEY_ENABLED_CATEGORIES);
  if (!v) return null;
  // CSV form: "default,movement". Keep it simple — no JSON parsing, no
  // structured failure modes. Drop anything that doesn't match a known
  // category (forwards-compatible if a future build removes a category).
  const parts = v.split(',').map((p) => p.trim()).filter((p) => VALID_CATEGORY_VALUES.has(p));
  return parts.length > 0 ? (parts as CardCategory[]) : null;
}

export function setEnabledCategoriesPref(cats: CardCategory[]): void {
  safeSet(KEY_ENABLED_CATEGORIES, cats.join(','));
}

/** Persisted hand-size preference. Range 2\u20135. Falls back to the JSON
 * default (3) when unset or out of range. */
export const HAND_SIZE_MIN = 2;
export const HAND_SIZE_MAX = 5;
export const HAND_SIZE_DEFAULT = 3;

export function getMaxHandSizePref(): number {
  const v = safeGet(KEY_MAX_HAND_SIZE);
  if (!v) return HAND_SIZE_DEFAULT;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < HAND_SIZE_MIN || n > HAND_SIZE_MAX) return HAND_SIZE_DEFAULT;
  return n;
}

export function setMaxHandSizePref(n: number): void {
  safeSet(KEY_MAX_HAND_SIZE, String(n));
}

/** Persisted per-card copies overrides. Sparse map keyed by card name; only
 * cards whose count differs from the JSON default are stored. A value of 0
 * means "exclude this card from the deck". The new-game panel exposes a
 * stepper (0\u2013CARD_OVERRIDE_MAX) per card and a reset link.
 *
 * Storage shape: JSON object `{ "Pawn Retreat": 0, "Freeze": 4 }`. We use
 * JSON instead of CSV because the values are numeric and entries can have
 * arbitrary names. Read failures (missing key, malformed JSON, non-object
 * payload, non-integer values) all silently degrade to the empty map. */
export const CARD_OVERRIDE_MIN = 0;
export const CARD_OVERRIDE_MAX = 5;

export function getCardOverridesPref(): Record<string, number> {
  const v = safeGet(KEY_CARD_OVERRIDES);
  if (!v) return {};
  try {
    const parsed = JSON.parse(v);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [name, raw] of Object.entries(parsed)) {
      if (typeof raw !== 'number' || !Number.isInteger(raw)) continue;
      if (raw < CARD_OVERRIDE_MIN || raw > CARD_OVERRIDE_MAX) continue;
      out[name] = raw;
    }
    return out;
  } catch {
    return {};
  }
}

export function setCardOverridesPref(overrides: Record<string, number>): void {
  // Skip empty maps so we don't litter localStorage with `{}`.
  if (Object.keys(overrides).length === 0) {
    try { localStorage.removeItem(KEY_CARD_OVERRIDES); } catch { /* ignore */ }
    return;
  }
  try {
    safeSet(KEY_CARD_OVERRIDES, JSON.stringify(overrides));
  } catch {
    // ignore
  }
}

export function clearCardOverridesPref(): void {
  try { localStorage.removeItem(KEY_CARD_OVERRIDES); } catch { /* ignore */ }
}
