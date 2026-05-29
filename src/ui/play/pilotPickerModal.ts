// src/ui/play/pilotPickerModal.ts
//
// In-game modal for choosing an opening to auto-pilot. Triggered by the
// "use an opening" affordance shown only before the human's first move.
//
// Filtered to openings matching the human's color. Persists the last-used
// choice in localStorage so reopening the modal in a later game pre-
// highlights the previous pick.
//
// Theme-aware (uses CSS variables); dismisses on backdrop click or Escape.

import type { PieceColor } from '../../engine/types.ts';
import { openingsForColor } from './openings.ts';
import { getPilotOpeningPref, setPilotOpeningPref } from './prefs.ts';

export interface PilotPickerOptions {
  humanColor: PieceColor;
  /** Called when the user picks an opening. The modal closes itself before
   * firing the callback. */
  onPick: (openingId: string) => void;
  /** Called when the user dismisses without picking. Optional. */
  onCancel?: () => void;
}

export function showPilotPickerModal(opts: PilotPickerOptions): void {
  const openings = openingsForColor(opts.humanColor);
  // If the last-used opening was for the OTHER color, ignore it.
  const lastUsed = getPilotOpeningPref();
  const preselect = openings.find((o) => o.id === lastUsed)?.id ?? null;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 850;
    background: rgba(8, 5, 3, 0.6);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const card = document.createElement('div');
  card.style.cssText = `
    background: var(--sc-panel-soft);
    border: 1px solid var(--sc-border);
    border-radius: 14px;
    width: 100%; max-width: 520px;
    max-height: 88vh;
    display: flex; flex-direction: column;
    overflow: hidden;
    color: var(--sc-text);
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.55);
  `;
  overlay.appendChild(card);

  // --- header ---
  const head = document.createElement('header');
  head.style.cssText = `
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--sc-border);
    display: flex; align-items: center; gap: 14px;
  `;
  card.appendChild(head);

  const title = document.createElement('div');
  title.style.cssText = `
    flex: 1;
    display: flex; flex-direction: column; gap: 4px;
  `;
  title.innerHTML = `
    <div style="font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:var(--sc-text-secondary);">opening pilot</div>
    <div style="font-size:18px;font-weight:500;color:var(--sc-text);">pick an opening to auto-play</div>
    <div style="font-size:12.5px;line-height:1.45;color:var(--sc-text-muted);font-family:system-ui,sans-serif;margin-top:4px;">
      the controller will play your moves until the bot deviates or the line runs out. you can stop it any time.
    </div>
  `;
  head.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'sc-btn';
  closeBtn.textContent = 'cancel';
  closeBtn.addEventListener('click', () => close());
  head.appendChild(closeBtn);

  // --- body: list of openings ---
  const body = document.createElement('div');
  body.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px 20px;
    display: flex; flex-direction: column; gap: 8px;
  `;
  card.appendChild(body);

  for (const opening of openings) {
    const isPreselected = opening.id === preselect;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = optionStyle(isPreselected);
    btn.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:10px;">
        <strong style="font-size:14px;font-weight:600;color:var(--sc-text);">${escapeHtml(opening.name)}</strong>
        <span style="font-size:10.5px;letter-spacing:0.12em;color:var(--sc-text-muted);text-transform:uppercase;">${opening.moves.length} moves</span>
      </div>
      <div style="font-size:12.5px;color:var(--sc-text-secondary);font-family:system-ui,sans-serif;margin-top:4px;">${escapeHtml(opening.description)}</div>
      <div style="font-family:ui-monospace,'JetBrains Mono',Menlo,monospace;font-size:11px;color:var(--sc-text-muted);margin-top:6px;">${opening.moves.map((m) => escapeHtml(m.label)).join(' \u2192 ')}</div>
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.cssText = optionStyle(true);
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.cssText = optionStyle(isPreselected);
    });
    btn.addEventListener('click', () => {
      setPilotOpeningPref(opening.id);
      close();
      opts.onPick(opening.id);
    });
    body.appendChild(btn);
  }

  // --- mount + lifecycle ---
  let closed = false;
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', escHandler);
    overlay.remove();
    opts.onCancel?.();
  }

  document.addEventListener('keydown', escHandler);
  document.body.appendChild(overlay);
}

function optionStyle(active: boolean): string {
  if (active) {
    return `
      display: block;
      width: 100%;
      text-align: left;
      padding: 12px 14px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--sc-accent) 16%, var(--sc-panel));
      border: 1.5px solid var(--sc-accent);
      color: var(--sc-text);
      cursor: pointer;
      transition: all 150ms ease;
      font-family: inherit;
      box-shadow:
        0 0 0 2px color-mix(in srgb, var(--sc-accent) 14%, transparent),
        inset 0 1px 0 color-mix(in srgb, var(--sc-accent) 30%, transparent);
    `;
  }
  return `
    display: block;
    width: 100%;
    text-align: left;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--sc-panel);
    border: 1px solid var(--sc-border);
    color: var(--sc-text);
    cursor: pointer;
    transition: all 150ms ease;
    font-family: inherit;
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}
