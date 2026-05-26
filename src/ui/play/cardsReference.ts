// src/ui/play/cardsReference.ts
// Browse-all-cards panel. Useful for new players who want to know what every
// card does without starting a game.

import { CARD_DEFINITIONS } from '../../cards/definitions.ts';
import { THEME } from '../theme.ts';

export function renderCardsReference(root: HTMLElement): void {
  root.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.style.cssText = `
    max-width: 1100px;
    margin: 0 auto;
    padding: 32px 20px 60px;
    color: ${THEME.textPrimary};
  `;
  root.appendChild(wrap);

  const eyebrow = document.createElement('div');
  eyebrow.style.cssText = `
    font-size: 11px; letter-spacing: 0.32em; text-transform: uppercase;
    color: ${THEME.textMuted}; margin-bottom: 8px;
  `;
  eyebrow.textContent = 'the deck';
  wrap.appendChild(eyebrow);

  const title = document.createElement('h1');
  title.style.cssText = `
    font-size: 42px; line-height: 1.05; font-weight: 400;
    margin: 0 0 8px;
  `;
  title.textContent = 'all 20 cards';
  wrap.appendChild(title);

  const lede = document.createElement('p');
  lede.style.cssText = `
    font-size: 15px; line-height: 1.6;
    color: ${THEME.textSecondary};
    max-width: 640px; margin: 0 0 32px;
    font-family: system-ui, sans-serif;
  `;
  lede.textContent =
    'There are 20 unique cards in 3 rarities. Each turn you can play at most one card before your chess move. Cards are drawn on captures (your opponent\'s pieces) and every 6 turns of slow play.';
  wrap.appendChild(lede);

  // Group by rarity.
  const grouped = {
    common:   CARD_DEFINITIONS.filter((d) => d.rarity === 'common'),
    uncommon: CARD_DEFINITIONS.filter((d) => d.rarity === 'uncommon'),
    rare:     CARD_DEFINITIONS.filter((d) => d.rarity === 'rare'),
  };

  for (const [rarity, defs] of Object.entries(grouped)) {
    const section = document.createElement('section');
    section.style.cssText = 'margin-bottom: 36px;';
    const h = document.createElement('h2');
    const color = rarity === 'common' ? THEME.cardCommon
                : rarity === 'uncommon' ? THEME.cardUncommon
                : THEME.cardRare;
    h.style.cssText = `
      font-size: 12px; letter-spacing: 0.32em; text-transform: uppercase;
      color: ${color};
      margin: 0 0 16px;
      font-weight: 500;
    `;
    h.textContent = `${rarity} · ${defs.length} cards (${defs.reduce((s, d) => s + d.copies, 0)} copies)`;
    section.appendChild(h);

    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 14px;
    `;
    for (const def of defs) {
      const card = document.createElement('div');
      const bg = rarity === 'common' ? THEME.cardCommonBg
               : rarity === 'uncommon' ? THEME.cardUncommonBg
               : THEME.cardRareBg;
      card.style.cssText = `
        padding: 16px 18px 18px;
        border-radius: 12px;
        background: ${bg};
        border: 1.5px solid ${color};
        color: #1f1a15;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        display: flex; flex-direction: column; gap: 8px;
      `;
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; gap: 10px;';
      const emoji = document.createElement('span');
      emoji.style.cssText = 'font-size: 28px; line-height: 1;';
      emoji.textContent = def.emoji;
      const name = document.createElement('span');
      name.style.cssText = 'font-size: 16px; font-weight: 600; line-height: 1.2;';
      name.textContent = def.name;
      const copies = document.createElement('span');
      copies.style.cssText = `
        margin-left: auto;
        font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
        color: ${color};
        font-weight: 700;
        font-family: system-ui, sans-serif;
      `;
      copies.textContent = `×${def.copies}`;
      row.appendChild(emoji); row.appendChild(name); row.appendChild(copies);
      card.appendChild(row);

      const short = document.createElement('div');
      short.style.cssText = 'font-size: 12.5px; line-height: 1.45; font-family: system-ui, sans-serif; color: #2c241c;';
      short.textContent = def.shortDesc;
      card.appendChild(short);

      const rules = document.createElement('div');
      rules.style.cssText = 'font-size: 11.5px; line-height: 1.55; color: #5d4936; font-family: system-ui, sans-serif;';
      rules.textContent = def.rulesText;
      card.appendChild(rules);

      grid.appendChild(card);
    }
    section.appendChild(grid);
    wrap.appendChild(section);
  }
}
