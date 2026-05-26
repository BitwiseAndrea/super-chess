/* src/ui/theme.ts — palette + globals.
 *
 * Two contexts: a cute "play" UI (warm parchment-ish) and the data-dense
 * "simulate" UI (dark, terminal-y). The play palette wins by default.
 */

export const THEME = {
  // --- board ---
  light: '#f1e4cb',         // warm cream
  dark: '#7d5a3f',          // walnut
  lightSelected: '#fce7a4', // honey
  darkSelected: '#b8894c',
  legalDot: 'rgba(78, 159, 78, 0.55)',
  legalRing: 'rgba(78, 159, 78, 0.85)',
  cardTarget: 'rgba(180, 100, 220, 0.35)',
  cardTargetRing: 'rgba(180, 100, 220, 0.9)',
  lastMoveFrom: 'rgba(244, 199, 90, 0.5)',
  lastMoveTo: 'rgba(244, 199, 90, 0.75)',
  checkSquare: 'rgba(220, 80, 80, 0.45)',
  frozen: 'rgba(140, 195, 240, 0.55)',
  shielded: 'rgba(110, 195, 110, 0.45)',
  foul: 'rgba(220, 90, 90, 0.42)',

  // --- card rarity (used by play hands + sim card chips) ---
  cardCommon: '#9aa0aa',
  cardUncommon: '#3e9d4d',
  cardRare: '#a060d0',
  cardCommonBg: 'linear-gradient(160deg, #f7f3ec 0%, #e8ddc8 100%)',
  cardUncommonBg: 'linear-gradient(160deg, #ecf6e8 0%, #c8e2c1 100%)',
  cardRareBg: 'linear-gradient(160deg, #f0e6f7 0%, #ddc6ee 100%)',

  // --- play UI surfaces ---
  pageBg: '#1a1410',
  pageBgGradient:
    'radial-gradient(ellipse at top, #2b201a 0%, #1a1410 55%, #0f0a08 100%)',
  panel: '#231b16',
  panelSoft: '#2c221b',
  border: '#3d2f23',
  borderSoft: '#2f241c',
  textPrimary: '#f6efe2',
  textSecondary: '#c4b29c',
  textMuted: '#8b7a64',
  accent: '#f4c75a',         // warm gold
  accentSoft: '#f5e1a8',
  accentDanger: '#e26b6b',
  accentInk: '#1a1410',

  // --- simulation UI (kept terminal-y for data density) ---
  simBg: '#1e1e2e',
  simPanel: '#2a2a3e',
  simBorder: '#404060',
  simText: '#e8e8f0',
  simTextSecondary: '#9090b0',
} as const;

export function injectTheme(): void {
  if (document.getElementById('sc-theme')) return;
  const style = document.createElement('style');
  style.id = 'sc-theme';
  style.textContent = `
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
      background: rgba(255, 255, 255, 0.06);
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
      background: rgba(255, 255, 255, 0.12);
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
      box-shadow: 0 8px 22px rgba(244, 199, 90, 0.28);
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
  document.head.appendChild(style);
}
