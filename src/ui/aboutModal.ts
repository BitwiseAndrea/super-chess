// src/ui/aboutModal.ts
// The "about / cards / how-to-play" full-page modal. Lives in the nav
// corner (next to the theme toggle) so it's discoverable but out of the
// way during a game. Triple-section structure:
//
//   1. Intro    — what is super chess, in 2 paragraphs
//   2. How to play — annotated walkthrough of the core mechanics
//   3. Cards    — the full catalog (replaces the old "cards" tab)
//
// Closes on: Escape, backdrop click, the close button. Scrolls inside the
// card (sticky header) so we can keep the layout calm on tall content.

import { CARD_DEFINITIONS, CARD_POOL_GROUPS } from '../cards/definitions.ts';
import { THEME, getThemeMode } from './theme.ts';
import { buildCardMetaChip } from './cardHands.ts';
import type { CardDefinition } from '../cards/types.ts';

export function showAboutModal(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 900;
    background: rgba(8, 5, 3, 0.65);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    overflow: hidden;
    animation: scAboutFade 180ms ease;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background: var(--sc-panel-soft);
    border: 1px solid var(--sc-border);
    border-radius: 18px;
    width: 100%; max-width: 880px;
    max-height: 100%;
    display: flex; flex-direction: column;
    color: var(--sc-text);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.65);
    overflow: hidden;
  `;
  overlay.appendChild(card);

  // --- header (sticky) -----------------------------------------------------
  const header = document.createElement('div');
  header.style.cssText = `
    flex: 0 0 auto;
    display: flex; align-items: center; gap: 16px;
    padding: 22px 28px 18px;
    border-bottom: 1px solid var(--sc-border);
    background: var(--sc-panel-soft);
  `;

  const headerText = document.createElement('div');
  headerText.style.cssText = 'flex: 1; min-width: 0;';
  const eyebrow = document.createElement('div');
  eyebrow.style.cssText = `
    font-size: 11px; letter-spacing: 0.32em; text-transform: uppercase;
    color: var(--sc-text-muted); margin-bottom: 4px;
  `;
  eyebrow.textContent = 'about';
  headerText.appendChild(eyebrow);
  const title = document.createElement('h1');
  title.style.cssText = 'font-size: 24px; font-weight: 400; margin: 0; color: var(--sc-text);';
  title.textContent = 'super chess';
  headerText.appendChild(title);
  header.appendChild(headerText);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'close');
  closeBtn.style.cssText = `
    width: 36px; height: 36px;
    border-radius: 999px;
    border: 1px solid var(--sc-border);
    background: var(--sc-panel);
    color: var(--sc-text-secondary);
    font-size: 18px; line-height: 1;
    cursor: pointer;
    transition: all 180ms ease;
    flex-shrink: 0;
    font-family: inherit;
  `;
  closeBtn.textContent = '\u2715';
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.borderColor = 'var(--sc-text-secondary)';
    closeBtn.style.color = 'var(--sc-text)';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.borderColor = 'var(--sc-border)';
    closeBtn.style.color = 'var(--sc-text-secondary)';
  });
  header.appendChild(closeBtn);
  card.appendChild(header);

  // --- scrollable body ----------------------------------------------------
  const body = document.createElement('div');
  body.style.cssText = `
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 28px 36px 36px;
  `;
  card.appendChild(body);

  body.appendChild(buildIntroSection());
  body.appendChild(buildHowToPlaySection());
  body.appendChild(buildCardCatalogSection());
  body.appendChild(buildFooterSection());

  // --- close behaviour ----------------------------------------------------
  function dismiss(): void {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') dismiss();
  }
  document.addEventListener('keydown', onKey);
  closeBtn.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });

  // Keyframe — injected once.
  if (!document.getElementById('sc-about-anim')) {
    const sty = document.createElement('style');
    sty.id = 'sc-about-anim';
    sty.textContent = '@keyframes scAboutFade { from { opacity: 0 } to { opacity: 1 } }';
    document.head.appendChild(sty);
  }

  document.body.appendChild(overlay);
  return overlay;
}

// ─── sections ──────────────────────────────────────────────────────────────

function buildIntroSection(): HTMLElement {
  const section = document.createElement('section');
  section.style.cssText = 'margin-bottom: 40px;';

  const h = sectionHeading('the game', 'what makes super chess super');
  section.appendChild(h);

  const grid = document.createElement('div');
  grid.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    font-family: system-ui, sans-serif;
    font-size: 14px; line-height: 1.6;
    color: ${THEME.textSecondary};
  `;

  const intro = document.createElement('p');
  intro.style.cssText = 'margin: 0;';
  intro.innerHTML = `Super chess is regular chess with a deck of cards
    layered on top. Before your normal chess move each turn, you may
    optionally play one card from your hand. Cards do things normal
    chess can't \u2014 freeze a piece, build a shield, retreat a pawn,
    teleport, even rewind two plies.`;
  grid.appendChild(intro);

  const intro2 = document.createElement('p');
  intro2.style.cssText = 'margin: 0;';
  intro2.innerHTML = `You start with an empty hand and draw cards as
    you capture opponent pieces (and on slow turns where no one captures).
    Each card type comes in 1\u20133 copies; the deck composition is
    configurable per-game on the play setup screen, so you can start
    with just six simple cards and add more pools as you get
    comfortable.`;
  grid.appendChild(intro2);

  section.appendChild(grid);
  return section;
}

