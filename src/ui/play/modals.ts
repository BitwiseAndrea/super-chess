// src/ui/play/modals.ts
// Small overlay UIs for promotion + Disrupt piece-type pickers.

import type { PieceColor, PieceType } from '../../engine/types.ts';
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
 * Hand-full picker. Shown when the player would draw a card but already
 * has a full hand. Single-screen flow: the new card sits at the top
 * (hero treatment), the existing hand below in a row, EVERYTHING is
 * clickable. The user just picks the card they want to discard \u2014
 * "keep" is an implicit consequence of not picking that card, not a
 * separate action. Escape rejects the new card (same as clicking it).
 *
 * Resolves to the card that was chosen for discard.
 */
export function showHandFullPicker(opts: {
  existing: CardInstance[];
  incoming: CardInstance;
}): Promise<CardInstance> {
  return new Promise((resolve) => {
    const o = overlay();
    const m = modal();
    m.style.maxWidth = '780px';
    m.style.padding = '28px 32px 24px';

    const eyebrow = document.createElement('div');
    eyebrow.style.cssText = `
      font-size: 11px; letter-spacing: 0.32em; text-transform: uppercase;
      color: ${THEME.textMuted}; margin-bottom: 6px;
    `;
    eyebrow.textContent = 'capture reward \u00b7 hand full';
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
      margin-bottom: 20px;
      font-family: system-ui, sans-serif;
    `;
    sub.textContent = 'pick a card to discard. the rest stay in your hand.';
    m.appendChild(sub);

    // ─── new card (hero, top) ───────────────────────────────────────
    // Clickable: clicking it = "discard the new card" (i.e. keep my
    // current hand intact). The pulse + accent ring keep the visual
    // distinction; the "click to discard" caption matches the hand
    // cards below so the affordance reads symmetrically.
    const newCardWrap = document.createElement('div');
    newCardWrap.style.cssText = 'display: flex; justify-content: center; margin-bottom: 4px;';
    const heroSlot = document.createElement('div');
    heroSlot.style.cssText = 'width: 180px;';
    heroSlot.appendChild(
      renderInteractiveTile(opts.incoming, () => close(opts.incoming), {
        emphasize: true,
        topCaption: 'just drew',
        bottomCaption: 'discard \u2014 keep my hand',
      }),
    );
    newCardWrap.appendChild(heroSlot);
    m.appendChild(newCardWrap);

    // ─── divider ────────────────────────────────────────────────────
    const divider = document.createElement('div');
    divider.style.cssText = `
      display: flex; align-items: center; gap: 12px;
      margin: 14px 0 14px;
      color: ${THEME.textMuted};
      font-family: system-ui, sans-serif;
      font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase;
    `;
    const dline1 = document.createElement('div');
    dline1.style.cssText = `flex: 1; height: 1px; background: ${THEME.border};`;
    const dword = document.createElement('span');
    dword.textContent = 'or swap with one of these';
    const dline2 = document.createElement('div');
    dline2.style.cssText = `flex: 1; height: 1px; background: ${THEME.border};`;
    divider.appendChild(dline1);
    divider.appendChild(dword);
    divider.appendChild(dline2);
    m.appendChild(divider);

    // ─── existing hand (interactive, bottom) ────────────────────────
    const handRow = document.createElement('div');
    handRow.style.cssText = `
      display: flex; gap: 10px; justify-content: center; align-items: stretch;
      flex-wrap: wrap;
    `;
    m.appendChild(handRow);

    for (const card of opts.existing) {
      const slot = document.createElement('div');
      slot.style.cssText = 'flex: 0 0 auto; width: 150px; display: flex; justify-content: center;';
      slot.appendChild(
        renderInteractiveTile(card, () => close(card), {
          emphasize: false,
          topCaption: 'in hand',
          bottomCaption: 'discard \u2014 take the new one',
        }),
      );
      handRow.appendChild(slot);
    }

    // ─── escape / cancel hint ───────────────────────────────────────
    const cancelHint = document.createElement('div');
    cancelHint.style.cssText = `
      font-size: 11px; letter-spacing: 0.06em;
      color: ${THEME.textMuted};
      margin-top: 18px;
      font-family: system-ui, sans-serif;
    `;
    cancelHint.textContent = 'esc \u00b7 discard the new card';
    m.appendChild(cancelHint);

    // ─── flow control ───────────────────────────────────────────────
    const close = (chosen: CardInstance): void => {
      document.removeEventListener('keydown', escHandler);
      document.body.removeChild(o);
      resolve(chosen);
    };
    const escHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close(opts.incoming);
    };
    document.addEventListener('keydown', escHandler);

    o.appendChild(m);
    document.body.appendChild(o);
  });
}

interface InteractiveTileOpts {
  /** When true, renders with the accent ring + pulse animation reserved
   * for the freshly-drawn card. Used for the hero slot in the hand-full
   * picker; existing-hand slots set this false so they don't fight for
   * attention. */
  emphasize: boolean;
  /** Caption above the tile, e.g. "just drew" or "in hand". Pure label. */
  topCaption: string;
  /** Caption below the tile that doubles as the click affordance, e.g.
   * "discard \u2014 keep my hand" / "discard \u2014 take the new one". */
  bottomCaption: string;
}

/** Clickable card tile. Renders as a button so keyboard navigation +
 * focus styling come for free. Resolves the parent flow with this
 * card on click. Used by the hand-full picker as the single building
 * block for both the new-card hero and the existing-hand row. */
function renderInteractiveTile(
  card: CardInstance,
  onClick: () => void,
  opts: InteractiveTileOpts,
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
    width: 100%;
  `;

  // Top caption \u2014 same line height in both modes so the hero and hand
  // tiles align vertically when shown together.
  const top = document.createElement('div');
  top.style.cssText = `
    font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase;
    color: ${opts.emphasize ? THEME.accent : THEME.textMuted};
    font-family: system-ui, sans-serif;
    font-weight: ${opts.emphasize ? '600' : '400'};
  `;
  top.textContent = opts.emphasize ? `\u2728 ${opts.topCaption}` : opts.topCaption;
  wrap.appendChild(top);

  const tile = document.createElement('button');
  tile.type = 'button';
  tile.style.cssText = `
    width: 100%;
    padding: 14px 12px 16px;
    border-radius: 12px;
    background: ${bg};
    border: 2px solid ${opts.emphasize ? THEME.accent : rarityColor};
    color: #1f1a15;
    cursor: pointer;
    transition: transform 200ms cubic-bezier(.2,.7,.2,1), box-shadow 200ms ease;
    font-family: inherit;
    text-align: center;
    ${opts.emphasize
      ? `box-shadow:
          0 0 0 4px color-mix(in srgb, var(--sc-accent) 30%, transparent),
          0 10px 24px rgba(0, 0, 0, 0.4);
         animation: scIncomingPulse 1.6s ease-in-out infinite;`
      : `box-shadow: 0 8px 16px rgba(0, 0, 0, 0.35);`}
  `;
  tile.title = card.definition.rulesText;
  populateTileContent(tile, card, rarityColor);

  // Hover lift. Both emphasize and non-emphasize get it \u2014 the user
  // needs the affordance signal regardless of which one they're
  // pointing at.
  const baseShadow = opts.emphasize
    ? `0 0 0 4px color-mix(in srgb, var(--sc-accent) 30%, transparent), 0 10px 24px rgba(0, 0, 0, 0.4)`
    : `0 8px 16px rgba(0, 0, 0, 0.35)`;
  const hoverShadow = opts.emphasize
    ? `0 0 0 6px color-mix(in srgb, var(--sc-accent) 45%, transparent), 0 14px 28px rgba(0, 0, 0, 0.5)`
    : `0 12px 22px rgba(0, 0, 0, 0.45)`;
  tile.addEventListener('mouseenter', () => {
    tile.style.transform = 'translateY(-4px)';
    tile.style.boxShadow = hoverShadow;
  });
  tile.addEventListener('mouseleave', () => {
    tile.style.transform = 'translateY(0)';
    tile.style.boxShadow = baseShadow;
  });
  tile.addEventListener('click', onClick);
  wrap.appendChild(tile);

  // Bottom caption \u2014 the discard affordance. We always color it accent
  // so the user reads it as the primary CTA on each card.
  const bottom = document.createElement('div');
  bottom.style.cssText = `
    font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
    color: ${THEME.accent};
    font-family: system-ui, sans-serif;
    font-weight: 600;
  `;
  bottom.textContent = opts.bottomCaption;
  wrap.appendChild(bottom);

  ensureIncomingAnimInjected();

  return wrap;
}

/** Shared body content for the card tile (emoji + name + rarity tag +
 * short description). Both the read-only and interactive renderers
 * call this so the visual stays identical between states. */
function populateTileContent(host: HTMLElement, card: CardInstance, rarityColor: string): void {
  const emoji = document.createElement('div');
  emoji.style.cssText = 'font-size: 38px; line-height: 1; margin-bottom: 6px;';
  emoji.textContent = card.definition.emoji;
  host.appendChild(emoji);

  const name = document.createElement('div');
  name.style.cssText = `
    font-size: 14px; font-weight: 600;
    margin-bottom: 4px;
  `;
  name.textContent = card.definition.name;
  host.appendChild(name);

  const rarityTag = document.createElement('div');
  rarityTag.style.cssText = `
    font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase;
    color: ${rarityColor};
    font-weight: 700;
    margin-bottom: 6px;
  `;
  rarityTag.textContent = card.definition.rarity;
  host.appendChild(rarityTag);

  const desc = document.createElement('div');
  desc.style.cssText = `
    font-size: 11px; line-height: 1.4;
    color: #4a3a2a;
    font-family: system-ui, sans-serif;
  `;
  desc.textContent = card.definition.shortDesc;
  host.appendChild(desc);
}

/** Inject the pulse keyframes once per page load. */
function ensureIncomingAnimInjected(): void {
  if (document.getElementById('sc-incoming-anim')) return;
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
