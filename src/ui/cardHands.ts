// src/ui/cardHands.ts
import type { SuperChessState } from '../game/types.ts';
import type { CardInstance } from '../cards/types.ts';
import { THEME } from './theme.ts';

export class CardHandsRenderer {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(state: SuperChessState): void {
    this.container.innerHTML = '';

    const whiteHand = state.deck.hand.white;
    const blackHand = state.deck.hand.black;

    this.container.appendChild(this.buildHand('Black', 'b', blackHand));
    this.container.appendChild(this.buildHand('White', 'w', whiteHand));
  }

  private buildHand(label: string, _color: string, hand: CardInstance[]): HTMLElement {
    const div = document.createElement('div');
    div.style.cssText = `padding: 8px; margin: 4px 0; background: ${THEME.panel}; border-radius: 6px;`;

    const title = document.createElement('div');
    title.style.cssText = `font-size: 12px; color: ${THEME.textSecondary}; margin-bottom: 6px;`;
    title.textContent = `${label}'s hand (${hand.length})`;
    div.appendChild(title);

    if (hand.length === 0) {
      const empty = document.createElement('span');
      empty.style.cssText = `font-size: 11px; color: ${THEME.textSecondary}; font-style: italic;`;
      empty.textContent = 'No cards';
      div.appendChild(empty);
    }

    for (const card of hand) {
      div.appendChild(this.buildCard(card));
    }

    return div;
  }

  private buildCard(card: CardInstance): HTMLElement {
    const rarityColor = {
      common: THEME.cardCommon,
      uncommon: THEME.cardUncommon,
      rare: THEME.cardRare,
    }[card.definition.rarity];

    const el = document.createElement('div');
    el.style.cssText = `
      display: inline-block; margin: 2px; padding: 6px 10px;
      background: ${THEME.bg}; border: 1px solid ${rarityColor};
      border-radius: 4px; cursor: default;
    `;
    el.title = card.definition.rulesText;

    const emoji = document.createElement('span');
    emoji.textContent = card.definition.emoji + ' ';
    el.appendChild(emoji);

    const name = document.createElement('span');
    name.style.cssText = `font-size: 12px; color: ${rarityColor};`;
    name.textContent = card.definition.name;
    el.appendChild(name);

    return el;
  }
}
