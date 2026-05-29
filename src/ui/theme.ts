/* src/ui/theme.ts — palette + globals.
 *
 * Two contexts: a cute "play" UI (warm parchment-ish) and the data-dense
 * "simulate" UI (dark, terminal-y). The play palette wins by default.
 *
 * Two themes: dark (default — warm walnut) and light (warm parchment). The
 * exported `THEME` object is mutable; call setThemeMode('light' | 'dark') to
 * swap palettes at runtime. CSS variables are also re-injected on switch so
 * components that style via `var(--sc-...)` update instantly without a
 * re-render. Components that interpolate `THEME.xxx` in JS pick up the new
 * values on their next re-render.
 */

// ─── palette type ──────────────────────────────────────────────────────────

export interface ThemePalette {
  // board
  light: string;
  dark: string;
  lightSelected: string;
  darkSelected: string;
  legalDot: string;
  legalRing: string;
  cardTarget: string;
  cardTargetRing: string;
  pilotSuggestion: string;
  pilotSuggestionRing: string;
  lastMoveFrom: string;
  lastMoveTo: string;
  checkSquare: string;
  frozen: string;
  shielded: string;
  foul: string;

  // card rarity
  cardCommon: string;
  cardUncommon: string;
  cardRare: string;
  cardCommonBg: string;
  cardUncommonBg: string;
  cardRareBg: string;

  // surfaces
  pageBg: string;
  pageBgGradient: string;
  panel: string;
  panelSoft: string;
  border: string;
  borderSoft: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  accentDanger: string;
  accentInk: string;

  // simulate-mode (kept terminal-y for data density regardless of theme)
  simBg: string;
  simPanel: string;
  simBorder: string;
  simText: string;
  simTextSecondary: string;
}

export type ThemeMode = 'dark' | 'light';

// ─── DARK theme (default) ──────────────────────────────────────────────────

const DARK_THEME: ThemePalette = {
  light: '#f1e4cb',
  dark: '#7d5a3f',
  lightSelected: '#fce7a4',
  darkSelected: '#b8894c',
  legalDot: 'rgba(78, 159, 78, 0.55)',
  legalRing: 'rgba(78, 159, 78, 0.85)',
  cardTarget: 'rgba(180, 100, 220, 0.35)',
  cardTargetRing: 'rgba(180, 100, 220, 0.9)',
  // Pilot proposal tint — amber accent, distinct from the gold lastMove tint
  // (more saturated) and from the purple card-target tint.
  pilotSuggestion: 'rgba(244, 199, 90, 0.32)',
  pilotSuggestionRing: 'rgba(244, 199, 90, 0.95)',
  lastMoveFrom: 'rgba(244, 199, 90, 0.5)',
  lastMoveTo: 'rgba(244, 199, 90, 0.75)',
  checkSquare: 'rgba(220, 80, 80, 0.45)',
  frozen: 'rgba(140, 195, 240, 0.55)',
  shielded: 'rgba(110, 195, 110, 0.45)',
  foul: 'rgba(220, 90, 90, 0.42)',

  cardCommon: '#9aa0aa',
  cardUncommon: '#3e9d4d',
  cardRare: '#a060d0',
  cardCommonBg: 'linear-gradient(160deg, #f7f3ec 0%, #e8ddc8 100%)',
  cardUncommonBg: 'linear-gradient(160deg, #ecf6e8 0%, #c8e2c1 100%)',
  cardRareBg: 'linear-gradient(160deg, #f0e6f7 0%, #ddc6ee 100%)',

  pageBg: '#1a1410',
  pageBgGradient:
    'radial-gradient(ellipse at top, #2b201a 0%, #1a1410 55%, #0f0a08 100%)',
  panel: '#231b16',
  panelSoft: '#2c221b',
  border: '#3d2f23',
  borderSoft: '#2f241c',
  // Bumped for legibility — was #f6efe2 / #c4b29c / #8b7a64.
  textPrimary: '#fbf6ec',         // ~95% lightness on warm cream
  textSecondary: '#d6c4ac',       // brighter than before — proper secondary
  textMuted: '#a89882',           // was 8b7a64 (too dim against #231b16)
  accent: '#f4c75a',
  accentSoft: '#fadd92',
  accentDanger: '#e26b6b',
  accentInk: '#1a1410',

  simBg: '#1e1e2e',
  simPanel: '#2a2a3e',
  simBorder: '#404060',
  simText: '#e8e8f0',
  simTextSecondary: '#9090b0',
};

