// src/ui/board.ts
// SVG-based chess board renderer with optional click handling, selection,
// legal-move dots, card-targeting highlights, and orientation flip.
import type { SuperChessState } from '../game/types.ts';
import type { ChessState, Square, Move, PieceColor } from '../engine/types.ts';
import { squareToRC } from '../engine/board.ts';
import { THEME } from './theme.ts';

const UNICODE_PIECES: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

export interface BoardRenderOptions {
  state: SuperChessState;
  orientation?: PieceColor;        // bottom-of-screen perspective; default 'w'
  selectedSquare?: Square | null;  // own piece selected — show ring + dots
  legalDestinations?: Square[];    // squares to highlight as legal moves
  cardTargetSquares?: Square[];    // squares highlighted as valid card targets
  checkSquare?: Square | null;     // king-in-check square (red tint)
}

export interface BoardClickHandlers {
  onSquareClick?: (sq: Square) => void;
}

export class BoardRenderer {
  private container: HTMLElement;
  private svg!: SVGSVGElement;
  private size = 480;
  private sqSize = 60;
  private handlers: BoardClickHandlers = {};
  private interactive: boolean;

  constructor(container: HTMLElement, options: { interactive?: boolean } = {}) {
    this.container = container;
    this.interactive = options.interactive ?? false;
    this.buildSvg();
  }

