// src/ui/play/deckPanel.ts
// Always-visible sidebar panel that surfaces the deck composition for the
// current game: which card TYPES are in the pool, how many copies of each,
// and live counts (in draw pile / in discard / in someone's hand).
//
// The cards-in-hand renderer (cardHands.ts) already shows the player's
// own hand visually. This panel answers a different question: "what's
// possibly going to come out of the deck this game?". For a customized
// pool (e.g. only the "default" set), that's not obvious from the hand
// alone, especially before the first capture happens.

import type { SuperChessState } from '../../game/types.ts';
import type { CardDefinition, CardInstance } from '../../cards/types.ts';
import { THEME, getThemeMode } from '../theme.ts';
import { buildCardMetaChip } from '../cardHands.ts';

export class DeckPanelRenderer {
  private container: HTMLElement;
  // Which card-type names are currently expanded (i.e. showing the full
  // shortDesc + rulesText below the header row). Tracked across renders
  // so toggling stays sticky when the controller emits new state.
  private expanded = new Set<string>();
  // Whether per-card counts may leak hand contents. Defaults to true so
  // simulate mode (a researcher tool) keeps showing everything; play
  // mode passes `false` whenever the opponent's hand is closed, since
  // each "X/Y remaining" row implicitly reveals draws + hand holdings.
  private revealHands = true;

  constructor(container: HTMLElement) {
    this.container = container;
    // Set properties individually rather than via `cssText` so we don't
    // wipe the host's existing `flex: 0 1 40%` (Play sidebar) or
    // `grid-area: deck` (Simulate grid). Hard-won lesson: `cssText` is a
    // setter that overwrites the entire inline style attribute.
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.minHeight = '0';
    this.container.style.background = THEME.panel;
    this.container.style.border = `1px solid ${THEME.border}`;
    this.container.style.borderRadius = '12px';
    this.container.style.overflow = 'hidden';
  }

