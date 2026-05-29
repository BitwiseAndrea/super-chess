// src/ui/play/loadGameModal.ts
//
// Modal launched from the new-game panel that lets a tester paste a
// JSON snapshot (typically from the bug-report modal's "copy" button)
// and start a game from that exact position. See ../../game/loadGame.ts
// for the parser; this module is the chrome around it.
//
// The modal does NOT itself start the game — it returns the parsed
// LoadedGame via callback so the caller (newGamePanel) can dismiss
// itself and hand off to mountGame with the loaded snapshot.

import type { LoadedGame } from '../../game/loadGame.ts';
import { parseLoadGameInput } from '../../game/loadGame.ts';

export interface LoadGameModalOptions {
  /** Fired when the user successfully parses + confirms a snapshot.
   * The caller should dismiss any underlying overlays (the new-game
   * panel) and start the game with this snapshot. */
  onLoad: (loaded: LoadedGame) => void;
}

export function showLoadGameModal(opts: LoadGameModalOptions): HTMLElement {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 900;
    background: rgba(8, 5, 3, 0.65);
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
    width: 100%; max-width: 720px;
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
    padding: 18px 24px 14px;
    border-bottom: 1px solid var(--sc-border);
    display: flex; align-items: center; gap: 14px;
  `;
  card.appendChild(head);

  const title = document.createElement('div');
  title.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 2px;';
  title.innerHTML = `
    <div style="font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:var(--sc-text-secondary);">load saved state</div>
    <div style="font-size:18px;font-weight:500;color:var(--sc-text);">start from a JSON snapshot</div>
  `;
  head.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'sc-btn';
  closeBtn.textContent = 'close';
  closeBtn.addEventListener('click', () => close());
  head.appendChild(closeBtn);

  // --- body ---
  const body = document.createElement('div');
  body.style.cssText = `
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 18px 24px;
    display: flex; flex-direction: column; gap: 14px;
  `;
  card.appendChild(body);

  const blurb = document.createElement('p');
  blurb.style.cssText = `
    margin: 0;
    font-size: 13px; line-height: 1.55;
    color: var(--sc-text-secondary);
    font-family: system-ui, sans-serif;
  `;
  blurb.innerHTML = `
    Paste a snapshot JSON from the in-game <strong>bug report</strong> button
    (or any object with <code style="font-family:ui-monospace,monospace;font-size:12px;background:var(--sc-panel);padding:1px 5px;border-radius:4px;">{ fen, hands, superState }</code>).
    The board, hands, freezes/shields/etc. will be restored. Draw + discard piles aren't preserved &mdash;
    the deck is rebuilt fresh from the full card pool with your loaded hands plucked off the top.
  `;
  body.appendChild(blurb);

  const ta = document.createElement('textarea');
  ta.placeholder = '{\n  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",\n  "hands": { "white": ["Freeze"], "black": [] }\n}';
  ta.style.cssText = `
    width: 100%; min-height: 220px;
    background: var(--sc-panel);
    border: 1px solid var(--sc-border);
    border-radius: 8px;
    padding: 10px 12px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 12px; line-height: 1.5;
    color: var(--sc-text);
    resize: vertical;
    box-sizing: border-box;
  `;
  body.appendChild(ta);

  // Live messages: errors above the button, warnings below the field.
  const errorBox = document.createElement('div');
  errorBox.style.cssText = `
    display: none;
    padding: 10px 12px;
    border: 1px solid var(--sc-danger, #b04848);
    border-radius: 8px;
    background: color-mix(in srgb, var(--sc-danger, #b04848) 12%, var(--sc-panel));
    color: var(--sc-text);
    font-size: 12.5px; line-height: 1.5;
    font-family: system-ui, sans-serif;
    white-space: pre-wrap;
  `;
  body.appendChild(errorBox);

  const warningBox = document.createElement('div');
  warningBox.style.cssText = `
    display: none;
    padding: 10px 12px;
    border: 1px solid var(--sc-warning, #b07a48);
    border-radius: 8px;
    background: color-mix(in srgb, var(--sc-warning, #b07a48) 10%, var(--sc-panel));
    color: var(--sc-text-secondary);
    font-size: 12px; line-height: 1.5;
    font-family: system-ui, sans-serif;
    white-space: pre-wrap;
  `;
  body.appendChild(warningBox);

  function showErrors(errs: string[]): void {
    errorBox.textContent = errs.join('\n');
    errorBox.style.display = errs.length > 0 ? 'block' : 'none';
  }
  function showWarnings(ws: string[]): void {
    if (ws.length === 0) {
      warningBox.style.display = 'none';
      warningBox.textContent = '';
      return;
    }
    warningBox.textContent = `loaded with ${ws.length} warning${ws.length === 1 ? '' : 's'}:\n` + ws.map((w) => `\u2022 ${w}`).join('\n');
    warningBox.style.display = 'block';
  }

  // --- footer ---
  const foot = document.createElement('footer');
  foot.style.cssText = `
    padding: 14px 24px;
    border-top: 1px solid var(--sc-border);
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px;
    background: var(--sc-panel-soft);
  `;
  card.appendChild(foot);

  const hint = document.createElement('div');
  hint.style.cssText = `
    flex: 1;
    font-size: 11.5px;
    color: var(--sc-text-muted);
    font-family: system-ui, sans-serif;
  `;
  hint.textContent = 'tip: copy the report from the in-game 🐞 button and paste it here.';
  foot.appendChild(hint);

  const previewBtn = document.createElement('button');
  previewBtn.className = 'sc-btn';
  previewBtn.textContent = 'validate';
  previewBtn.addEventListener('click', () => {
    const result = parseLoadGameInput(ta.value);
    if (result.ok) {
      showErrors([]);
      showWarnings(result.warnings);
      hint.textContent = `\u2713 valid \u2014 white hand: ${result.loaded.state.deck.hand.white.length}, black hand: ${result.loaded.state.deck.hand.black.length}, turn: ${result.loaded.state.chess.turn}`;
      hint.style.color = 'var(--sc-text)';
    } else {
      showErrors(result.errors);
      showWarnings(result.warnings);
      hint.textContent = 'fix the errors above before loading.';
      hint.style.color = 'var(--sc-text-muted)';
    }
  });
  foot.appendChild(previewBtn);

  const loadBtn = document.createElement('button');
  loadBtn.className = 'sc-btn sc-btn--primary';
  loadBtn.textContent = 'load + start';
  loadBtn.addEventListener('click', () => {
    const result = parseLoadGameInput(ta.value);
    if (!result.ok) {
      showErrors(result.errors);
      showWarnings(result.warnings);
      return;
    }
    // Hand off to caller and dismiss. We intentionally don't show
    // warnings here — the caller (or the in-game UI) doesn't need
    // them once we're past validation.
    close();
    opts.onLoad(result.loaded);
  });
  foot.appendChild(loadBtn);

  // --- keyboard / lifecycle ---
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey);

  function close(): void {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  }

  document.body.appendChild(overlay);
  // Focus the textarea so paste works immediately.
  setTimeout(() => ta.focus(), 0);
  return overlay;
}
