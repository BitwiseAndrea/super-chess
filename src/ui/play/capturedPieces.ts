// src/ui/play/capturedPieces.ts
// A thin strip of unicode piece glyphs showing what each side has captured,
// plus a material lead indicator (e.g. "+2" if you're up two pawns).
import type { SuperChessState } from '../../game/types.ts';
import type { PieceColor, PieceStr, PieceType } from '../../engine/types.ts';
import { THEME } from '../theme.ts';

const UNICODE: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};
const VALUES: Record<string, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

export class CapturedPiecesRenderer {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.cssText = `
      display: flex; align-items: center; gap: 8px;
      min-height: 22px;
      font-size: 18px;
      color: ${THEME.textSecondary};
      line-height: 1;
    `;
  }

  /** Render captures BY `forColor` (i.e. pieces of the OTHER color removed). */
  render(state: SuperChessState, forColor: PieceColor): void {
    this.container.innerHTML = '';
    const captured: PieceStr[] = state.superState.capturedByColor.get(forColor) ?? [];
    // Group + sort by piece value desc for cleaner display
    const sorted = [...captured].sort((a, b) => {
      return (VALUES[b[1] as PieceType] ?? 0) - (VALUES[a[1] as PieceType] ?? 0);
    });

    for (const p of sorted) {
      const span = document.createElement('span');
      span.textContent = UNICODE[p] ?? p;
      span.style.cssText = 'opacity: 0.75; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.4));';
      this.container.appendChild(span);
    }

    const lead = materialLead(state, forColor);
    if (lead > 0) {
      const tag = document.createElement('span');
      tag.style.cssText = `
        margin-left: 4px;
        font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
        color: ${THEME.accent}; font-family: system-ui, sans-serif;
      `;
      tag.textContent = `+${lead}`;
      this.container.appendChild(tag);
    }

    if (captured.length === 0 && lead === 0) {
      const placeholder = document.createElement('span');
      placeholder.textContent = ' ';
      placeholder.style.cssText = 'opacity: 0.0;';
      this.container.appendChild(placeholder);
    }
  }
}

function materialLead(state: SuperChessState, forColor: PieceColor): number {
  let w = 0, b = 0;
  for (const p of state.chess.board) {
    if (!p) continue;
    const v = VALUES[p[1] as PieceType] ?? 0;
    if (p[0] === 'w') w += v; else b += v;
  }
  return forColor === 'w' ? w - b : b - w;
}
