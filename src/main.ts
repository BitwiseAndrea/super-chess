// src/main.ts
// Top-level entry: a tabbed shell that switches between the user-facing
// Play mode (default), the all-cards reference, and the simulation tool.

import {
  injectTheme,
  setThemeMode,
  getThemeMode,
  onThemeChange,
  type ThemeMode,
} from './ui/theme.ts';
import { getThemeModePref, setThemeModePref } from './ui/play/prefs.ts';
import { renderPlayMode } from './ui/play/playPanel.ts';
import { renderCardsReference } from './ui/play/cardsReference.ts';
import { renderSimulateMode } from './ui/play/simulateMode.ts';

// Apply saved theme **before** injecting CSS variables so the first paint is
// already in the right palette (no flash of the wrong theme).
const savedTheme = getThemeModePref();
if (savedTheme && savedTheme !== getThemeMode()) {
  // setThemeMode no-ops when the mode matches; we want it to actually swap
  // the palette in place when saved !== default.
  setThemeMode(savedTheme);
}
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
//
// Uses CSS variables so it adapts to theme switches without a rebuild. The
// nav background is a translucent overlay that works on both light and dark
// page backgrounds.
const nav = document.createElement('nav');
nav.style.cssText = `
  position: sticky; top: 0; z-index: 50;
  display: flex; align-items: center; gap: 18px;
  padding: 12px clamp(16px, 4vw, 32px);
  background: color-mix(in srgb, var(--sc-bg) 78%, transparent);
  border-bottom: 1px solid var(--sc-border-soft);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
`;
shell.appendChild(nav);

const brand = document.createElement('a');
brand.href = '#play';
brand.style.cssText = `
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 16px; font-weight: 500;
  color: var(--sc-text);
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

// --- theme toggle -----------------------------------------------------------
const themeBtn = document.createElement('button');
themeBtn.title = 'toggle light / dark theme';
themeBtn.style.cssText = `
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: transparent;
  border: 1px solid var(--sc-border);
  color: var(--sc-text-secondary);
  font-size: 12px; letter-spacing: 0.08em;
  font-family: inherit;
  transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
`;
themeBtn.addEventListener('mouseenter', () => {
  themeBtn.style.borderColor = 'var(--sc-text-secondary)';
  themeBtn.style.color = 'var(--sc-text)';
});
themeBtn.addEventListener('mouseleave', () => {
  themeBtn.style.borderColor = 'var(--sc-border)';
  themeBtn.style.color = 'var(--sc-text-secondary)';
});
themeBtn.addEventListener('click', () => {
  const next: ThemeMode = getThemeMode() === 'dark' ? 'light' : 'dark';
  setThemeMode(next);
  setThemeModePref(next);
});
nav.appendChild(themeBtn);
updateThemeBtnLabel();

const ghLink = document.createElement('a');
ghLink.href = 'https://github.com/BitwiseAndrea/super-chess';
ghLink.target = '_blank';
ghLink.rel = 'noreferrer';
ghLink.style.cssText = `
  font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--sc-text-muted);
  text-decoration: none;
  transition: color 180ms ease;
`;
ghLink.textContent = 'github →';
ghLink.addEventListener('mouseenter', () => { ghLink.style.color = 'var(--sc-text-secondary)'; });
ghLink.addEventListener('mouseleave', () => { ghLink.style.color = 'var(--sc-text-muted)'; });
nav.appendChild(ghLink);

// --- main page area ---------------------------------------------------------
const main = document.createElement('main');
main.style.cssText = 'flex: 1; min-height: 0;';
shell.appendChild(main);

function tabStyle(active: boolean): string {
  return `
    padding: 7px 16px;
    border-radius: 999px;
    background: ${active ? 'color-mix(in srgb, var(--sc-accent) 20%, transparent)' : 'transparent'};
    border: 1px solid ${active ? 'var(--sc-accent)' : 'transparent'};
    color: ${active ? 'var(--sc-text)' : 'var(--sc-text-muted)'};
    font-size: 13px;
    letter-spacing: 0.06em;
    transition: all 200ms ease;
    cursor: pointer;
    font-family: inherit;
  `;
}

function updateThemeBtnLabel(): void {
  const mode = getThemeMode();
  themeBtn.innerHTML =
    mode === 'dark'
      ? '<span style="font-size:14px;">☀</span> light'
      : '<span style="font-size:14px;">☾</span> dark';
}

function refreshTabButtons(activeKey: TabKey): void {
  for (const [k, btn] of tabButtons) {
    btn.style.cssText = tabStyle(k === activeKey);
  }
}

let activeTab: TabKey = readTabFromHash();

function renderTab(key: TabKey): void {
  activeTab = key;
  refreshTabButtons(key);
  if (key === 'play') renderPlayMode(main);
  else if (key === 'cards') renderCardsReference(main);
  else renderSimulateMode(main);
}

// On theme change, re-style the tab buttons (their inline style includes
// resolved `var(--sc-*)` references which the browser handles automatically,
// but the active/inactive boolean is baked in — so we re-run tabStyle).
// For the `cards` and `simulate` tabs we also re-render so their JS-baked
// THEME colors pick up the new palette. The `play` tab handles its own
// dynamic refresh via the PlayController listener; rebuilding it would
// destroy the in-progress game.
onThemeChange(() => {
  updateThemeBtnLabel();
  refreshTabButtons(activeTab);
  if (activeTab === 'cards' || activeTab === 'simulate') {
    renderTab(activeTab);
  }
});

window.addEventListener('hashchange', () => renderTab(readTabFromHash()));
renderTab(activeTab);
