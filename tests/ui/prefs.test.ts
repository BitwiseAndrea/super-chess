// tests/ui/prefs.test.ts
// Unit tests for the localStorage-backed UI preferences helpers, with a
// focus on the new per-card copies overrides (the new-game card-pool
// accordion). Tests run under the default `node` environment (no jsdom),
// so we install a minimal in-memory localStorage shim on globalThis.

import { afterEach, beforeEach, describe, it, expect } from 'vitest';

// Map-backed Storage stub. Only the methods prefs.ts actually calls are
// implemented; everything else throws a recognisable "use the helper"
// error to keep us honest.
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
  clear(): void { this.map.clear(); }
  get length(): number { return this.map.size; }
  key(_n: number): string | null { return null; }
}

let store: MemoryStorage;
let originalLocalStorage: unknown;

beforeEach(() => {
  store = new MemoryStorage();
  // Save whatever was there (likely undefined) and replace with our stub.
  originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: originalLocalStorage,
    configurable: true,
    writable: true,
  });
});

// Import lazily so the stub is in place when the module evaluates anything
// at top level. (None of these helpers touch localStorage at import time
// today, but doing this keeps the test resilient to future module-level
// reads.)
async function loadPrefs() {
  return import('../../src/ui/play/prefs.ts');
}

describe('getCardOverridesPref / setCardOverridesPref', () => {
  it('returns an empty map when nothing is persisted', async () => {
    const prefs = await loadPrefs();
    expect(prefs.getCardOverridesPref()).toEqual({});
  });

  it('round-trips a non-empty map', async () => {
    const prefs = await loadPrefs();
    prefs.setCardOverridesPref({ 'Pawn Retreat': 0, Freeze: 5 });
    expect(prefs.getCardOverridesPref()).toEqual({ 'Pawn Retreat': 0, Freeze: 5 });
  });

  it('removes the key when persisting an empty map', async () => {
    const prefs = await loadPrefs();
    prefs.setCardOverridesPref({ Freeze: 4 });
    prefs.setCardOverridesPref({});
    expect(prefs.getCardOverridesPref()).toEqual({});
    expect(store.getItem('sc:cardOverrides')).toBeNull();
  });

  it('clearCardOverridesPref deletes the key', async () => {
    const prefs = await loadPrefs();
    prefs.setCardOverridesPref({ Freeze: 2 });
    prefs.clearCardOverridesPref();
    expect(prefs.getCardOverridesPref()).toEqual({});
    expect(store.getItem('sc:cardOverrides')).toBeNull();
  });

  it('drops out-of-range values silently', async () => {
    const prefs = await loadPrefs();
    store.setItem('sc:cardOverrides', JSON.stringify({
      Tooth: -1,                         // below MIN
      Nail: prefs.CARD_OVERRIDE_MAX + 1, // above MAX
      Freeze: prefs.CARD_OVERRIDE_MAX,   // valid edge
      Shield: prefs.CARD_OVERRIDE_MIN,   // valid edge (zero)
      Half: 1.5,                         // non-integer
      Bogus: 'three' as unknown as number,
    }));
    expect(prefs.getCardOverridesPref()).toEqual({
      Freeze: prefs.CARD_OVERRIDE_MAX,
      Shield: prefs.CARD_OVERRIDE_MIN,
    });
  });

  it('returns empty map on malformed JSON payload', async () => {
    const prefs = await loadPrefs();
    store.setItem('sc:cardOverrides', 'not-json');
    expect(prefs.getCardOverridesPref()).toEqual({});
  });

  it('returns empty map when the payload is a JSON array', async () => {
    const prefs = await loadPrefs();
    store.setItem('sc:cardOverrides', JSON.stringify(['Freeze', 4]));
    expect(prefs.getCardOverridesPref()).toEqual({});
  });

  it('returns empty map when localStorage is missing entirely', async () => {
    // Before the stub is injected, the helper should still return defaults
    // rather than throwing. We assert this by tearing down the stub for
    // this single case and putting it back at the end.
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const prefs = await loadPrefs();
    expect(prefs.getCardOverridesPref()).toEqual({});
    // Setting in this state should also no-op silently.
    expect(() => prefs.setCardOverridesPref({ Freeze: 1 })).not.toThrow();
  });
});