  private buildSvg(): void {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${this.size} ${this.size}`);
    this.svg.style.width = '100%';
    this.svg.style.maxWidth = `min(72vh, 540px)`;
    this.svg.style.display = 'block';
    this.svg.style.borderRadius = '8px';
    this.svg.style.boxShadow = '0 14px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.4)';
    this.svg.style.userSelect = 'none';
    if (this.interactive) {
      this.svg.style.cursor = 'pointer';
    }
    this.container.appendChild(this.svg);
  }

  setHandlers(handlers: BoardClickHandlers): void {
    this.handlers = handlers;
  }

  /** Backward-compat: render a SuperChessState with default options. */
  render(state: SuperChessState): void {
    this.renderWith({ state });
  }

  /** Render a bare ChessState snapshot (for log navigation — no overlays) */
  renderChess(chess: ChessState): void {
    this.drawBoard(chess, {
      orientation: 'w',
      frozen: new Map(),
      shielded: new Map(),
      foul: new Map(),
      lastFrom: null,
      lastTo: null,
      selected: null,
      legal: new Set(),
      cardTargets: new Set(),
      checkSq: null,
    });
  }

  renderWith(opts: BoardRenderOptions): void {
    const { state, orientation = 'w' } = opts;
    this.drawBoard(state.chess, {
      orientation,
      frozen: state.superState.frozenSquares,
      shielded: state.superState.shieldedSquares,
      foul: state.superState.foulSquares,
      lastFrom: state.superState.lastMove?.from ?? null,
      lastTo: state.superState.lastMove?.to ?? null,
      selected: opts.selectedSquare ?? null,
      legal: new Set(opts.legalDestinations ?? []),
      cardTargets: new Set(opts.cardTargetSquares ?? []),
      checkSq: opts.checkSquare ?? null,
    });
  }

  private drawBoard(
    chess: ChessState,
    o: {
      orientation: PieceColor;
      frozen: Map<Square, number>;
      shielded: Map<Square, PieceColor>;
      foul: Map<Square, PieceColor>;
      lastFrom: Square | null;
      lastTo: Square | null;
      selected: Square | null;
      legal: Set<Square>;
      cardTargets: Set<Square>;
      checkSq: Square | null;
    },
  ): void {
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);

    for (let sq = 0; sq < 64; sq++) {
      const [row, col] = squareToRC(sq);
      // Orientation: white = standard; black = flip both axes
      const drawRow = o.orientation === 'w' ? row : 7 - row;
      const drawCol = o.orientation === 'w' ? col : 7 - col;
      const x = drawCol * this.sqSize;
      const y = drawRow * this.sqSize;
      const isLight = (row + col) % 2 === 0;

      // Base square
      const fill = sq === o.selected
        ? (isLight ? THEME.lightSelected : THEME.darkSelected)
        : (isLight ? THEME.light : THEME.dark);
      this.addRect(x, y, fill, sq);

      // Last move tint
      if (o.lastFrom === sq || o.lastTo === sq) {
        const tint = o.lastFrom === sq ? THEME.lastMoveFrom : THEME.lastMoveTo;
        this.addRect(x, y, tint, sq);
      }

      // King-in-check tint
      if (o.checkSq === sq) {
        this.addRect(x, y, THEME.checkSquare, sq);
      }

      // Card-target tint
      if (o.cardTargets.has(sq)) {
        this.addRect(x, y, THEME.cardTarget, sq);
      }

      // Special overlays
      if (o.frozen.has(sq)) {
        this.addRect(x, y, THEME.frozen, sq);
        this.addCornerGlyph(x, y, '❄');
      }
      if (o.shielded.has(sq)) {
        this.addRect(x, y, THEME.shielded, sq);
        this.addCornerGlyph(x, y, '🛡');
      }
      if (o.foul.has(sq)) {
        this.addRect(x, y, THEME.foul, sq);
        this.addCornerGlyph(x, y, '⛔');
      }

      // Piece
      const piece = chess.board[sq];
      if (piece) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(x + this.sqSize / 2));
        text.setAttribute('y', String(y + this.sqSize / 2 + 14));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '44');
        text.setAttribute('pointer-events', 'none');
        text.setAttribute(
          'style',
          'filter: drop-shadow(0 2px 1px rgba(0,0,0,0.45));',
        );
        text.textContent = UNICODE_PIECES[piece] ?? piece;
        this.svg.appendChild(text);
      }

      // Selection ring (drawn on top so it's visible above piece)
      if (sq === o.selected) {
        this.addRing(x, y, THEME.legalRing, 3);
      }

      // Card-target ring
      if (o.cardTargets.has(sq)) {
        this.addRing(x, y, THEME.cardTargetRing, 2);
      }

      // Legal-move dot (or capture ring if there's a piece on the dest)
      if (o.legal.has(sq)) {
        if (piece) {
          this.addRing(x, y, THEME.legalRing, 4);
        } else {
          const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          dot.setAttribute('cx', String(x + this.sqSize / 2));
          dot.setAttribute('cy', String(y + this.sqSize / 2));
          dot.setAttribute('r', String(this.sqSize * 0.16));
          dot.setAttribute('fill', THEME.legalDot);
          dot.setAttribute('pointer-events', 'none');
          this.svg.appendChild(dot);
        }
      }
    }

    // Rank/file labels (corners only — less visual clutter)
    for (let i = 0; i < 8; i++) {
      const drawI = o.orientation === 'w' ? i : 7 - i;
      // ranks on left edge
      this.addLabel(
        String(8 - i),
        4,
        drawI * this.sqSize + 12,
        ((i + 0) % 2 === 0) ? THEME.dark : THEME.light,
      );
      // files on bottom edge
      this.addLabel(
        String.fromCharCode(97 + (o.orientation === 'w' ? i : 7 - i)),
        i * this.sqSize + this.sqSize - 10,
        this.size - 4,
        ((7 + i) % 2 === 0) ? THEME.dark : THEME.light,
      );
    }
  }

  private addRect(x: number, y: number, fill: string, sq: Square): void {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(this.sqSize));
    rect.setAttribute('height', String(this.sqSize));
    rect.setAttribute('fill', fill);
    if (this.interactive) {
      rect.style.cursor = 'pointer';
      rect.addEventListener('click', () => this.handlers.onSquareClick?.(sq));
    }
    this.svg.appendChild(rect);
  }

  private addRing(x: number, y: number, stroke: string, w: number): void {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const inset = w / 2 + 1;
    rect.setAttribute('x', String(x + inset));
    rect.setAttribute('y', String(y + inset));
    rect.setAttribute('width', String(this.sqSize - inset * 2));
    rect.setAttribute('height', String(this.sqSize - inset * 2));
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', String(w));
    rect.setAttribute('pointer-events', 'none');
    this.svg.appendChild(rect);
  }

  private addCornerGlyph(x: number, y: number, glyph: string): void {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(x + this.sqSize - 4));
    text.setAttribute('y', String(y + 14));
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('font-size', '13');
    text.setAttribute('pointer-events', 'none');
    text.textContent = glyph;
    this.svg.appendChild(text);
  }

  private addLabel(text: string, x: number, y: number, fill: string): void {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    el.setAttribute('font-size', '9');
    el.setAttribute('fill', fill);
    el.setAttribute('opacity', '0.65');
    el.setAttribute('pointer-events', 'none');
    el.textContent = text;
    this.svg.appendChild(el);
  }
}

/** Helper: extract legal destinations from a move list for a given source. */
export function destinationsFor(moves: Move[], from: Square): Square[] {
  const dests: Square[] = [];
  for (const m of moves) if (m.from === from) dests.push(m.to);
  return dests;
}
