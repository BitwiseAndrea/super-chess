// src/main.ts
// Top-level entry: a tabbed shell that switches between the user-facing
// Play mode (default), the all-cards reference, and the simulation tool.

import { injectTheme, THEME } from './ui/theme.ts';
import { renderPlayMode } from './ui/play/playPanel.ts';
import { renderCardsReference } from './ui/play/cardsReference.ts';
import { renderSimulateMode } from './ui/play/simulateMode.ts';

injectTheme();

type TabKey = 'play' | 'cards' | 'simulate';
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'play',     label: 'play' },
  { key: 'cards',    label: 'cards' },
  { key: 'simulate', label: 'simulate' },
];

function readTabFromHash(): TabKey {
  const h = window.location.hash.replace('#', '').trim();
  if (h === 'cards' || h === 'simulate' || h === 'play') return h;
  return 'play';
}

const app = document.getElementById('app')!;
app.style.minHeight = '100vh';

const shell = document.createElement('div');
shell.style.cssText = 'display: flex; flex-direction: column; min-height: 100vh;';
app.appendChild(shell);

// --- top nav ----------------------------------------------------------------
const nav = document.createElement('nav');
nav.style.cssText = `
  position: sticky; top: 0; z-index: 50;
  display: flex; align-items: center; gap: 18px;
  padding: 12px clamp(16px, 4vw, 32px);
  background: rgba(20, 14, 10, 0.75);
  border-bottom: 1px solid ${THEME.borderSoft};
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
`;
shell.appendChild(nav);

const brand = document.createElement('a');
brand.href = '#play';
brand.style.cssText = `
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 16px; font-weight: 500;
  color: ${THEME.textPrimary};
  text-decoration: none;
  letter-spacing: 0.02em;
`;
brand.innerHTML = `<span style="font-size:18px;">♛</span> super chess`;
nav.appendChild(brand);

const tabRow = document.createElement('div');
tabRow.style.cssText = 'display: flex; gap: 6px; margin-left: 12px;';
nav.appendChild(tabRow);

const tabButtons = new Map<TabKey, HTMLButtonElement>();
for (const t of TABS) {
  const btn = document.createElement('button');
  btn.dataset.tab = t.key;
  btn.textContent = t.label;
  btn.style.cssText = tabStyle(false);
  btn.addEventListener('click', () => {
    window.location.hash = t.key;
  });
  tabRow.appendChild(btn);
  tabButtons.set(t.key, btn);
}

const spacer = document.createElement('div');
spacer.style.flex = '1';
nav.appendChild(spacer);

const ghLink = document.createElement('a');
ghLink.href = 'https://github.com/BitwiseAndrea/super-chess';
ghLink.target = '_blank';
ghLink.rel = 'noreferrer';
ghLink.style.cssText = `
  font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
  color: ${THEME.textMuted};
  text-decoration: none;
`;
ghLink.textContent = 'github →';
ghLink.addEventListener('mouseenter', () => { ghLink.style.color = THEME.textSecondary; });
ghLink.addEventListener('mouseleave', () => { ghLink.style.color = THEME.textMuted; });
nav.appendChild(ghLink);

// --- main page area ---------------------------------------------------------
const main = document.createElement('main');
main.style.cssText = 'flex: 1; min-height: 0;';
shell.appendChild(main);

function tabStyle(active: boolean): string {
  return `
    padding: 7px 16px;
    border-radius: 999px;
    background: ${active ? 'rgba(244, 199, 90, 0.16)' : 'transparent'};
    border: 1px solid ${active ? THEME.accent : 'transparent'};
    color: ${active ? THEME.textPrimary : THEME.textMuted};
    font-size: 13px;
    letter-spacing: 0.06em;
    transition: all 200ms ease;
    cursor: pointer;
    font-family: inherit;
  `;
}

function renderTab(key: TabKey): void {
  for (const [k, btn] of tabButtons) {
    btn.style.cssText = tabStyle(k === key);
  }
  if (key === 'play') renderPlayMode(main);
  else if (key === 'cards') renderCardsReference(main);
  else renderSimulateMode(main);
}

window.addEventListener('hashchange', () => renderTab(readTabFromHash()));
renderTab(readTabFromHash());
