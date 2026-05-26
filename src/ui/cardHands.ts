// src/ui/cardHands.ts
// Renders both players' card hands.
//
// In simulate mode both hands are visible (caller passes mode: 'show-all').
// In play mode the opponent's hand is hidden — the count + rarity backs only.
import type { SuperChessState } from '../game/types.ts';
import type { CardInstance } from '../cards/types.ts';
import type { PieceColor } from '../engine/types.ts';
import { THEME } from './theme.ts';

export type HandsMode =
  | { kind: 'show-all' }
  | { kind: 'play'; humanColor: PieceColor };

export interface CardHandsOptions {
  state: SuperChessState;
  mode?: HandsMode;
  selectedCardId?: string | null;   // currently being targeted
  playableForColor?: PieceColor | null; // only this color can click cards
}

export interface CardHandsHandlers {
  onCardClick?: (card: CardInstance, color: PieceColor) => void;
}

export class CardHandsRenderer {
  private container: HTMLElement;
  private handlers: CardHandsHandlers = {};

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.gap = '12px';
  }

  setHandlers(handlers: CardHandsHandlers): void {
    this.handlers = handlers;
  }

  /** Backward-compat: full reveal (simulate mode). */
  render(state: SuperChessState): void {
    this.renderWith({ state, mode: { kind: 'show-all' } });
  }

  renderWith(opts: CardHandsOptions): void {
    const { state } = opts;
    const mode: HandsMode = opts.mode ?? { kind: 'show-all' };

    this.container.innerHTML = '';

    // Order: opponent on top, you on bottom (in play mode).
    if (mode.kind === 'play') {
      const opp: PieceColor = mode.humanColor === 'w' ? 'b' : 'w';
      const oppHand = opp === 'w' ? state.deck.hand.white : state.deck.hand.black;
      const youHand = mode.humanColor === 'w' ? state.deck.hand.white : state.deck.hand.black;
      this.container.appendChild(
        this.buildOpponentHand(opp, oppHand.length),
      );
      this.container.appendChild(
        this.buildOwnHand(mode.humanColor, youHand, opts.selectedCardId ?? null, opts.playableForColor === mode.humanColor),
      );
    } else {
      this.container.appendChild(
        this.buildOwnHand('b', state.deck.hand.black, null, false, true),
      );
      this.container.appendChild(
        this.buildOwnHand('w', state.deck.hand.white, null, false, true),
      );
    }
  }

  /** Single-side render. Used by play mode to put opp on top, you on bottom. */
  renderSide(opts: {
    state: SuperChessState;
    side: PieceColor;
    humanColor: PieceColor;
    selectedCardId?: string | null;
    playable?: boolean;
  }): void {
    this.container.innerHTML = '';
    const hand = opts.side === 'w' ? opts.state.deck.hand.white : opts.state.deck.hand.black;
    if (opts.side === opts.humanColor) {
      this.container.appendChild(
        this.buildOwnHand(opts.side, hand, opts.selectedCardId ?? null, !!opts.playable),
      );
    } else {
      this.container.appendChild(this.buildOpponentHand(opts.side, hand.length));
    }
  }

  private buildOpponentHand(color: PieceColor, count: number): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      display: flex; flex-direction: column; gap: 6px;
      padding: 10px 12px;
      background: ${THEME.panel};
      border: 1px solid ${THEME.border};
      border-radius: 12px;
    `;

    const label = document.createElement('div');
    label.style.cssText = `
      font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
      color: ${THEME.textMuted};
    `;
    label.textContent = `${color === 'w' ? 'white' : 'black'} (opponent) · ${count} card${count === 1 ? '' : 's'}`;
    wrap.appendChild(label);

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 6px;';
    if (count === 0) {
      const empty = document.createElement('span');
      empty.style.cssText = `
        font-size: 12px; color: ${THEME.textMuted};
        font-style: italic; padding: 6px 0;
      `;
      empty.textContent = 'no cards';
      row.appendChild(empty);
    } else {
      for (let i = 0; i < count; i++) row.appendChild(this.buildCardBack());
    }
    wrap.appendChild(row);
    return wrap;
  }

  private buildCardBack(): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = `
      width: 44px; height: 62px;
      border-radius: 7px;
      background:
        repeating-linear-gradient(135deg, #4a3525 0 6px, #3a2a1c 6px 12px);
      border: 1px solid #6a4a30;
      box-shadow: inset 0 0 0 2px #2a1d12;
      position: relative;
    `;
    const star = document.createElement('div');
    star.textContent = '✦';
    star.style.cssText = `
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      color: rgba(244, 199, 90, 0.55);
      font-size: 18px;
    `;
    el.appendChild(star);
    return el;
  }

  private buildOwnHand(
    color: PieceColor,
    hand: CardInstance[],
    selectedId: string | null,
    playable: boolean,
    isSimMode = false,
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      display: flex; flex-direction: column; gap: 8px;
      padding: 12px;
      background: ${THEME.panel};
      border: 1px solid ${THEME.border};
      border-radius: 12px;
    `;

    const label = document.createElement('div');
    label.style.cssText = `
      font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
      color: ${THEME.textMuted};
    `;
    label.textContent = isSimMode
      ? `${color === 'w' ? 'white' : 'black'} · ${hand.length} card${hand.length === 1 ? '' : 's'}`
      : `your hand · ${hand.length} card${hand.length === 1 ? '' : 's'}`;
    wrap.appendChild(label);

    if (hand.length === 0) {
      const empty = document.createElement('span');
      empty.style.cssText = `
        font-size: 12px; color: ${THEME.textMuted};
        font-style: italic; padding: 6px 0;
      `;
      empty.textContent = 'no cards in hand';
      wrap.appendChild(empty);
      return wrap;
    }

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px;';
    for (const card of hand) {
      row.appendChild(this.buildCard(card, color, selectedId === card.id, playable));
    }
    wrap.appendChild(row);
    return wrap;
  }

  private buildCard(
    card: CardInstance,
    color: PieceColor,
    selected: boolean,
    playable: boolean,
  ): HTMLElement {
    const rarity = card.definition.rarity;
    const ringColor = {
      common: THEME.cardCommon,
      uncommon: THEME.cardUncommon,
      rare: THEME.cardRare,
    }[rarity];
    const bg = {
      common: THEME.cardCommonBg,
      uncommon: THEME.cardUncommonBg,
      rare: THEME.cardRareBg,
    }[rarity];

    const el = document.createElement('div');
    el.style.cssText = `
      width: 138px;
      padding: 10px 12px 12px;
      border-radius: 10px;
      background: ${bg};
      border: 2px solid ${selected ? THEME.accent : ringColor};
      box-shadow:
        ${selected ? `0 0 0 3px rgba(244, 199, 90, 0.35), ` : ''}
        0 6px 14px rgba(0, 0, 0, 0.35);
      color: #1f1a15;
      transform: translateY(${selected ? '-6px' : '0'});
      transition: transform 200ms cubic-bezier(.2,.7,.2,1), box-shadow 200ms ease, border-color 200ms ease;
      ${playable ? 'cursor: pointer;' : 'cursor: default; opacity: 0.78;'}
      position: relative;
      user-select: none;
    `;
    el.title = card.definition.rulesText;

    // Rarity badge
    const badge = document.createElement('span');
    badge.style.cssText = `
      position: absolute; top: 6px; right: 8px;
      font-size: 8px; letter-spacing: 0.16em; text-transform: uppercase;
      color: ${ringColor};
      font-weight: 700;
    `;
    badge.textContent = rarity;
    el.appendChild(badge);

    const emoji = document.createElement('div');
    emoji.style.cssText = `
      font-size: 30px;
      line-height: 1;
      margin: 6px 0 4px;
      text-align: center;
    `;
    emoji.textContent = card.definition.emoji;
    el.appendChild(emoji);

    const name = document.createElement('div');
    name.style.cssText = `
      font-size: 13px; font-weight: 600;
      text-align: center;
      letter-spacing: 0.01em;
      line-height: 1.2;
      margin-bottom: 6px;
    `;
    name.textContent = card.definition.name;
    el.appendChild(name);

    const desc = document.createElement('div');
    desc.style.cssText = `
      font-size: 10.5px;
      line-height: 1.35;
      color: #4a3a2a;
      text-align: center;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    desc.textContent = card.definition.shortDesc;
    el.appendChild(desc);

    if (playable) {
      el.addEventListener('click', () => this.handlers.onCardClick?.(card, color));
      el.addEventListener('mouseenter', () => {
        if (!selected) el.style.transform = 'translateY(-4px)';
      });
      el.addEventListener('mouseleave', () => {
        if (!selected) el.style.transform = 'translateY(0)';
      });
    }

    return el;
  }
}
