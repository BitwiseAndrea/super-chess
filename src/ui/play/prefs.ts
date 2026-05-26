// src/ui/play/prefs.ts
// Tiny localStorage wrapper for play-mode UI preferences. Safe in private
// browsing / disabled-storage contexts (everything degrades to defaults).

import type { ThemeMode } from '../theme.ts';

const KEY_OPEN_HAND = 'sc:openOpponentHand';
const KEY_THEME_MODE = 'sc:themeMode';

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
