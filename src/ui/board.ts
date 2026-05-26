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
  /** Last board we rendered — used to diff against the new board so we can
   * animate every piece movement (including card-induced ones like Trade,
   * Teleport, Swap, Pawn Storm). */
  private prevBoard: (string | null)[] | null = null;
  /** Squares we should NOT paint a piece on this frame (because an
   * animated overlay is mid-flight, e.g. the destination of a slide). */
  private suppressedSquares = new Set<Square>();
  private animationsEnabled = true;

  constructor(container: HTMLElement, options: { interactive?: boolean; animations?: boolean } = {}) {
    this.container = container;
    this.interactive = options.interactive ?? false;
    // Default animations on, but disable when the OS prefers reduced motion.
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.animationsEnabled = (options.animations ?? true) && !prefersReduced;
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
    const last = state.superState.lastMove;

    // Compute per-piece animations by diffing the previous board against the
    // new one. This handles BOTH normal chess moves AND card-induced
    // movements (Trade, Teleport, Swap, Pawn Storm, Resurrection, Coup, ...)
    // uniformly.
    const slides = this.animationsEnabled && this.prevBoard
      ? diffBoardForSlides(this.prevBoard, state.chess.board)
      : { slides: [], appearances: [], disappearances: [] };

    this.suppressedSquares.clear();
    for (const s of slides.slides) this.suppressedSquares.add(s.to);
    for (const a of slides.appearances) this.suppressedSquares.add(a.sq);

    this.drawBoard(state.chess, {
      orientation,
      frozen: state.superState.frozenSquares,
      shielded: state.superState.shieldedSquares,
      foul: state.superState.foulSquares,
      lastFrom: last?.from ?? null,
      lastTo: last?.to ?? null,
      selected: opts.selectedSquare ?? null,
      legal: new Set(opts.legalDestinations ?? []),
      cardTargets: new Set(opts.cardTargetSquares ?? []),
      checkSq: opts.checkSquare ?? null,
    });

    for (const s of slides.slides) {
      this.animateSlide(s.from, s.to, s.piece, orientation);
    }
    for (const a of slides.appearances) {
      this.animateAppear(a.sq, a.piece, orientation);
    }
    for (const d of slides.disappearances) {
      this.animateVanish(d.sq, d.piece, orientation);
    }

    this.prevBoard = [...state.chess.board];
  }

  /**
   * Slide a piece from its `from` square to its `to` square as a temporary
   * overlay. We rely on the next `renderWith()` call to wipe the SVG (since
   * `drawBoard` already does `removeChild`-in-a-loop at the top) — that means
   * we don't need to remove the overlay manually. The overlay just sits at
   * its final position until the next render lands.
   *
   * To avoid showing the piece twice (overlay AND static glyph on the
   * destination), drawBoard skips the destination square on the first frame
   * after a new move (driven by suppressedSquares).
   */
  private animateSlide(from: Square, to: Square, piece: string, orientation: PieceColor): void {
    const fromCoords = this.squareXY(from, orientation);
    const toCoords = this.squareXY(to, orientation);
    const dx = toCoords.x - fromCoords.x;
    const dy = toCoords.y - fromCoords.y;

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(fromCoords.x + this.sqSize / 2));
    text.setAttribute('y', String(fromCoords.y + this.sqSize / 2 + 14));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '44');
    text.setAttribute('pointer-events', 'none');
    text.setAttribute('style', 'filter: drop-shadow(0 4px 3px rgba(0,0,0,0.55));');
    text.textContent = UNICODE_PIECES[piece] ?? piece;
    text.style.transition = 'transform 320ms cubic-bezier(.25,.85,.3,1)';
    text.style.transform = 'translate(0px, 0px)';
    this.svg.appendChild(text);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        text.style.transform = `translate(${dx}px, ${dy}px)`;
      });
    });
  }

  /** Piece appears out of thin air (Resurrection, Pawn Storm into a fresh
   * square, etc.). Briefly scale up with a golden glow so it draws the eye. */
  private animateAppear(sq: Square, piece: string, orientation: PieceColor): void {
    const { x, y } = this.squareXY(sq, orientation);

    // Pulsing glow ring underneath.
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const inset = 3;
    ring.setAttribute('x', String(x + inset));
    ring.setAttribute('y', String(y + inset));
    ring.setAttribute('width', String(this.sqSize - inset * 2));
    ring.setAttribute('height', String(this.sqSize - inset * 2));
    ring.setAttribute('rx', '6');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', THEME.accent);
    ring.setAttribute('stroke-width', '3');
    ring.setAttribute('pointer-events', 'none');
    ring.style.opacity = '0';
    ring.style.transition = 'opacity 360ms ease-out';
    this.svg.appendChild(ring);

    // Piece glyph itself, scaling up.
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(x + this.sqSize / 2));
    text.setAttribute('y', String(y + this.sqSize / 2 + 14));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '44');
    text.setAttribute('pointer-events', 'none');
    text.setAttribute('style', 'filter: drop-shadow(0 2px 1px rgba(0,0,0,0.45));');
    text.textContent = UNICODE_PIECES[piece] ?? piece;
    text.style.transformOrigin = `${x + this.sqSize / 2}px ${y + this.sqSize / 2}px`;
    text.style.transform = 'scale(0.4)';
    text.style.opacity = '0';
    text.style.transition = 'transform 360ms cubic-bezier(.34,1.56,.64,1), opacity 240ms ease-out';
    this.svg.appendChild(text);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        text.style.transform = 'scale(1)';
        text.style.opacity = '1';
        ring.style.opacity = '0.9';
        // fade ring out after the pulse
        setTimeout(() => { ring.style.opacity = '0'; }, 280);
      });
    });
  }

  /** Piece vanishes (Coup removal, captured piece during a normal move). */
  private animateVanish(sq: Square, piece: string, orientation: PieceColor): void {
    const { x, y } = this.squareXY(sq, orientation);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(x + this.sqSize / 2));
    text.setAttribute('y', String(y + this.sqSize / 2 + 14));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '44');
    text.setAttribute('pointer-events', 'none');
    text.setAttribute('style', 'filter: drop-shadow(0 2px 1px rgba(0,0,0,0.45));');
    text.textContent = UNICODE_PIECES[piece] ?? piece;
    text.style.transformOrigin = `${x + this.sqSize / 2}px ${y + this.sqSize / 2}px`;
    text.style.opacity = '1';
    text.style.transform = 'scale(1)';
    text.style.transition = 'transform 240ms ease-in, opacity 240ms ease-in';
    this.svg.appendChild(text);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        text.style.transform = 'scale(0.3)';
        text.style.opacity = '0';
      });
    });
  }

  private squareXY(sq: Square, orientation: PieceColor): { x: number; y: number } {
    const [row, col] = squareToRC(sq);
    const drawRow = orientation === 'w' ? row : 7 - row;
    const drawCol = orientation === 'w' ? col : 7 - col;
    return { x: drawCol * this.sqSize, y: drawRow * this.sqSize };
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

      // Piece (suppressed while a slide animation is delivering one here).
      const piece = chess.board[sq];
      if (piece && !this.suppressedSquares.has(sq)) {
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

interface BoardDiff {
  /** Pieces that moved from one square to another (paired by nearest match). */
  slides: Array<{ from: Square; to: Square; piece: string }>;
  /** Pieces that appeared (no matching disappearance). */
  appearances: Array<{ sq: Square; piece: string }>;
  /** Pieces that disappeared (no matching appearance). */
  disappearances: Array<{ sq: Square; piece: string }>;
}

/**
 * Diff two boards and return a list of slide/appear/vanish events for
 * animation. Slides are formed by pairing each "appeared" piece with the
 * NEAREST "disappeared" piece of the same color+type — works correctly for:
 *  - normal moves (1 disappear + 1 appear)
 *  - captures (capturing piece slides, captured piece vanishes)
 *  - Pawn Storm (8 same-color pawns, each pairs with its nearest source)
 *  - Teleport, Swap, Retreat (single piece moves)
 *  - Trade (a wP and a bP swap; pairs by color+type)
 *  - Promotion (pawn disappears, queen appears — left as appear+vanish
 *    since types differ; visually a pawn pops out and a queen pops in)
 *  - Resurrection (piece appears with no source)
 *  - Coup (piece disappears with no destination)
 */
function diffBoardForSlides(
  prev: (string | null)[],
  next: (string | null)[],
): BoardDiff {
  const appeared: Array<{ sq: Square; piece: string }> = [];
  const disappeared: Array<{ sq: Square; piece: string }> = [];

  for (let i = 0; i < 64; i++) {
    const p0 = prev[i];
    const p1 = next[i];
    if (p0 === p1) continue;
    if (p0 !== null) disappeared.push({ sq: i as Square, piece: p0 });
    if (p1 !== null) appeared.push({ sq: i as Square, piece: p1 });
  }

  const slides: Array<{ from: Square; to: Square; piece: string }> = [];
  const usedDisappeared = new Set<number>();

  // Pair each appearance with its nearest same-piece disappearance.
  for (const a of appeared) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < disappeared.length; i++) {
      if (usedDisappeared.has(i)) continue;
      if (disappeared[i].piece !== a.piece) continue;
      const dist = chebyshev(disappeared[i].sq, a.sq);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      usedDisappeared.add(bestIdx);
      slides.push({ from: disappeared[bestIdx].sq, to: a.sq, piece: a.piece });
    }
  }

  const finalAppearances = appeared.filter(
    (a) => !slides.some((s) => s.to === a.sq),
  );
  const finalDisappearances = disappeared.filter((_, i) => !usedDisappeared.has(i));

  return { slides, appearances: finalAppearances, disappearances: finalDisappearances };
}

function chebyshev(a: Square, b: Square): number {
  const ar = a >> 3, ac = a & 7;
  const br = b >> 3, bc = b & 7;
  return Math.max(Math.abs(ar - br), Math.abs(ac - bc));
}
