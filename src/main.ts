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
import { renderSimulateMode } from './ui/play/simulateMode.ts';
import { showAboutModal } from './ui/aboutModal.ts';

// Apply saved theme **before** injecting CSS variables so the first paint is
// already in the right palette (no flash of the wrong theme).
const savedTheme = getThemeModePref();
if (savedTheme && savedTheme !== getThemeMode()) {
  // setThemeMode no-ops when the mode matches; we want it to actually swap
  // the palette in place when saved !== default.
  setThemeMode(savedTheme);
}
injectTheme();

// "Play" and "Simulate" are the two actual modes of the game (one is
// human-vs-bot, the other is bot-vs-bot research). The old "cards" tab
// was a static catalog of all cards — that content moved into the
// About modal (triggered from the nav corner), which gives it room for
// an intro + how-to-play section without polluting the primary nav.
type TabKey = 'play' | 'simulate';
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'play',     label: 'play' },
  { key: 'simulate', label: 'simulate' },
];

function readTabFromHash(): TabKey {
  const h = window.location.hash.replace('#', '').trim();
  if (h === 'simulate' || h === 'play') return h;
  // Back-compat: old #cards URLs (and anything else) land on Play
  // and trigger the About modal. Keeps existing bookmarks useful.
  if (h === 'cards') {
    // Defer until DOM is ready; main.ts hasn't built the nav yet at parse time.
    queueMicrotask(() => showAboutModal());
  }
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

// --- cards / about button --------------------------------------------------
// Was a top-level tab; now lives in the nav corner so the primary nav stays
// focused on the two actual game modes. Clicking opens a full-page modal
// with the card catalog, a brief tutorial, and game intro.
const aboutBtn = document.createElement('button');
aboutBtn.type = 'button';
aboutBtn.title = 'card catalog + how to play';
aboutBtn.style.cssText = `
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: transparent;
  border: 1px solid var(--sc-border);
  color: var(--sc-text-secondary);
  font-size: 12px; letter-spacing: 0.08em;
  font-family: inherit;
  cursor: pointer;
  transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
`;
aboutBtn.innerHTML = '<span style="font-size:13px;">\u2660</span> cards';
aboutBtn.addEventListener('mouseenter', () => {
  aboutBtn.style.borderColor = 'var(--sc-text-secondary)';
  aboutBtn.style.color = 'var(--sc-text)';
});
aboutBtn.addEventListener('mouseleave', () => {
  aboutBtn.style.borderColor = 'var(--sc-border)';
  aboutBtn.style.color = 'var(--sc-text-secondary)';
});
aboutBtn.addEventListener('click', () => showAboutModal());
nav.appendChild(aboutBtn);

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
//
// Each tab owns a persistent <div> child of `main`. We mount the tab's UI
// the FIRST time it's visited, then on subsequent tab-switches we just
// toggle `display` on the containers. This is what keeps in-progress play
// state (the PlayController + its game) alive while the user wanders off
// to the Cards or Simulate tab.
//
// Trade-off: the Cards and Simulate tabs bake THEME values into their
// inline styles, so a theme switch invalidates them. We track that with a
// per-tab "dirty" flag and re-mount lazily on next visit (or eagerly if
// the dirty tab is already on-screen). The Play tab handles theme changes
// itself via the PlayController's onThemeChange subscription, so it
// NEVER needs re-mounting — that's exactly why this whole scheme works.
const main = document.createElement('main');
main.style.cssText = 'flex: 1; min-height: 0;';
shell.appendChild(main);

const tabContainers = new Map<TabKey, HTMLElement>();
const mountedTabs = new Set<TabKey>();
const dirtyTabs = new Set<TabKey>();

function getTabContainer(key: TabKey): HTMLElement {
  let c = tabContainers.get(key);
  if (!c) {
    c = document.createElement('div');
    c.dataset.tab = key;
    // Hidden by default; renderTab() flips display on the active one
    // (after this call returns). Only `min-height` is set inline so
    // it survives the display toggle.
    c.style.minHeight = '0';
    c.style.display = 'none';
    main.appendChild(c);
    tabContainers.set(key, c);
  }
  return c;
}

function mountTab(key: TabKey, container: HTMLElement): void {
  if (key === 'play') renderPlayMode(container);
  else renderSimulateMode(container);
  mountedTabs.add(key);
  dirtyTabs.delete(key);
}

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
  // CRITICAL: `getTabContainer` MUST run before the visibility toggle,
  // because on the very first visit it creates the container with
  // `display: none` and registers it in `tabContainers`. If we toggled
  // visibility before this call, the new container would stay hidden
  // until the user navigated away and came back. (Past bug: deck panel
  // / entire play tab was invisible on first mount.)
  const container = getTabContainer(key);
  if (!mountedTabs.has(key) || dirtyTabs.has(key)) {
    mountTab(key, container);
  }
  // Show the active container, hide the rest. Containers preserve their
  // DOM (and therefore game / scroll state) across switches.
  for (const [k, c] of tabContainers) {
    c.style.display = k === key ? '' : 'none';
  }
}

// On theme change:
//   - Tab button styles include the active/inactive bool, so re-run them.
//   - The Cards / Simulate tabs bake THEME palette values into inline
//     styles at render time, so they need to re-render to pick up the
//     new colors. If we're currently LOOKING at one of them, re-render
//     in place; otherwise mark it dirty and lazy-render on next visit
//     (so we don't tear down hidden DOM for no reason — and so a long
//     Simulate tab doesn't quietly rebuild while you're playing).
//   - The Play tab handles theme changes itself (PlayController has its
//     own onThemeChange listener), so we never touch it here.
onThemeChange(() => {
  updateThemeBtnLabel();
  refreshTabButtons(activeTab);
  // Simulate is the only remaining tab that bakes THEME palette values into
  // inline styles at render time, so it needs a re-mount on theme change.
  // Play subscribes to onThemeChange itself via its controller, so we
  // never touch it here. (Cards used to be in this list — its content
  // now lives in the About modal, which is constructed on demand each
  // open so it always picks up the current theme.)
  for (const k of ['simulate'] as TabKey[]) {
    if (!mountedTabs.has(k)) continue;
    if (k === activeTab) {
      mountTab(k, getTabContainer(k));
    } else {
      dirtyTabs.add(k);
    }
  }
});

window.addEventListener('hashchange', () => renderTab(readTabFromHash()));
renderTab(activeTab);
