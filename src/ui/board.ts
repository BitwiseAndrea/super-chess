// src/ui/board.ts
// SVG-based chess board renderer
import type { SuperChessState } from '../game/types.ts';
import type { ChessState } from '../engine/types.ts';
import { squareToRC } from '../engine/board.ts';
import { THEME } from './theme.ts';

const UNICODE_PIECES: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

export class BoardRenderer {
  private svg: SVGSVGElement;
  private size = 400;
  private sqSize = 50;

  constructor(container: HTMLElement) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${this.size} ${this.size}`);
    this.svg.style.width = '100%';
    this.svg.style.maxWidth = `${this.size}px`;
    this.svg.style.display = 'block';
    container.appendChild(this.svg);
  }

  render(state: SuperChessState): void {
    const { chess, superState } = state;
    this.draw(chess, superState.frozenSquares, superState.shieldedSquares, superState.foulSquares, superState.lastMove?.from ?? null, superState.lastMove?.to ?? null);
  }

  /** Render a bare ChessState snapshot (for log navigation — no overlays) */
  renderChess(chess: ChessState): void {
    this.draw(chess, new Map(), new Map(), new Map(), null, null);
  }

  private draw(
    chess: ChessState,
    frozenSquares: Map<number, number>,
    shieldedSquares: Map<number, string>,
    foulSquares: Map<number, string>,
    lastFrom: number | null,
    lastTo: number | null,
  ): void {
    this.svg.innerHTML = '';

    for (let sq = 0; sq < 64; sq++) {
      const [row, col] = squareToRC(sq);
      const x = col * this.sqSize;
      const y = row * this.sqSize;
      const isLight = (row + col) % 2 === 0;

      // Background square
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(this.sqSize));
      rect.setAttribute('height', String(this.sqSize));
      rect.setAttribute('fill', isLight ? THEME.light : THEME.dark);
      this.svg.appendChild(rect);

      // Last move highlight
      if (lastFrom === sq || lastTo === sq) {
        const hl = rect.cloneNode() as SVGRectElement;
        hl.setAttribute('fill', lastFrom === sq ? THEME.lastMoveFrom : THEME.lastMoveTo);
        this.svg.appendChild(hl);
      }

      // Special overlays
      if (frozenSquares.has(sq)) {
        this.addOverlay(x, y, THEME.frozen, '❄');
      }
      if (shieldedSquares.has(sq)) {
        this.addOverlay(x, y, THEME.shielded, '🛡');
      }
      if ([...foulSquares.values()].length > 0 && foulSquares.has(sq)) {
        this.addOverlay(x, y, THEME.foul, '⛔');
      }

      // Piece
      const piece = chess.board[sq];
      if (piece) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(x + this.sqSize / 2));
        text.setAttribute('y', String(y + this.sqSize / 2 + 12));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '32');
        text.setAttribute('style', 'filter: drop-shadow(1px 1px 1px #0008)');
        text.textContent = UNICODE_PIECES[piece] ?? piece;
        this.svg.appendChild(text);
      }
    }

    // Rank/file labels
    for (let i = 0; i < 8; i++) {
      this.addLabel(String(8 - i), 2, i * this.sqSize + this.sqSize / 2 + 4, '#666');
      this.addLabel(String.fromCharCode(97 + i), i * this.sqSize + this.sqSize / 2, this.size - 2, '#666');
    }
  }

  private addOverlay(x: number, y: number, fill: string, emoji: string): void {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(this.sqSize));
    rect.setAttribute('height', String(this.sqSize));
    rect.setAttribute('fill', fill);
    this.svg.appendChild(rect);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(x + this.sqSize - 8));
    text.setAttribute('y', String(y + 14));
    text.setAttribute('font-size', '12');
    text.textContent = emoji;
    this.svg.appendChild(text);
  }

  private addLabel(text: string, x: number, y: number, fill: string): void {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    el.setAttribute('font-size', '10');
    el.setAttribute('fill', fill);
    el.textContent = text;
    this.svg.appendChild(el);
  }
}