function buildHowToPlaySection(): HTMLElement {
  const section = document.createElement('section');
  section.style.cssText = 'margin-bottom: 48px;';

  section.appendChild(sectionHeading('how to play', 'the core loop, step by step'));

  const steps: Array<{ n: string; title: string; body: string }> = [
    {
      n: '1',
      title: 'your turn arrives',
      body: 'The turn indicator in the header pulses gold when it\u2019s your move. The opponent\u2019s hand is on top of the board (face-down by default; you can flip it open from the header). Your hand is below the board.',
    },
    {
      n: '2',
      title: 'optionally play a card',
      body: 'Click any card in your hand to play it. The board lights up with valid targets \u2014 click one to apply the card. Click the card again to cancel. Most cards do NOT consume your turn; you still get a regular chess move after. Cards with the "whole turn" chip skip the chess move (Pawn Storm, Mirror).',
    },
    {
      n: '3',
      title: 'make your chess move',
      body: 'Click one of your pieces \u2014 legal destinations light up. Click a destination to move. Normal chess rules apply (castling, en passant, promotion, etc.), except for card effects that modify them (Ghost Step, Knight\u2019s Path, Sidestep, ...).',
    },
    {
      n: '4',
      title: 'draw + bot turn',
      body: 'After your move you draw a card if you captured something (or if neither side has captured in 6 turns). Then the bot moves \u2014 same loop, but it picks its card and move automatically. Watch the move log on the right for everything that happened.',
    },
  ];

  const list = document.createElement('div');
  list.style.cssText = `
    display: flex; flex-direction: column;
    gap: 14px;
    margin-top: 14px;
  `;
  for (const step of steps) {
    list.appendChild(buildStepRow(step.n, step.title, step.body));
  }
  section.appendChild(list);

  // Sub-section: the meta-chips legend
  const legend = document.createElement('div');
  legend.style.cssText = `
    margin-top: 22px;
    padding: 18px 22px;
    background: var(--sc-panel);
    border: 1px solid var(--sc-border);
    border-radius: 12px;
    font-family: system-ui, sans-serif;
    font-size: 13px; line-height: 1.55;
    color: ${THEME.textSecondary};
  `;
  const legendTitle = document.createElement('div');
  legendTitle.style.cssText = `
    font-size: 10.5px; letter-spacing: 0.28em; text-transform: uppercase;
    color: ${THEME.textMuted}; margin-bottom: 12px;
    font-weight: 500;
  `;
  legendTitle.textContent = 'reading card chips';
  legend.appendChild(legendTitle);

  const legendItems: Array<[string, string, 'neutral' | 'warn' | 'danger', string]> = [
    ['\u23f1', 'duration', 'neutral', 'How long the effect lingers \u2014 \u201cinstant\u201d, \u201copp turn\u201d, \u201cyour turn\u201d, \u201c1 turn\u201d.'],
    ['\u23f3', 'whole turn', 'warn', 'Playing this card IS your entire turn. You won\u2019t get a chess move after (Pawn Storm, Mirror, the pawn-only movement cards).'],
    ['\u00d7', 'capture', 'danger', '\u201ccan capture\u201d (red) means it can remove a piece. \u201cno capture\u201d (gray) means it cannot. Every card shows one or the other.'],
  ];
  for (const [glyph, label, tone, blurb] of legendItems) {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px;';
    const chipWrap = document.createElement('div');
    chipWrap.style.flexShrink = '0';
    // Legend sits on the panel surface, so the chip palette tracks the
    // active theme (panel is dark in dark mode, cream in light mode).
    const surface = getThemeMode() === 'dark' ? 'dark' : 'light';
    chipWrap.appendChild(buildCardMetaChip(glyph, label, tone, surface));
    row.appendChild(chipWrap);
    const text = document.createElement('div');
    text.style.cssText = `flex: 1; color: ${THEME.textSecondary};`;
    text.textContent = blurb;
    row.appendChild(text);
    legend.appendChild(row);
  }
  section.appendChild(legend);

  return section;
}