// ─── LIGHT theme ───────────────────────────────────────────────────────────

const LIGHT_THEME: ThemePalette = {
  // Board: keep the warm wood feel but lift a notch.
  light: '#f5ead0',
  dark: '#a78661',
  lightSelected: '#ffe8a8',
  darkSelected: '#c69b5e',
  legalDot: 'rgba(50, 130, 50, 0.65)',
  legalRing: 'rgba(50, 130, 50, 0.9)',
  cardTarget: 'rgba(150, 70, 200, 0.35)',
  cardTargetRing: 'rgba(150, 70, 200, 0.95)',
  // Pilot proposal tint — warm amber that reads on cream squares.
  pilotSuggestion: 'rgba(184, 132, 29, 0.30)',
  pilotSuggestionRing: 'rgba(184, 132, 29, 0.95)',
  lastMoveFrom: 'rgba(218, 165, 32, 0.55)',
  lastMoveTo: 'rgba(218, 165, 32, 0.75)',
  checkSquare: 'rgba(200, 60, 60, 0.45)',
  frozen: 'rgba(90, 160, 220, 0.55)',
  shielded: 'rgba(80, 165, 80, 0.45)',
  foul: 'rgba(200, 70, 70, 0.42)',

  cardCommon: '#5a6470',
  cardUncommon: '#2d7a3a',
  cardRare: '#7a3fb0',
  cardCommonBg: 'linear-gradient(160deg, #faf7ef 0%, #ece1cb 100%)',
  cardUncommonBg: 'linear-gradient(160deg, #effaeb 0%, #cee6c6 100%)',
  cardRareBg: 'linear-gradient(160deg, #f4ecf9 0%, #e1cbf1 100%)',

  pageBg: '#fbf6ec',
  pageBgGradient:
    'radial-gradient(ellipse at top, #ffffff 0%, #fbf6ec 55%, #f3eada 100%)',
  panel: '#f5eedd',
  panelSoft: '#faf3e2',
  border: '#d6c4a4',
  borderSoft: '#e3d4b5',
  // Choose darks with high contrast on cream:
  textPrimary: '#241a0e',         // near-black warm brown
  textSecondary: '#544230',       // medium brown
  textMuted: '#7a6650',           // legible muted brown (was way too dim before)
  accent: '#b8841d',              // deeper amber — readable on cream
  accentSoft: '#d4a648',
  accentDanger: '#b54545',
  accentInk: '#fbf6ec',

  // Simulate mode stays dark — it's data-dense and serves a different purpose.
  simBg: '#1e1e2e',
  simPanel: '#2a2a3e',
  simBorder: '#404060',
  simText: '#e8e8f0',
  simTextSecondary: '#9090b0',
};

// ─── runtime mutable theme ─────────────────────────────────────────────────

/** Exported, **mutable** active palette. Components may read `THEME.xxx`
 * directly; on `setThemeMode()` the properties are reassigned in place so
 * subsequent reads pick up the new colors. */
export const THEME: ThemePalette = { ...DARK_THEME };

let currentMode: ThemeMode = 'dark';
const themeListeners: Array<(mode: ThemeMode) => void> = [];

/** Read the currently active mode. */
export function getThemeMode(): ThemeMode {
  return currentMode;
}

/** Switch palettes at runtime. Re-injects CSS variables and notifies any
 * registered listeners (typically the active mode renderer, which can
 * re-render its dynamic UI to pick up new JS-interpolated colors). */
export function setThemeMode(mode: ThemeMode): void {
  if (mode === currentMode) return;
  const next = mode === 'light' ? LIGHT_THEME : DARK_THEME;
  Object.assign(THEME, next);
  currentMode = mode;
  reinjectCssVars();
  for (const cb of themeListeners) cb(mode);
}

/** Subscribe to theme changes. Returns an unsubscribe function. */
export function onThemeChange(cb: (mode: ThemeMode) => void): () => void {
  themeListeners.push(cb);
  return () => {
    const i = themeListeners.indexOf(cb);
    if (i >= 0) themeListeners.splice(i, 1);
  };
}