  render(state: SuperChessState, options: { revealHands?: boolean } = {}): void {
    this.container.innerHTML = '';
    this.revealHands = options.revealHands ?? true;
    const composition = computeComposition(state);

    // ─── header ───────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 10px 14px 8px;
      border-bottom: 1px solid ${THEME.border};
      flex: 0 0 auto;
    `;

    // Title row: "deck" label on the left, hand-state pill on the right.
    // The hand-state pill is a STATE chosen on the new-game page, locked
    // for the duration of this game. Co-locating it with the deck panel
    // (instead of the page header) ties it to the card-information part
    // of the UI \u2014 "hand closed" is fundamentally a fact about how much
    // of the card layer the player can see.
    const titleRow = document.createElement('div');
    titleRow.style.cssText = `
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    `;
    header.appendChild(titleRow);

    const title = document.createElement('div');
    title.style.cssText = `
      font-size: 10.5px; letter-spacing: 0.28em; text-transform: uppercase;
      color: ${THEME.textMuted};
    `;
    title.textContent = 'deck';
    titleRow.appendChild(title);

    const handStatePill = document.createElement('div');
    const isOpen = this.revealHands;
    handStatePill.style.cssText = `
      font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase;
      color: ${isOpen ? THEME.accent : THEME.textMuted};
      padding: 2px 8px;
      border: 1px solid ${isOpen ? 'color-mix(in srgb, ' + THEME.accent + ' 40%, transparent)' : THEME.border};
      border-radius: 999px;
      flex-shrink: 0;
    `;
    handStatePill.textContent = isOpen ? 'hand \u00b7 open' : 'hand \u00b7 closed';
    handStatePill.title = isOpen
      ? 'opponent\u2019s hand is face-up. set on the new-game screen.'
      : 'opponent\u2019s hand is hidden. set on the new-game screen.';
    titleRow.appendChild(handStatePill);

    const counts = document.createElement('div');
    counts.style.cssText = `
      display: flex; flex-wrap: wrap; gap: 8px 14px;
      font-size: 10.5px;
      color: ${THEME.textSecondary};
      font-family: system-ui, sans-serif;
      letter-spacing: 0.04em;
    `;
    counts.innerHTML = `
      <span><strong style="color:${THEME.textPrimary};font-weight:600;">${composition.totalCopies}</strong> copies</span>
      <span><strong style="color:${THEME.textPrimary};font-weight:600;">${composition.types.length}</strong> types</span>
      <span style="color:${THEME.textMuted};">|</span>
      <span title="copies still in the draw pile">${composition.inDraw} in draw</span>
      <span title="copies currently held by you or the opponent">${composition.inHands} in hands</span>
      <span title="copies that have been played or discarded">${composition.inDiscard} discarded</span>
    `;
    header.appendChild(counts);

    this.container.appendChild(header);

    // ─── card list ───────────────────────────────────────────────────────
    const list = document.createElement('div');
    list.style.cssText = `
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 6px 6px 8px;
    `;
    for (const t of composition.types) {
      list.appendChild(this.buildTypeRow(t));
    }
    this.container.appendChild(list);
  }

  /** A single row in the deck panel. Collapsed: emoji + name + meta-chips
   * + count. The HEADER is a real `<button>` (not a clickable div) so it
   * is keyboard-activatable, focus-ring-able, and announced as a button
   * by screen readers. ARIA attributes wire it to the expandable body
   * region. The expanded body is intentionally NOT clickable \u2014 users can
   * select / copy the rules text without collapsing the row.
   *
   * (Earlier version put the click handler on the row container and used
   * a `window.getSelection()` guard to avoid collapsing on text-select.
   * That guard fired spuriously on touch, sometimes requiring two or
   * three taps to collapse. A real button has no such problem.)
   */
  private buildTypeRow(t: PerTypeCount): HTMLElement {
    const isExpanded = this.expanded.has(t.definition.name);
    // "Exhausted" dimming relies on knowing draw + hand counts. With the
    // hand closed we'd be leaking that signal indirectly (a card fading
    // out reveals it has nothing left in the draw), so only apply the
    // visual treatment when the player can already see hand contents.
    const exhausted = this.revealHands && t.inDraw === 0 && t.inHands === 0;
    const headerId = `sc-deck-h-${slugify(t.definition.name)}`;
    const bodyId = `sc-deck-b-${slugify(t.definition.name)}`;

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.borderRadius = '6px';
    row.style.transition = 'background 140ms ease';
    row.style.opacity = exhausted ? '0.5' : '1';
    row.style.marginBottom = '2px';
    // Subtle alternating background when expanded so the expanded content
    // visually groups with its header row.
    if (isExpanded) {
      row.style.background = 'rgba(255, 255, 255, 0.04)';
    }

    // Header line: a real <button> that owns the click + keyboard
    // activation. Meta-chips intentionally live in the EXPANDED body, not
    // here — packing duration/turn/capture chips next to every card name
    // made the row noisy and forced wrapping. The collapsed row reads
    // cleanly as "what card / how many"; click-to-expand surfaces the
    // details.
    const header = document.createElement('button');
    header.type = 'button';
    header.id = headerId;
    header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    header.setAttribute('aria-controls', bodyId);
    header.style.cssText = `
      display: grid;
      grid-template-columns: 22px 1fr auto;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 32px;
      padding: 6px 8px;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: background 140ms ease;
    `;
    header.addEventListener('mouseenter', () => {
      if (!isExpanded) header.style.background = 'rgba(255, 255, 255, 0.06)';
    });
    header.addEventListener('mouseleave', () => {
      header.style.background = 'transparent';
    });
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.expanded.has(t.definition.name)) {
        this.expanded.delete(t.definition.name);
      } else {
        this.expanded.add(t.definition.name);
      }
      // Replace just this row in place (cheap; we rebuild only the row
      // node and swap it). Keeps scroll position stable.
      const next = this.buildTypeRow(t);
      row.replaceWith(next);
      // Restore focus to the new header so keyboard users keep their
      // place after expand/collapse.
      const nextHeader = next.querySelector<HTMLButtonElement>(`#${CSS.escape(headerId)}`);
      nextHeader?.focus();
    });

    const emoji = document.createElement('span');
    emoji.style.cssText = 'font-size: 16px; line-height: 1; text-align: center;';
    emoji.textContent = t.definition.emoji;
    header.appendChild(emoji);

    const name = document.createElement('span');
    name.style.cssText = `
      font-size: 12.5px;
      color: ${THEME.textPrimary};
      font-family: system-ui, sans-serif;
      letter-spacing: 0.01em;
      font-weight: ${isExpanded ? '600' : '500'};
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    name.textContent = t.definition.name;
    header.appendChild(name);

    // Right column: caret + count, stacked tight. The "X/Y" count is
    // suppressed when the opponent's hand is closed: per-card counts
    // implicitly reveal who's holding what (or what's been drawn but not
    // played), which is exactly what closed-hand mode is trying to hide.
    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    if (this.revealHands) {
      const count = document.createElement('span');
      count.style.cssText = `
        font-size: 10.5px;
        color: ${exhausted ? THEME.textMuted : THEME.textSecondary};
        font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace;
        letter-spacing: 0.04em;
        white-space: nowrap;
      `;
      count.textContent = `${t.inDraw}/${t.total}`;
      rightCol.appendChild(count);
    }
    const caret = document.createElement('span');
    caret.style.cssText = `
      display: inline-block;
      font-size: 9px;
      color: ${THEME.textMuted};
      transform: rotate(${isExpanded ? '90deg' : '0deg'});
      transition: transform 180ms ease;
      width: 9px;
      line-height: 1;
    `;
    caret.textContent = '\u25b6';
    rightCol.appendChild(caret);
    header.appendChild(rightCol);

    row.appendChild(header);

    // Expanded body: chips row + short desc + rules text + count
    // breakdown. Stays out of the DOM when collapsed so it doesn't add
    // height. Plain `<div>` (not interactive) so users can select / copy
    // the rules text without collapsing the row.
    if (isExpanded) {
      const body = document.createElement('div');
      body.id = bodyId;
      body.setAttribute('role', 'region');
      body.setAttribute('aria-labelledby', headerId);
      body.style.cssText = `
        margin: 6px 0 4px 30px;
        padding: 8px 10px;
        background: rgba(0, 0, 0, 0.18);
        border-left: 2px solid ${THEME.accent};
        border-radius: 4px;
        font-family: system-ui, sans-serif;
        color: ${THEME.textSecondary};
      `;

      // Meta chips row \u2014 lives at the top of the expanded body so the
      // user sees duration/turn/capture grouped together once they
      // click in. Renders the same three-slot pattern as the cards in
      // hand and the about catalog (always shows a capture chip). The
      // surface is derived from the theme so the chips read on both
      // dark-panel and light-panel backgrounds.
      const surface = getThemeMode() === 'dark' ? 'dark' : 'light';
      const chipsRow = document.createElement('div');
      chipsRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;';
      if (t.definition.duration) {
        chipsRow.appendChild(buildCardMetaChip('\u23f1', t.definition.duration, 'neutral', surface));
      }
      if (t.definition.consumesTurn) {
        chipsRow.appendChild(buildCardMetaChip('\u23f3', 'whole turn', 'warn', surface));
      }
      chipsRow.appendChild(
        t.definition.capture
          ? buildCardMetaChip('\u00d7', 'can capture', 'danger', surface)
          : buildCardMetaChip('\u00d7', 'no capture', 'neutral', surface),
      );
      body.appendChild(chipsRow);

      const short = document.createElement('div');
      short.style.cssText = `
        font-size: 12px;
        color: ${THEME.textPrimary};
        margin-bottom: 6px;
        line-height: 1.4;
      `;
      short.textContent = t.definition.shortDesc;
      body.appendChild(short);

      const rules = document.createElement('div');
      rules.style.cssText = `
        font-size: 11px;
        line-height: 1.5;
        color: ${THEME.textSecondary};
      `;
      rules.textContent = t.definition.rulesText;
      body.appendChild(rules);

      // Live count breakdown — more readable than the bare "X/Y" on the
      // collapsed row. Only useful for cards with copies in flight.
      // Hidden when the hand is closed so we don't undo the privacy of
      // closed-hand mode: even a per-card "1 in draw / 1 in hands" is
      // enough to deduce holdings. We still show the deck-wide "total
      // \u00d7N" so the player can see the deck composition they signed
      // up for at game start.
      const breakdown = document.createElement('div');
      breakdown.style.cssText = `
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px dashed ${THEME.border};
        font-size: 10.5px;
        color: ${THEME.textMuted};
        display: flex; flex-wrap: wrap; gap: 4px 12px;
      `;
      if (this.revealHands) {
        breakdown.innerHTML = `
          <span>${t.inDraw} in draw</span>
          <span>${t.inHands} in hands</span>
          <span>${t.inDiscard} discarded</span>
          <span style="color:${THEME.textSecondary};">total \u00d7${t.total}</span>
        `;
      } else {
        breakdown.innerHTML = `
          <span style="color:${THEME.textSecondary};">total \u00d7${t.total}</span>
          <span style="color:${THEME.textMuted};font-style:italic;">live counts hidden \u2014 hand closed</span>
        `;
      }
      body.appendChild(breakdown);

      row.appendChild(body);
    }

    return row;
  }
}

interface PerTypeCount {
  definition: CardDefinition;
  total: number;    // copies in the deck for this game
  inDraw: number;   // copies still in the (unseen) draw pile
  inHands: number;  // copies currently held by either player
  inDiscard: number; // copies in the discard pile (played / discarded)
}

interface Composition {
  totalCopies: number;
  inDraw: number;
  inHands: number;
  inDiscard: number;
  types: PerTypeCount[];
}

/** Convert a card name like "Pawn Retreat" to a stable id-safe slug used
 * for ARIA `aria-controls` / `aria-labelledby` wiring. Card names are
 * authored in src/data/super-chess.json so they can contain spaces,
 * apostrophes, etc. — strip everything except letters/digits and lowercase. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Roll up the deck state into a per-card-type tally plus aggregates.
 * Pure function; safe to call on every render. */
function computeComposition(state: SuperChessState): Composition {
  const tally = new Map<string, PerTypeCount>();

  function bump(card: CardInstance, where: 'draw' | 'hand' | 'discard'): void {
    let row = tally.get(card.definition.name);
    if (!row) {
      row = {
        definition: card.definition,
        total: 0, inDraw: 0, inHands: 0, inDiscard: 0,
      };
      tally.set(card.definition.name, row);
    }
    row.total++;
    if (where === 'draw') row.inDraw++;
    else if (where === 'hand') row.inHands++;
    else row.inDiscard++;
  }

  for (const c of state.deck.drawPile) bump(c, 'draw');
  for (const c of state.deck.hand.white) bump(c, 'hand');
  for (const c of state.deck.hand.black) bump(c, 'hand');
  for (const c of state.deck.discardPile) bump(c, 'discard');

  // Stable display order: group by category (matches CARD_POOL_GROUPS
  // ordering, which puts "default" first), then alphabetical inside a
  // category. The pool-groups list is small; do the lookup the cheap way.
  const types = [...tally.values()];
  const CATEGORY_ORDER = ['default', 'movement', 'disruption', 'defense', 'power', 'chaos'];
  types.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.definition.category);
    const bi = CATEGORY_ORDER.indexOf(b.definition.category);
    if (ai !== bi) return ai - bi;
    return a.definition.name.localeCompare(b.definition.name);
  });

  const totals = types.reduce(
    (acc, t) => {
      acc.totalCopies += t.total;
      acc.inDraw += t.inDraw;
      acc.inHands += t.inHands;
      acc.inDiscard += t.inDiscard;
      return acc;
    },
    { totalCopies: 0, inDraw: 0, inHands: 0, inDiscard: 0 },
  );

  return { ...totals, types };
}