function buildStepRow(num: string, title: string, body: string): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = `
    display: grid;
    grid-template-columns: 36px 1fr;
    gap: 14px;
    align-items: start;
  `;
  const badge = document.createElement('div');
  badge.style.cssText = `
    width: 32px; height: 32px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--sc-accent) 20%, var(--sc-panel));
    border: 1px solid var(--sc-accent);
    color: var(--sc-text);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 600;
    font-family: system-ui, sans-serif;
  `;
  badge.textContent = num;
  row.appendChild(badge);

  const wrap = document.createElement('div');
  const heading = document.createElement('div');
  heading.style.cssText = `
    font-size: 14px; font-weight: 600;
    margin-bottom: 4px;
    color: var(--sc-text);
    letter-spacing: 0.01em;
  `;
  heading.textContent = title;
  wrap.appendChild(heading);
  const text = document.createElement('div');
  text.style.cssText = `
    font-family: system-ui, sans-serif;
    font-size: 13.5px; line-height: 1.55;
    color: ${THEME.textSecondary};
  `;
  text.textContent = body;
  wrap.appendChild(text);
  row.appendChild(wrap);

  return row;
}

function buildCardCatalogSection(): HTMLElement {
  const section = document.createElement('section');
  section.style.cssText = 'margin-bottom: 36px;';

  // Today only the "default" pool is exposed in the catalog. The other
  // category groups (movement / disruption / power / chaos / defense) still
  // exist in CARD_POOL_GROUPS and CARD_DEFINITIONS \u2014 the code path is
  // intact \u2014 they're just hidden until we're ready to ship them.
  const VISIBLE_CATEGORIES = new Set<string>(['default']);
  const visibleDefs = CARD_DEFINITIONS.filter((d) => VISIBLE_CATEGORIES.has(d.category));

  section.appendChild(sectionHeading(
    `the deck \u00b7 ${visibleDefs.length} cards`,
    'grouped by pool. the "default" pool is the curated beginner set',
  ));

  for (const group of CARD_POOL_GROUPS) {
    if (!VISIBLE_CATEGORIES.has(group.id)) continue;
    const defs = CARD_DEFINITIONS.filter((d) => d.category === group.id);
    if (defs.length === 0) continue;

    const sub = document.createElement('div');
    sub.style.cssText = 'margin-top: 22px;';

    const heading = document.createElement('div');
    heading.style.cssText = 'display: flex; align-items: baseline; gap: 12px; margin: 0 0 4px;';
    const h = document.createElement('h3');
    h.style.cssText = `
      font-size: 13px; letter-spacing: 0.28em; text-transform: uppercase;
      color: ${group.id === 'default' ? THEME.accent : THEME.textSecondary};
      margin: 0;
      font-weight: 600;
    `;
    h.textContent = group.label;
    heading.appendChild(h);

    const meta = document.createElement('span');
    meta.style.cssText = `
      font-size: 11px;
      color: ${THEME.textMuted};
      letter-spacing: 0.08em;
      font-family: system-ui, sans-serif;
    `;
    const copies = defs.reduce((s, d) => s + d.copies, 0);
    meta.textContent = `${defs.length} types \u00b7 ${copies} copies`;
    heading.appendChild(meta);
    sub.appendChild(heading);

    const blurb = document.createElement('div');
    blurb.style.cssText = `
      font-size: 12.5px;
      color: ${THEME.textSecondary};
      font-family: system-ui, sans-serif;
      margin: 0 0 14px;
      max-width: 720px;
    `;
    blurb.textContent = group.blurb;
    sub.appendChild(blurb);

    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
    `;
    for (const def of defs) grid.appendChild(buildCatalogCard(def));
    sub.appendChild(grid);

    section.appendChild(sub);
  }

  return section;
}

function buildCatalogCard(def: CardDefinition): HTMLElement {
  const rarity = def.rarity;
  const ringColor = rarity === 'common' ? THEME.cardCommon
                  : rarity === 'uncommon' ? THEME.cardUncommon
                  : THEME.cardRare;
  const bg = rarity === 'common' ? THEME.cardCommonBg
           : rarity === 'uncommon' ? THEME.cardUncommonBg
           : THEME.cardRareBg;

  const card = document.createElement('div');
  card.style.cssText = `
    padding: 14px 16px 16px;
    border-radius: 11px;
    background: ${bg};
    border: 1.5px solid ${ringColor};
    color: #1f1a15;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
    display: flex; flex-direction: column; gap: 6px;
  `;

  const row = document.createElement('div');
  row.style.cssText = 'display: flex; align-items: center; gap: 10px;';
  const emoji = document.createElement('span');
  emoji.style.cssText = 'font-size: 24px; line-height: 1;';
  emoji.textContent = def.emoji;
  const name = document.createElement('span');
  name.style.cssText = 'font-size: 14px; font-weight: 600; line-height: 1.2;';
  name.textContent = def.name;
  const tag = document.createElement('span');
  tag.style.cssText = `
    margin-left: auto;
    font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase;
    color: ${ringColor};
    font-weight: 700;
    font-family: system-ui, sans-serif;
  `;
  tag.textContent = `${def.rarity} \u00d7${def.copies}`;
  row.appendChild(emoji); row.appendChild(name); row.appendChild(tag);
  card.appendChild(row);

  const short = document.createElement('div');
  short.style.cssText = 'font-size: 12px; line-height: 1.45; font-family: system-ui, sans-serif; color: #2c241c;';
  short.textContent = def.shortDesc;
  card.appendChild(short);

  const chips: HTMLElement[] = [];
  if (def.duration) chips.push(buildCardMetaChip('\u23f1', def.duration, 'neutral'));
  if (def.consumesTurn) chips.push(buildCardMetaChip('\u23f3', 'whole turn', 'warn'));
  // Always render a capture chip so every card has consistent metadata
  // (duration / turn / capture). "can capture" is the loud, colored
  // chip; "no capture" is the quiet neutral one \u2014 same shape, same
  // slot, just different vibe.
  chips.push(
    def.capture
      ? buildCardMetaChip('\u00d7', 'can capture', 'danger')
      : buildCardMetaChip('\u00d7', 'no capture', 'neutral'),
  );
  if (chips.length > 0) {
    const chipsRow = document.createElement('div');
    chipsRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px;';
    for (const c of chips) chipsRow.appendChild(c);
    card.appendChild(chipsRow);
  }

  const rules = document.createElement('div');
  rules.style.cssText = 'font-size: 11px; line-height: 1.5; color: #5d4936; font-family: system-ui, sans-serif;';
  rules.textContent = def.rulesText;
  card.appendChild(rules);

  return card;
}

function buildFooterSection(): HTMLElement {
  const section = document.createElement('section');
  section.style.cssText = `
    margin-top: 8px;
    padding-top: 22px;
    border-top: 1px solid var(--sc-border);
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 12px;
    font-family: system-ui, sans-serif;
    font-size: 12.5px;
    color: ${THEME.textMuted};
  `;
  const credit = document.createElement('span');
  credit.textContent = 'hand-crafted by bitwise andrea.';
  section.appendChild(credit);
  const link = document.createElement('a');
  link.href = 'https://github.com/BitwiseAndrea/super-chess';
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.style.cssText = `
    color: ${THEME.textSecondary};
    text-decoration: none;
    letter-spacing: 0.14em; text-transform: uppercase;
    font-size: 11px;
  `;
  link.textContent = 'github \u2192';
  section.appendChild(link);
  return section;
}

// ─── helpers ───────────────────────────────────────────────────────────────

function sectionHeading(title: string, subtitle: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom: 14px;';
  const h = document.createElement('h2');
  h.style.cssText = `
    font-size: 11.5px; letter-spacing: 0.32em; text-transform: uppercase;
    color: ${THEME.textSecondary};
    margin: 0 0 4px;
    font-weight: 600;
  `;
  h.textContent = title;
  wrap.appendChild(h);
  const sub = document.createElement('div');
  sub.style.cssText = `
    font-family: system-ui, sans-serif;
    font-size: 13px;
    color: ${THEME.textMuted};
  `;
  sub.textContent = subtitle;
  wrap.appendChild(sub);
  return wrap;
}
