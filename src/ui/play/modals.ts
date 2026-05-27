// src/ui/play/modals.ts
// Small overlay UIs for promotion + Disrupt piece-type pickers.

import type { PieceColor, PieceType, PieceStr } from '../../engine/types.ts';
import type { CardInstance } from '../../cards/types.ts';
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

/**
 * Hand-full picker. Shown when the player would draw a card but already has
 * a full hand. The three cards (two existing + one new) are laid out side by
 * side; the player clicks one to discard. Clicking the new card means
 * "reject the draw, keep my hand"; clicking an existing card means "swap
 * that one out for the new one".
 *
 * Resolves to the card that was chosen for discard. Escape rejects the new
 * card (same as clicking the incoming card).
 */
export function showHandFullPicker(opts: {
  existing: CardInstance[];
  incoming: CardInstance;
  reason: 'capture' | 'slowGame';
}): Promise<CardInstance> {
  return new Promise((resolve) => {
    const o = overlay();
    const m = modal();
    m.style.maxWidth = '620px';
    m.style.padding = '28px 32px 24px';

    const eyebrow = document.createElement('div');
    eyebrow.style.cssText = `
      font-size: 11px; letter-spacing: 0.32em; text-transform: uppercase;
      color: ${THEME.textMuted}; margin-bottom: 6px;
    `;
    eyebrow.textContent = opts.reason === 'capture'
      ? 'capture reward \u00b7 hand full'
      : 'slow-game draw \u00b7 hand full';
    m.appendChild(eyebrow);

    const title = document.createElement('div');
    title.style.cssText = `
      font-size: 22px; line-height: 1.2; font-weight: 500;
      color: ${THEME.textPrimary}; margin-bottom: 6px;
    `;
    title.textContent = `you drew ${opts.incoming.definition.emoji} ${opts.incoming.definition.name}`;
    m.appendChild(title);

    const sub = document.createElement('div');
    sub.style.cssText = `
      font-size: 13px; line-height: 1.5;
      color: ${THEME.textSecondary};
      margin-bottom: 18px;
      font-family: system-ui, sans-serif;
    `;
    sub.textContent = 'pick one card to discard. clicking the new card rejects the draw and keeps your hand.';
    m.appendChild(sub);

    const row = document.createElement('div');
    row.style.cssText = `
      display: flex; gap: 14px; justify-content: center; align-items: stretch;
    `;
    m.appendChild(row);

    const close = (chosen: CardInstance): void => {
      document.removeEventListener('keydown', escHandler);
      document.body.removeChild(o);
      resolve(chosen);
    };
    const escHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close(opts.incoming);
    };
    document.addEventListener('keydown', escHandler);

    // Card 1, Card 2, then NEW (with glow).
    const tiles = [
      { card: opts.existing[0], kind: 'existing' as const, label: 'in hand' },
      { card: opts.existing[1], kind: 'existing' as const, label: 'in hand' },
      { card: opts.incoming,    kind: 'incoming' as const, label: 'just drew' },
    ];
    for (const t of tiles) {
      if (!t.card) continue; // guard if hand is somehow size 1 here
      row.appendChild(renderTile(t.card, t.kind, t.label, () => close(t.card)));
    }

    const cancelHint = document.createElement('div');
    cancelHint.style.cssText = `
      font-size: 11px; letter-spacing: 0.06em;
      color: ${THEME.textMuted};
      margin-top: 16px;
      font-family: system-ui, sans-serif;
    `;
    cancelHint.textContent = 'esc \u00b7 reject the new card';
    m.appendChild(cancelHint);

    o.appendChild(m);
    document.body.appendChild(o);
  });
}

function renderTile(
  card: CardInstance,
  kind: 'existing' | 'incoming',
  caption: string,
  onClick: () => void,
): HTMLElement {
  const rarity = card.definition.rarity;
  const rarityColor = rarity === 'rare' ? THEME.cardRare
    : rarity === 'uncommon' ? THEME.cardUncommon
    : THEME.cardCommon;
  const bg = rarity === 'rare' ? THEME.cardRareBg
    : rarity === 'uncommon' ? THEME.cardUncommonBg
    : THEME.cardCommonBg;

  const wrap = document.createElement('div');
  wrap.style.cssText = `
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    flex: 1; min-width: 0;
  `;

  const tile = document.createElement('button');
  tile.style.cssText = `
    width: 100%;
    padding: 14px 12px 16px;
    border-radius: 12px;
    background: ${bg};
    border: 2px solid ${kind === 'incoming' ? THEME.accent : rarityColor};
    color: #1f1a15;
    cursor: pointer;
    transition: transform 200ms cubic-bezier(.2,.7,.2,1), box-shadow 200ms ease;
    font-family: inherit;
    text-align: center;
    ${kind === 'incoming'
      ? `box-shadow:
          0 0 0 4px color-mix(in srgb, var(--sc-accent) 30%, transparent),
          0 10px 24px rgba(0, 0, 0, 0.4);
         animation: scIncomingPulse 1.6s ease-in-out infinite;`
      : `box-shadow: 0 8px 16px rgba(0, 0, 0, 0.35);`}
  `;
  tile.title = card.definition.rulesText;

  const emoji = document.createElement('div');
  emoji.style.cssText = 'font-size: 38px; line-height: 1; margin-bottom: 6px;';
  emoji.textContent = card.definition.emoji;
  tile.appendChild(emoji);

  const name = document.createElement('div');
  name.style.cssText = `
    font-size: 14px; font-weight: 600;
    margin-bottom: 4px;
  `;
  name.textContent = card.definition.name;
  tile.appendChild(name);

  const rarityTag = document.createElement('div');
  rarityTag.style.cssText = `
    font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase;
    color: ${rarityColor};
    font-weight: 700;
    margin-bottom: 6px;
  `;
  rarityTag.textContent = rarity;
  tile.appendChild(rarityTag);

  const desc = document.createElement('div');
  desc.style.cssText = `
    font-size: 11px; line-height: 1.4;
    color: #4a3a2a;
    font-family: system-ui, sans-serif;
  `;
  desc.textContent = card.definition.shortDesc;
  tile.appendChild(desc);

  tile.addEventListener('mouseenter', () => {
    tile.style.transform = 'translateY(-4px)';
  });
  tile.addEventListener('mouseleave', () => {
    tile.style.transform = 'translateY(0)';
  });
  tile.addEventListener('click', onClick);
  wrap.appendChild(tile);

  const caption_ = document.createElement('div');
  caption_.style.cssText = `
    font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase;
    color: ${kind === 'incoming' ? THEME.accent : THEME.textMuted};
    font-family: system-ui, sans-serif;
    font-weight: ${kind === 'incoming' ? '600' : '400'};
  `;
  caption_.textContent = kind === 'incoming'
    ? `\u2728 ${caption} \u2014 click to discard`
    : `${caption} \u2014 click to discard`;
  wrap.appendChild(caption_);

  // Inject the pulse keyframes once.
  if (!document.getElementById('sc-incoming-anim')) {
    const sty = document.createElement('style');
    sty.id = 'sc-incoming-anim';
    sty.textContent = `
      @keyframes scIncomingPulse {
        0%, 100% { box-shadow:
          0 0 0 4px color-mix(in srgb, var(--sc-accent) 30%, transparent),
          0 10px 24px rgba(0, 0, 0, 0.4); }
        50% { box-shadow:
          0 0 0 6px color-mix(in srgb, var(--sc-accent) 45%, transparent),
          0 12px 26px rgba(0, 0, 0, 0.45); }
      }
    `;
    document.head.appendChild(sty);
  }

  return wrap;
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