// ─── css variable injection ────────────────────────────────────────────────

function buildCssText(): string {
  return `
    :root {
      --sc-bg: ${THEME.pageBg};
      --sc-bg-grad: ${THEME.pageBgGradient};
      --sc-panel: ${THEME.panel};
      --sc-panel-soft: ${THEME.panelSoft};
      --sc-border: ${THEME.border};
      --sc-border-soft: ${THEME.borderSoft};
      --sc-text: ${THEME.textPrimary};
      --sc-text-secondary: ${THEME.textSecondary};
      --sc-text-muted: ${THEME.textMuted};
      --sc-accent: ${THEME.accent};
      --sc-accent-soft: ${THEME.accentSoft};
      --sc-accent-ink: ${THEME.accentInk};
      --sc-accent-danger: ${THEME.accentDanger};

      --sc-light: ${THEME.light};
      --sc-dark: ${THEME.dark};
      --sc-light-sel: ${THEME.lightSelected};
      --sc-dark-sel: ${THEME.darkSelected};
      --sc-legal-dot: ${THEME.legalDot};
      --sc-legal-ring: ${THEME.legalRing};
      --sc-card-target: ${THEME.cardTarget};
      --sc-card-target-ring: ${THEME.cardTargetRing};
      --sc-last-from: ${THEME.lastMoveFrom};
      --sc-last-to: ${THEME.lastMoveTo};
      --sc-check: ${THEME.checkSquare};

      --sc-card-common: ${THEME.cardCommon};
      --sc-card-uncommon: ${THEME.cardUncommon};
      --sc-card-rare: ${THEME.cardRare};

      font-family: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua',
                   Palatino, Georgia, serif;
    }

    html, body {
      margin: 0;
      padding: 0;
      min-height: 100vh;
      background: var(--sc-bg);
      color: var(--sc-text);
      -webkit-font-smoothing: antialiased;
    }
    body { background: var(--sc-bg-grad); }
    * { box-sizing: border-box; }

    button {
      font-family: inherit;
      cursor: pointer;
    }

    .sc-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 18px;
      border-radius: 999px;
      background: ${themeMix(THEME, 0.06, 0.04)};
      border: 1px solid var(--sc-border);
      color: var(--sc-text);
      font-size: 14px;
      letter-spacing: 0.02em;
      transition:
        background 200ms ease,
        border-color 200ms ease,
        transform 240ms cubic-bezier(.2,.7,.2,1),
        box-shadow 200ms ease;
    }
    .sc-btn:hover {
      background: ${themeMix(THEME, 0.12, 0.08)};
      border-color: var(--sc-text-secondary);
      transform: translateY(-1px);
    }
    .sc-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      transform: none;
    }
    .sc-btn--primary {
      background: var(--sc-accent);
      color: var(--sc-accent-ink);
      border-color: var(--sc-accent);
      font-weight: 600;
    }
    .sc-btn--primary:hover {
      background: var(--sc-accent-soft);
      border-color: var(--sc-accent-soft);
      box-shadow: 0 8px 22px rgba(184, 132, 29, 0.32);
    }
    .sc-btn--danger:hover {
      background: rgba(226, 107, 107, 0.18);
      border-color: var(--sc-accent-danger);
    }

    .sc-tag {
      display: inline-block;
      padding: 2px 9px;
      border-radius: 999px;
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      border: 1px solid currentColor;
    }
  `;
}

/** Sutble button-bg shading that works on both dark and light surfaces.
 * On dark = white overlay; on light = darker overlay. */
function themeMix(_t: ThemePalette, darkAlpha: number, lightAlpha: number): string {
  return currentMode === 'dark'
    ? `rgba(255, 255, 255, ${darkAlpha})`
    : `rgba(0, 0, 0, ${lightAlpha})`;
}

function reinjectCssVars(): void {
  const existing = document.getElementById('sc-theme');
  if (existing) existing.remove();
  injectTheme();
}

export function injectTheme(): void {
  if (document.getElementById('sc-theme')) return;
  const style = document.createElement('style');
  style.id = 'sc-theme';
  style.textContent = buildCssText();
  document.head.appendChild(style);
}
