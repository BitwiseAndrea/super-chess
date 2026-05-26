// src/ui/gameLog.ts
import type { SuperChessState } from '../game/types.ts';
import type { ChessState } from '../engine/types.ts';
import { THEME } from './theme.ts';

export class GameLogRenderer {
  private container: HTMLElement;
  private selectedIdx: number | null = null;
  private followLatest = true;

  /** Called when user clicks a move row — passes the board state after that move */
  onMoveClick?: (chess: ChessState) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.cssText = `
      height: 220px; overflow-y: auto; font-size: 11px; font-family: monospace;
      background: ${THEME.bg}; border: 1px solid ${THEME.border}; border-radius: 4px; padding: 6px;
      color: ${THEME.textPrimary};
    `;
    // If user manually scrolls up, stop auto-follow
    this.container.addEventListener('scroll', () => {
      const atBottom = this.container.scrollTop + this.container.clientHeight >= this.container.scrollHeight - 20;
      if (atBottom) this.followLatest = true;
    });
  }

  render(state: SuperChessState): void {
    this.container.innerHTML = '';

    for (let i = 0; i < state.history.length; i++) {
      const event = state.history[i];
      const line = document.createElement('div');
      line.style.cssText = `margin-bottom: 1px; padding: 1px 4px; border-radius: 2px; user-select: none;`;

      switch (event.type) {
        case 'move': {
          const m = event.data;
          const isWhite = m.color === 'w';
          const isSelected = this.selectedIdx === i;
          line.style.cssText += `
            cursor: pointer;
            color: ${isWhite ? '#e8e8f0' : '#b0c4d8'};
            background: ${isSelected ? '#3a4a6a' : 'transparent'};
          `;
          // Indent black moves slightly
          const prefix = isWhite ? `${m.turnNumber}.` : `${m.turnNumber}…`;
          const indent = isWhite ? '' : '  ';
          line.textContent = `${indent}${prefix} ${m.algebraic}`;

          if (event.boardAfter) {
            const snap = event.boardAfter;
            const idx = i;
            line.addEventListener('mouseenter', () => {
              if (!isSelected) line.style.background = '#2a3a52';
            });
            line.addEventListener('mouseleave', () => {
              if (this.selectedIdx !== idx) line.style.background = 'transparent';
            });
            line.addEventListener('click', () => {
              this.selectedIdx = idx;
              this.followLatest = false;
              this.render(state);
              this.onMoveClick?.(snap);
            });
          }
          break;
        }
        case 'cardPlay': {
          const cp = event.data;
          const matDiff = (cp.materialAfter.w - cp.materialBefore.w) - (cp.materialAfter.b - cp.materialBefore.b);
          const swing = matDiff !== 0 ? ` (${matDiff > 0 ? '+' : ''}${matDiff})` : '';
          line.style.color = cp.playedBy === 'w' ? '#f0d060' : '#f0a030';
          line.textContent = `  🃏 ${cp.playedBy === 'w' ? 'W' : 'B'} plays ${cp.cardName}${swing}`;
          break;
        }
        case 'cardDraw': {
          const cd = event.data;
          line.style.color = '#6aacff';
          line.textContent = `  ↑ ${cd.color === 'w' ? 'W' : 'B'} draws ${cd.card.definition.name}`;
          break;
        }
        case 'cardDiscard': {
          const cd = event.data;
          line.style.color = '#888';
          line.textContent = `  ↓ ${cd.color === 'w' ? 'W' : 'B'} discards ${cd.card.definition.name}`;
          break;
        }
        case 'gameOver': {
          const go = event.data;
          line.style.cssText += `color: #ff9966; font-weight: bold;`;
          line.textContent = go.winner
            ? `  ★ ${go.winner === 'w' ? 'White' : 'Black'} wins (${go.reason})`
            : `  ½-½ Draw (${go.reason})`;
          break;
        }
      }

      this.container.appendChild(line);
    }

    if (this.followLatest) {
      this.container.scrollTop = this.container.scrollHeight;
    } else if (this.selectedIdx !== null) {
      // Scroll selected row into view
      const rows = this.container.children;
      if (rows[this.selectedIdx]) {
        (rows[this.selectedIdx] as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    }
  }

  /** Reset selection and resume auto-follow (call when a new game starts) */
  reset(): void {
    this.selectedIdx = null;
    this.followLatest = true;
  }
}
