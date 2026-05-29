// src/ui/cardHands.ts
// Renders both players' card hands.
//
// In simulate mode both hands are visible (caller passes mode: 'show-all').
// In play mode the opponent's hand is hidden — the count + rarity backs only.
import type { SuperChessState } from '../game/types.ts';
import type { CardInstance } from '../cards/types.ts';
import type { PieceColor } from '../engine/types.ts';
import { THEME } from './theme.ts';
import { cardPhase as resolveCardPhase } from '../cards/definitions.ts';

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
    /** If true and side != humanColor, reveal opponent's cards face-up. */
    reveal?: boolean;
    /** Currently active turn-phase. When provided, cards whose definition
     * phase doesn't match are visually dimmed and given a tooltip
     * explaining why they can't be played right now. Click handlers stay
     * wired (the controller surfaces a banner explaining the refusal) so
     * the user can still discover the rule. */
    currentTurnPhase?: 'pre' | 'post';
  }): void {
    this.container.innerHTML = '';
    const hand = opts.side === 'w' ? opts.state.deck.hand.white : opts.state.deck.hand.black;
    if (opts.side === opts.humanColor) {
      this.container.appendChild(
        this.buildOwnHand(
          opts.side, hand, opts.selectedCardId ?? null, !!opts.playable, false, 'own',
          opts.currentTurnPhase,
        ),
      );
    } else if (opts.reveal) {
      this.container.appendChild(
        this.buildOwnHand(opts.side, hand, null, false, false, 'opp-revealed'),
      );
    } else {
      this.container.appendChild(this.buildOpponentHand(opts.side, hand.length));
    }
  }

  /** Build the meta-chips row: small pills showing duration, consumes-turn,
   * and capture indicators. Returns null if no chips would be shown
   * (e.g. a card with no `duration` declared and no flags). */
  private buildMetaChips(def: import('../cards/types.ts').CardDefinition): HTMLElement | null {
    const chips: Array<{ glyph: string; label: string; tone: 'neutral' | 'warn' | 'danger' }> = [];
    if (def.duration) {
      chips.push({ glyph: '\u23f1', label: def.duration, tone: 'neutral' });
    }
    if (def.consumesTurn) {
      chips.push({ glyph: '\u23f3', label: 'whole turn', tone: 'warn' });
    }
    // Always show a capture chip \u2014 either "can capture" (red) or
    // "no capture" (neutral). Consistency lets the player learn the
    // pattern: every card has the same three slots (duration, turn,
    // capture) and they're either positive, neutral, or absent.
    if (def.capture) {
      chips.push({ glyph: '\u00d7', label: 'can capture', tone: 'danger' });
    } else {
      chips.push({ glyph: '\u00d7', label: 'no capture', tone: 'neutral' });
    }
    if (chips.length === 0) return null;

    const row = document.createElement('div');
    row.style.cssText = `
      display: flex; flex-wrap: wrap; gap: 4px;
      justify-content: center;
      margin-top: 2px;
    `;
    for (const c of chips) {
      row.appendChild(buildChip(c.glyph, c.label, c.tone));
    }
    return row;
  }

  private buildOpponentHand(color: PieceColor, count: number): HTMLElement {
    const wrap = document.createElement('div');
    // Reserved min-height keeps the closed-hand strip a stable size as
    // their card count fluctuates each turn. Sized for one card-back
    // (62px) plus label + chrome.
    wrap.style.cssText = `
      display: flex; flex-direction: column; gap: 6px;
      padding: 10px 12px;
      min-height: 96px;
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
    kind: 'own' | 'opp-revealed' | 'sim' = isSimMode ? 'sim' : 'own',
    currentTurnPhase?: 'pre' | 'post',
  ): HTMLElement {
    const wrap = document.createElement('div');
    const dim = kind === 'opp-revealed';
    // Reserved min-height keeps the hand container at a stable size as
    // cards come and go each turn \u2014 otherwise the board jumps up/down
    // when the hand drops to 1 or 0 cards. Sized for a single full-height
    // card (138x168) plus label + chrome.
    wrap.style.cssText = `
      display: flex; flex-direction: column; gap: 8px;
      padding: 12px;
      min-height: 218px;
      background: ${THEME.panel};
      border: 1px solid ${THEME.border};
      border-radius: 12px;
      ${dim ? 'box-shadow: inset 0 0 0 1px rgba(244,199,90,0.06);' : ''}
    `;

    const label = document.createElement('div');
    label.style.cssText = `
      font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
      color: ${THEME.textMuted};
      display: flex; align-items: center; gap: 8px;
    `;
    const colorName = color === 'w' ? 'white' : 'black';
    const countTxt = `${hand.length} card${hand.length === 1 ? '' : 's'}`;
    let labelText: string;
    if (kind === 'sim') labelText = `${colorName} \u00b7 ${countTxt}`;
    else if (kind === 'opp-revealed') labelText = `${colorName} (opponent) \u00b7 ${countTxt}`;
    else labelText = `your hand \u00b7 ${countTxt}`;
    label.textContent = labelText;
    if (kind === 'opp-revealed') {
      const eye = document.createElement('span');
      eye.textContent = '\u{1F441} revealed';
      eye.style.cssText = `
        font-size: 9px; letter-spacing: 0.18em;
        color: ${THEME.accent};
        padding: 2px 6px;
        border: 1px solid rgba(244,199,90,0.4);
        border-radius: 4px;
      `;
      label.appendChild(eye);
    }
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
      // Phase gating: dim cards whose play-phase doesn't match the
      // current turn-phase. Click-through still fires (the controller
      // flashes a banner explaining "shield is defensive \u2014 play it
      // AFTER your move" or vice versa) so the user discovers the rule
      // by trying. Only applies to the human's own hand.
      const cardPlayPhase = resolveCardPhase(card.definition);
      const phaseMismatch =
        kind === 'own' && playable && currentTurnPhase !== undefined &&
        ((currentTurnPhase === 'pre' && cardPlayPhase === 'post') ||
         (currentTurnPhase === 'post' && cardPlayPhase !== 'post'));
      row.appendChild(
        this.buildCard(card, color, selectedId === card.id, playable, phaseMismatch),
      );
    }
    wrap.appendChild(row);
    return wrap;
  }

  private buildCard(
    card: CardInstance,
    color: PieceColor,
    selected: boolean,
    playable: boolean,
    phaseMismatch = false,
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
    // Phase mismatch dimming \u2014 lower opacity, desaturate, and keep
    // cursor: pointer (the click still fires a banner so the user can
    // learn the rule). Selected cards override the dim. We DON'T fully
    // disable the card or change its size \u2014 the goal is to surface the
    // rule, not hide options.
    const dimForPhase = phaseMismatch && !selected;
    el.style.cssText = `
      width: 138px;
      min-height: 168px;
      padding: 10px 12px 12px;
      border-radius: 10px;
      background: ${bg};
      border: 2px solid ${selected ? THEME.accent : ringColor};
      box-shadow:
        ${selected ? `0 0 0 3px rgba(244, 199, 90, 0.35), ` : ''}
        0 6px 14px rgba(0, 0, 0, 0.35);
      color: #1f1a15;
      transform: translateY(${selected ? '-6px' : '0'});
      transition: transform 200ms cubic-bezier(.2,.7,.2,1), box-shadow 200ms ease, border-color 200ms ease, opacity 180ms ease, filter 180ms ease;
      ${playable ? 'cursor: pointer;' : 'cursor: default; opacity: 0.78;'}
      ${dimForPhase ? 'opacity: 0.42; filter: saturate(0.55);' : ''}
      position: relative;
      user-select: none;
    `;
    if (phaseMismatch) {
      // Tooltip explains the gate. Card-specific cues (def.phase) are
      // baked in here so the user doesn't have to look up which side
      // each card belongs to.
      const cardPlayPhase = resolveCardPhase(card.definition);
      el.title =
        cardPlayPhase === 'post'
          ? `${card.definition.name} is a defensive card \u2014 play it AFTER you move.`
          : `${card.definition.name} can\u2019t be played in your post-move phase \u2014 it\u2019s an offensive card. End your turn or play a defensive card.`;
    } else {
      el.title = card.definition.rulesText;
    }

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
      margin-bottom: 6px;
    `;
    desc.textContent = card.definition.shortDesc;
    el.appendChild(desc);

    // ─── Consistent meta-chips row ──────────────────────────────────────
    // Every card carries the same three pieces of metadata so the player
    // can scan a hand at a glance and not be surprised:
    //   • duration  — "instant", "opp turn", "your turn", "until moved", …
    //   • consumes turn  — if true, you skip your chess move this turn
    //   • captures       — if true, this card can remove a piece
    // We show the duration always (it's the most useful), and the other
    // two only when they apply (keeps the card visually quiet most of
    // the time). All chips share styling for visual consistency.
    const chipsRow = this.buildMetaChips(card.definition);
    if (chipsRow) el.appendChild(chipsRow);

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

/** Compact metadata chip for cards. Shown in three slots: duration,
 * consumes-turn, capture. The `surface` parameter switches the palette
 * between the cream card background (cards in hand, about catalog) and
 * the dark deck-panel surface (expanded body) so the chip reads on both.
 *
 * Tones are deliberately uneven \u2014 loud properties pop, quiet ones
 * recede:
 *   neutral  \u2014 ghost (no fill, muted text). Default-state info.
 *   warn     \u2014 amber tint, mild fill. "whole turn" surprise.
 *   danger   \u2014 red tint, mild fill. "can capture" \u2014 most
 *              consequential property in the game. */
function buildChip(
  glyph: string,
  label: string,
  tone: 'neutral' | 'warn' | 'danger',
  surface: 'light' | 'dark' = 'light',
): HTMLElement {
  const palettes = {
    light: {
      neutral: { bg: 'transparent',              fg: 'rgba(74, 58, 42, 0.62)' },
      warn:    { bg: 'rgba(180, 110, 40, 0.14)', fg: '#6a3f0f' },
      danger:  { bg: 'rgba(170, 50, 50, 0.14)',  fg: '#6a1c1c' },
    },
    dark: {
      neutral: { bg: 'transparent',              fg: 'rgba(255, 240, 220, 0.55)' },
      warn:    { bg: 'rgba(244, 180, 90, 0.16)', fg: '#f4c75a' },
      danger:  { bg: 'rgba(220, 90, 90, 0.18)',  fg: '#f0a0a0' },
    },
  };
  const p = palettes[surface][tone];
  const chip = document.createElement('span');
  chip.style.cssText = `
    display: inline-flex; align-items: center; gap: 3px;
    padding: 1px 6px;
    border-radius: 999px;
    background: ${p.bg};
    color: ${p.fg};
    font-size: 9.5px;
    font-family: system-ui, -apple-system, sans-serif;
    font-weight: 500;
    letter-spacing: 0.02em;
    line-height: 1.3;
    white-space: nowrap;
  `;
  chip.innerHTML = `<span style="font-size:10px;line-height:1;opacity:0.75;">${glyph}</span><span>${label}</span>`;
  return chip;
}

/** Public re-export so the cards-reference panel can render identical
 * chips alongside the catalog entries. */
export { buildChip as buildCardMetaChip };
