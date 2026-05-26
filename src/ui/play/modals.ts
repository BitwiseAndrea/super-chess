// src/ui/play/modals.ts
// Small overlay UIs for promotion + Disrupt piece-type pickers.

import type { PieceColor, PieceType, PieceStr } from '../../engine/types.ts';
import { THEME } from '../theme.ts';

const UNICODE: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

function overlay(): HTMLElement {
  const o = document.createElement('div');
  o.style.cssText = `
    position: fixed; inset: 0; z-index: 999;
    background: rgba(8, 5, 3, 0.55);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    animation: scFade 180ms ease;
  `;
  return o;
}

function modal(): HTMLElement {
  const m = document.createElement('div');
  m.style.cssText = `
    background: ${THEME.panelSoft};
    border: 1px solid ${THEME.border};
    border-radius: 14px;
    padding: 24px 28px;
    color: ${THEME.textPrimary};
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.55);
    text-align: center;
    max-width: 480px;
  `;
  return m;
}

export function showPromotionPicker(color: PieceColor): Promise<PieceType> {
  return new Promise((resolve) => {
    const o = overlay();
    const m = modal();

    const title = document.createElement('div');
    title.style.cssText = `
      font-size: 13px; letter-spacing: 0.24em; text-transform: uppercase;
      color: ${THEME.textMuted}; margin-bottom: 14px;
    `;
    title.textContent = 'choose promotion';
    m.appendChild(title);

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 12px; justify-content: center;';
    const types: PieceType[] = ['Q', 'R', 'B', 'N'];
    for (const t of types) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        width: 76px; height: 88px;
        border-radius: 10px;
        background: ${THEME.panel};
        border: 1px solid ${THEME.border};
        color: ${THEME.textPrimary};
        font-size: 44px;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 4px;
        transition: transform 180ms cubic-bezier(.2,.7,.2,1), border-color 180ms;
      `;
      const glyph = document.createElement('span');
      glyph.textContent = UNICODE[(color as string) + t];
      btn.appendChild(glyph);
      const label = document.createElement('span');
      label.style.cssText = `
        font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
        color: ${THEME.textMuted}; font-family: system-ui, sans-serif;
      `;
      label.textContent =
        t === 'Q' ? 'queen' :
        t === 'R' ? 'rook' :
        t === 'B' ? 'bishop' : 'knight';
      btn.appendChild(label);
      btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'translateY(-3px)';
        btn.style.borderColor = THEME.accent;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translateY(0)';
        btn.style.borderColor = THEME.border;
      });
      btn.addEventListener('click', () => {
        document.body.removeChild(o);
        resolve(t);
      });
      row.appendChild(btn);
    }
    m.appendChild(row);
    o.appendChild(m);
    document.body.appendChild(o);
  });
}

export function showPieceTypePicker(opts: {
  title?: string;
  color: PieceColor;
  onCancel?: () => void;
}): Promise<PieceType | null> {
  return new Promise((resolve) => {
    const o = overlay();
    const m = modal();

    const title = document.createElement('div');
    title.style.cssText = `
      font-size: 13px; letter-spacing: 0.24em; text-transform: uppercase;
      color: ${THEME.textMuted}; margin-bottom: 14px;
    `;
    title.textContent = opts.title ?? 'force opponent to move a…';
    m.appendChild(title);

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;';
    const oppColor: PieceColor = opts.color === 'w' ? 'b' : 'w';
    const types: PieceType[] = ['P', 'N', 'B', 'R', 'Q'];
    for (const t of types) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        width: 70px; height: 82px;
        border-radius: 10px;
        background: ${THEME.panel};
        border: 1px solid ${THEME.border};
        color: ${THEME.textPrimary};
        font-size: 38px;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 2px;
        transition: transform 180ms cubic-bezier(.2,.7,.2,1), border-color 180ms;
      `;
      const glyph = document.createElement('span');
      glyph.textContent = UNICODE[(oppColor as string) + t];
      btn.appendChild(glyph);
      const label = document.createElement('span');
      label.style.cssText = `
        font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase;
        color: ${THEME.textMuted}; font-family: system-ui, sans-serif;
      `;
      label.textContent =
        t === 'P' ? 'pawn' :
        t === 'N' ? 'knight' :
        t === 'B' ? 'bishop' :
        t === 'R' ? 'rook' : 'queen';
      btn.appendChild(label);
      btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'translateY(-3px)';
        btn.style.borderColor = THEME.accent;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translateY(0)';
        btn.style.borderColor = THEME.border;
      });
      btn.addEventListener('click', () => {
        document.body.removeChild(o);
        resolve(t);
      });
      row.appendChild(btn);
    }
    m.appendChild(row);

    const cancel = document.createElement('button');
    cancel.className = 'sc-btn';
    cancel.style.marginTop = '18px';
    cancel.textContent = 'cancel';
    cancel.addEventListener('click', () => {
      document.body.removeChild(o);
      opts.onCancel?.();
      resolve(null);
    });
    m.appendChild(cancel);

    o.appendChild(m);
    document.body.appendChild(o);
  });
}

export function showGameOverModal(opts: {
  winner: PieceColor | null;
  reason: string;
  humanColor: PieceColor;
  totalMoves: number;
  onNewGame: () => void;
  onClose?: () => void;
}): void {
  const o = overlay();
  const m = modal();
  m.style.padding = '32px 36px';
  m.style.maxWidth = '440px';

  const outcome =
    opts.winner === null
      ? 'draw'
      : opts.winner === opts.humanColor
        ? 'you win'
        : 'you lose';

  const eyebrow = document.createElement('div');
  eyebrow.style.cssText = `
    font-size: 11px; letter-spacing: 0.32em; text-transform: uppercase;
    color: ${THEME.textMuted}; margin-bottom: 8px;
  `;
  eyebrow.textContent = 'game over';
  m.appendChild(eyebrow);

  const title = document.createElement('h2');
  title.style.cssText = `
    font-size: 48px; line-height: 1.05; font-weight: 400;
    margin: 0 0 14px;
    color: ${outcome === 'you win' ? THEME.accent : outcome === 'you lose' ? THEME.accentDanger : THEME.textPrimary};
  `;
  title.textContent = outcome;
  m.appendChild(title);

  const sub = document.createElement('p');
  sub.style.cssText = `
    font-size: 14px; line-height: 1.55;
    color: ${THEME.textSecondary};
    margin: 0 0 22px;
    font-family: system-ui, sans-serif;
  `;
  const niceReason =
    opts.reason === 'checkmate' ? 'checkmate'
    : opts.reason === 'stalemate' ? 'stalemate'
    : opts.reason === '50-move' ? '50-move draw rule'
    : opts.reason === 'repetition' ? 'threefold repetition'
    : opts.reason === 'move-limit' ? 'move limit reached'
    : opts.reason;
  sub.textContent = `${niceReason} · ${opts.totalMoves} total moves`;
  m.appendChild(sub);

  const row = document.createElement('div');
  row.style.cssText = 'display: flex; gap: 10px; justify-content: center;';

  const newBtn = document.createElement('button');
  newBtn.className = 'sc-btn sc-btn--primary';
  newBtn.textContent = 'new game';
  newBtn.addEventListener('click', () => {
    document.body.removeChild(o);
    opts.onNewGame();
  });
  row.appendChild(newBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'sc-btn';
  closeBtn.textContent = 'review board';
  closeBtn.addEventListener('click', () => {
    document.body.removeChild(o);
    opts.onClose?.();
  });
  row.appendChild(closeBtn);

  m.appendChild(row);
  o.appendChild(m);
  document.body.appendChild(o);
}
