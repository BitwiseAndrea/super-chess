// src/ui/play/newGamePanel.ts
// Pre-game setup overlay: pick your side and bot difficulty, then start.
import type { PieceColor } from '../../engine/types.ts';
import type { CardCategory } from '../../cards/types.ts';
import { CARD_POOL_GROUPS, CARD_DEFINITIONS } from '../../cards/definitions.ts';
import {
  getOpenOpponentHandPref,
  setOpenOpponentHandPref,
  getEnabledCategoriesPref,
  setEnabledCategoriesPref,
  getMaxHandSizePref,
  setMaxHandSizePref,
  getCardOverridesPref,
  setCardOverridesPref,
  HAND_SIZE_MIN,
  HAND_SIZE_MAX,
  CARD_OVERRIDE_MIN,
  CARD_OVERRIDE_MAX,
} from './prefs.ts';

export interface NewGameConfig {
  humanColor: PieceColor;
  botDepth: number;            // 1 = easy, 2 = normal, 3 = hard
  botLabel: string;
  /** If true, the opponent's hand is shown face-up. Easier / good for learning. */
  openOpponentHand: boolean;
  /** Which card-pool categories should be included in the deck. Empty array
   * means "all cards" (legacy default for non-play entry points). */
  enabledCategories: CardCategory[];
  /** Maximum cards a player can hold at once. Range 2\u20135, default 3. */
  maxHandSize: number;
  /** Per-card copies overrides (sparse). Empty / undefined means "use the
   * JSON defaults". A value of 0 removes that card from the deck entirely. */
  cardOverrides?: Record<string, number>;
}

const DIFFICULTIES: Array<{ key: string; label: string; depth: number; blurb: string }> = [
  { key: 'easy',   label: 'easy',   depth: 1, blurb: 'looks 1 move ahead. forgiving.' },
  { key: 'normal', label: 'normal', depth: 2, blurb: 'looks 2 moves ahead. competent.' },
  { key: 'hard',   label: 'hard',   depth: 3, blurb: 'looks 3 moves ahead. unforgiving.' },
];

export function showNewGamePanel(opts: {
  onStart: (cfg: NewGameConfig) => void;
}): HTMLElement {
  const overlay = document.createElement('div');
  // Outer overlay never scrolls itself — it just provides the dimmed
  // backdrop and constrains the card to the viewport. The card is a
  // flex column whose middle section scrolls when content overflows.
  // (Prior version centered the card with no max-height, so on shorter
  // viewports the top + bottom of the panel got clipped with no way to
  // scroll.)
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 800;
    background: rgba(8, 5, 3, 0.6);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    overflow: hidden;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background: var(--sc-panel-soft);
    border: 1px solid var(--sc-border);
    border-radius: 16px;
    width: 100%; max-width: 520px;
    max-height: 100%;
    display: flex; flex-direction: column;
    color: var(--sc-text);
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.55);
    overflow: hidden;
  `;
  overlay.appendChild(card);

  // Scrollable body: takes all remaining height and scrolls when the
  // form is taller than the viewport. Holds everything except the
  // start button (which lives in the sticky footer below).
  const body = document.createElement('div');
  body.style.cssText = `
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 32px 36px 16px;
  `;
  card.appendChild(body);

  const eyebrow = document.createElement('div');
  eyebrow.style.cssText = `
    font-size: 11px; letter-spacing: 0.32em; text-transform: uppercase;
    color: var(--sc-text-muted); margin-bottom: 8px;
  `;
  eyebrow.textContent = 'super chess';
  body.appendChild(eyebrow);

  const title = document.createElement('h1');
  title.style.cssText = `
    font-size: 32px; line-height: 1.05; font-weight: 400;
    margin: 0 0 8px;
    color: var(--sc-text);
  `;
  title.textContent = 'play a game';
  body.appendChild(title);

  const blurb = document.createElement('p');
  blurb.style.cssText = `
    font-size: 13.5px; line-height: 1.5;
    color: var(--sc-text-secondary);
    margin: 0 0 22px;
    font-family: system-ui, sans-serif;
  `;
  blurb.textContent = 'Chess with a card-augmented deck. Each turn you may play a card before moving. Pick your side, opponent visibility, card pool, and bot difficulty below.';
  body.appendChild(blurb);

  // --- side picker ---
  const sideLabel = sectionLabel('your side');
  body.appendChild(sideLabel);

  let selectedSide: 'w' | 'b' | 'random' = 'w';
  const sideRow = document.createElement('div');
  sideRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 24px;';
  const sideOptions: Array<{ key: 'w' | 'b' | 'random'; label: string; glyph: string }> = [
    { key: 'w', label: 'white', glyph: '♔' },
    { key: 'b', label: 'black', glyph: '♚' },
    { key: 'random', label: 'random', glyph: '✦' },
  ];
  const sideButtons: HTMLButtonElement[] = [];
  for (const opt of sideOptions) {
    const btn = document.createElement('button');
    btn.style.cssText = pillStyle(opt.key === selectedSide);
    btn.innerHTML = `<span style="font-size:20px;line-height:1">${opt.glyph}</span><span>${opt.label}</span>`;
    btn.addEventListener('click', () => {
      selectedSide = opt.key;
      for (let i = 0; i < sideButtons.length; i++) {
        sideButtons[i].style.cssText = pillStyle(sideOptions[i].key === selectedSide);
      }
    });
    sideRow.appendChild(btn);
    sideButtons.push(btn);
  }
  body.appendChild(sideRow);

  // --- hand visibility picker ---
  const handLabel = sectionLabel('opponent\u2019s hand');
  body.appendChild(handLabel);

  let openHand = getOpenOpponentHandPref();
  const handRow = document.createElement('div');
  handRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 24px;';
  const handOptions: Array<{ key: 'closed' | 'open'; label: string; glyph: string; blurb: string }> = [
    { key: 'closed', label: 'closed', glyph: '\u{1F0A0}', blurb: 'hidden — classic' },
    { key: 'open',   label: 'open',   glyph: '\u{1F441}', blurb: 'face\u2011up — easier' },
  ];
  const handButtons: HTMLButtonElement[] = [];
  for (const opt of handOptions) {
    const btn = document.createElement('button');
    const isActive = (opt.key === 'open') === openHand;
    btn.style.cssText = pillStyle(isActive);
    btn.innerHTML = renderPillContent(opt.glyph, opt.label, opt.blurb, isActive);
    btn.addEventListener('click', () => {
      openHand = opt.key === 'open';
      for (let i = 0; i < handButtons.length; i++) {
        const active = (handOptions[i].key === 'open') === openHand;
        handButtons[i].style.cssText = pillStyle(active);
        handButtons[i].innerHTML = renderPillContent(
          handOptions[i].glyph, handOptions[i].label, handOptions[i].blurb, active,
        );
      }
    });
    handRow.appendChild(btn);
    handButtons.push(btn);
  }
  body.appendChild(handRow);

  // --- card pool picker ---
  // Today only the "default" pool is exposed in the UI. The other category
  // groups (movement / disruption / power / chaos / defense) still exist in
  // CARD_POOL_GROUPS and CARD_DEFINITIONS \u2014 the code path is untouched \u2014
  // they're just hidden until we're ready to ship them. The accordion below
  // lets the player tune the default pool: master include/exclude per
  // category, expand to see individual cards, and override copy counts.
  const persistedCats = getEnabledCategoriesPref();
  const enabledCategories = new Set<CardCategory>(
    persistedCats ?? CARD_POOL_GROUPS.filter((g) => g.defaultEnabled).map((g) => g.id),
  );
  // Drop any persisted non-visible category from the live set so the deck
  // we hand back to the controller can't accidentally include hidden pools.
  const VISIBLE_CATEGORIES: ReadonlySet<CardCategory> = new Set<CardCategory>(['default']);
  for (const cat of [...enabledCategories]) {
    if (!VISIBLE_CATEGORIES.has(cat)) enabledCategories.delete(cat);
  }
  // If nothing visible is enabled (e.g. a player who'd disabled default),
  // re-enable default so the new-game flow doesn't bottom out at "no deck".
  if (![...enabledCategories].some((c) => VISIBLE_CATEGORIES.has(c))) {
    enabledCategories.add('default');
  }

  // Per-card copies overrides: starts from persisted prefs, only contains
  // entries that diverge from the JSON default. We pass this map to the
  // controller as-is and persist on start.
  const cardOverrides: Record<string, number> = { ...getCardOverridesPref() };

  const poolLabel = sectionLabel('card pool');
  body.appendChild(poolLabel);

  const poolWrap = document.createElement('div');
  poolWrap.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;';

  const poolDeckSummary = document.createElement('div');
  poolDeckSummary.style.cssText = `
    font-size: 11.5px;
    color: var(--sc-text-muted);
    font-family: system-ui, sans-serif;
    margin-bottom: 14px;
  `;

  // Reset link \u2014 sits at the top right of the pool section so it's findable
  // without burying it in the expanded panel. Clears overrides AND restores
  // the default category set.
  const resetRow = document.createElement('div');
  resetRow.style.cssText = `
    display: flex; align-items: center; justify-content: flex-end;
    gap: 8px; margin: -6px 0 8px;
  `;
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.style.cssText = `
    background: transparent; border: none; padding: 0;
    color: var(--sc-text-muted);
    font-size: 11px; letter-spacing: 0.08em; text-transform: lowercase;
    cursor: pointer;
    font-family: system-ui, sans-serif;
    text-decoration: underline; text-underline-offset: 2px;
  `;
  resetBtn.textContent = 'reset to defaults';
  resetRow.appendChild(resetBtn);
  body.appendChild(resetRow);

  const cardCopyOf = (cardName: string): number => {
    if (Object.prototype.hasOwnProperty.call(cardOverrides, cardName)) return cardOverrides[cardName];
    const def = CARD_DEFINITIONS.find((c) => c.name === cardName);
    return def ? def.copies : 0;
  };

  const setCardCopies = (cardName: string, copies: number, defaultCopies: number): void => {
    const clamped = Math.max(CARD_OVERRIDE_MIN, Math.min(CARD_OVERRIDE_MAX, copies));
    if (clamped === defaultCopies) {
      delete cardOverrides[cardName];
    } else {
      cardOverrides[cardName] = clamped;
    }
  };

  type AccordionRefs = {
    rerender: () => void;
  };
  const accordionRefs: AccordionRefs[] = [];

  for (const group of CARD_POOL_GROUPS) {
    if (!VISIBLE_CATEGORIES.has(group.id)) continue;
    const cardsInGroup = CARD_DEFINITIONS.filter((c) => c.category === group.id);
    if (cardsInGroup.length === 0) {
      poolWrap.appendChild(buildEmptyPoolRow(group.label, group.blurb));
      continue;
    }
    const accordion = buildPoolAccordion({
      group,
      cards: cardsInGroup,
      isCategoryEnabled: () => enabledCategories.has(group.id),
      setCategoryEnabled: (next) => {
        if (next) enabledCategories.add(group.id);
        else enabledCategories.delete(group.id);
        updateDeckSummary();
      },
      getCardCopies: cardCopyOf,
      setCardCopies: (cardName, copies, def) => {
        setCardCopies(cardName, copies, def);
        updateDeckSummary();
      },
    });
    poolWrap.appendChild(accordion.element);
    accordionRefs.push({ rerender: accordion.rerender });
  }
  body.appendChild(poolWrap);
  body.appendChild(poolDeckSummary);

  function updateDeckSummary(): void {
    const cats = [...enabledCategories];
    const cardsInDeck = CARD_DEFINITIONS.filter((c) => cats.includes(c.category));
    const cardCount = cardsInDeck.reduce((acc, c) => acc + cardCopyOf(c.name), 0);
    const distinct = cardsInDeck.filter((c) => cardCopyOf(c.name) > 0).length;
    if (cats.length === 0 || cardCount === 0) {
      poolDeckSummary.textContent = '\u26a0 no cards selected \u2014 the deck is empty.';
      poolDeckSummary.style.color = 'var(--sc-warning, var(--sc-text-secondary))';
    } else {
      poolDeckSummary.textContent = `deck: ${cardCount} cards across ${distinct} types`;
      poolDeckSummary.style.color = 'var(--sc-text-muted)';
    }
  }
  updateDeckSummary();

  resetBtn.addEventListener('click', () => {
    // Restore enabled categories to the visible defaults, wipe per-card
    // overrides, and re-render every accordion in place.
    enabledCategories.clear();
    for (const g of CARD_POOL_GROUPS) {
      if (g.defaultEnabled && VISIBLE_CATEGORIES.has(g.id)) enabledCategories.add(g.id);
    }
    for (const k of Object.keys(cardOverrides)) delete cardOverrides[k];
    for (const a of accordionRefs) a.rerender();
    updateDeckSummary();
  });

  // --- hand size picker ---
  // Stepper for max hand size (range HAND_SIZE_MIN\u2013HAND_SIZE_MAX). Bigger
  // hand = more cards in flight at once, more strategic depth, more
  // hand-full draw decisions. Persisted across sessions.
  let maxHandSize = getMaxHandSizePref();
  const handSizeLabel = sectionLabel('max hand size');
  body.appendChild(handSizeLabel);

  const handSizeRow = document.createElement('div');
  handSizeRow.style.cssText = `
    display: flex; align-items: center; gap: 14px; margin-bottom: 24px;
    padding: 10px 14px;
    border: 1px solid var(--sc-border);
    border-radius: 12px;
    background: var(--sc-panel);
  `;

  const handSizeSlider = document.createElement('input');
  handSizeSlider.type = 'range';
  handSizeSlider.min = String(HAND_SIZE_MIN);
  handSizeSlider.max = String(HAND_SIZE_MAX);
  handSizeSlider.step = '1';
  handSizeSlider.value = String(maxHandSize);
  handSizeSlider.style.cssText = 'flex: 1; accent-color: var(--sc-accent, #c0a064);';
  handSizeRow.appendChild(handSizeSlider);

  const handSizeValue = document.createElement('div');
  handSizeValue.style.cssText = `
    min-width: 22px; text-align: center; font-variant-numeric: tabular-nums;
    font-size: 18px; color: var(--sc-text); font-weight: 500;
  `;
  handSizeValue.textContent = String(maxHandSize);
  handSizeRow.appendChild(handSizeValue);

  body.appendChild(handSizeRow);

  const handSizeBlurb = document.createElement('div');
  handSizeBlurb.style.cssText = `
    font-size: 11.5px; color: var(--sc-text-muted);
    font-family: system-ui, sans-serif;
    margin-top: -16px; margin-bottom: 24px;
  `;
  const renderHandSizeBlurb = (n: number): string => {
    if (n <= 2) return 'tight \u2014 you\u2019ll often have to make do with what you have.';
    if (n === 3) return 'balanced \u2014 enough hand depth to plan a turn or two ahead.';
    if (n === 4) return 'comfy \u2014 plenty of options every turn.';
    return 'sprawling \u2014 maximum optionality, hand-full picks are rare.';
  };
  handSizeBlurb.textContent = renderHandSizeBlurb(maxHandSize);
  body.appendChild(handSizeBlurb);

  handSizeSlider.addEventListener('input', () => {
    maxHandSize = parseInt(handSizeSlider.value, 10);
    handSizeValue.textContent = String(maxHandSize);
    handSizeBlurb.textContent = renderHandSizeBlurb(maxHandSize);
  });

  // --- difficulty picker ---
  const diffLabel = sectionLabel('bot difficulty');
  body.appendChild(diffLabel);

  let selectedDiff = DIFFICULTIES[1];
  const diffWrap = document.createElement('div');
  // No bottom margin — the sticky footer below provides its own spacing
  // so this section can flush against the scroll boundary if the user
  // scrolls to the bottom.
  diffWrap.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
  const diffButtons: HTMLButtonElement[] = [];
  for (const d of DIFFICULTIES) {
    const btn = document.createElement('button');
    const isActive = d === selectedDiff;
    btn.style.cssText = diffStyle(isActive);
    btn.innerHTML = renderDiffContent(d.label, d.blurb, isActive);
    btn.addEventListener('click', () => {
      selectedDiff = d;
      for (let i = 0; i < diffButtons.length; i++) {
        const active = DIFFICULTIES[i] === selectedDiff;
        diffButtons[i].style.cssText = diffStyle(active);
        diffButtons[i].innerHTML = renderDiffContent(DIFFICULTIES[i].label, DIFFICULTIES[i].blurb, active);
      }
    });
    diffWrap.appendChild(btn);
    diffButtons.push(btn);
  }
  body.appendChild(diffWrap);

  // --- sticky footer with start button ---
  // Lives OUTSIDE the scroll body so it's always visible at the bottom of
  // the card, even when the form content is taller than the viewport.
  // The subtle top border separates it from the scrolling content.
  const footer = document.createElement('div');
  footer.style.cssText = `
    flex: 0 0 auto;
    padding: 16px 36px 22px;
    border-top: 1px solid var(--sc-border);
    background: var(--sc-panel-soft);
  `;
  card.appendChild(footer);

  const startBtn = document.createElement('button');
  startBtn.className = 'sc-btn sc-btn--primary';
  startBtn.style.cssText += 'width: 100%; justify-content: center; padding: 14px 18px; font-size: 15px;';
  startBtn.textContent = 'start game';
  startBtn.addEventListener('click', () => {
    const humanColor: PieceColor = selectedSide === 'random'
      ? (Math.random() < 0.5 ? 'w' : 'b')
      : selectedSide;
    overlay.remove();
    setOpenOpponentHandPref(openHand);
    const cats = [...enabledCategories];
    setEnabledCategoriesPref(cats);
    setMaxHandSizePref(maxHandSize);
    setCardOverridesPref(cardOverrides);
    opts.onStart({
      humanColor,
      botDepth: selectedDiff.depth,
      botLabel: selectedDiff.label,
      openOpponentHand: openHand,
      enabledCategories: cats,
      maxHandSize,
      cardOverrides: { ...cardOverrides },
    });
  });
  footer.appendChild(startBtn);

  document.body.appendChild(overlay);
  return overlay;
}

function sectionLabel(text: string): HTMLElement {
  const el = document.createElement('div');
  // Was textMuted — bumped to textSecondary for the section *headings* so the
  // form structure scans more easily. Muted is still used for the in-row
  // sub-labels (the "hidden — classic" / "looks 1 move ahead" descriptors).
  el.style.cssText = `
    font-size: 10.5px; letter-spacing: 0.28em; text-transform: uppercase;
    color: var(--sc-text-secondary); margin: 0 0 10px;
    font-weight: 500;
  `;
  el.textContent = text;
  return el;
}

/** Active pill: tinted accent background, accent border, bold accent text,
 * subtle inset highlight + outer glow. Inactive: panel bg, regular border,
 * secondary text. */
function pillStyle(active: boolean): string {
  if (active) {
    return `
      flex: 1;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 14px 10px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--sc-accent) 22%, var(--sc-panel));
      border: 1.5px solid var(--sc-accent);
      color: var(--sc-text);
      font-size: 12px; letter-spacing: 0.06em; text-transform: lowercase;
      font-weight: 600;
      transition: all 200ms ease;
      cursor: pointer;
      font-family: inherit;
      box-shadow:
        0 0 0 3px color-mix(in srgb, var(--sc-accent) 18%, transparent),
        inset 0 1px 0 color-mix(in srgb, var(--sc-accent) 35%, transparent);
    `;
  }
  return `
    flex: 1;
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 14px 10px;
    border-radius: 12px;
    background: var(--sc-panel);
    border: 1px solid var(--sc-border);
    color: var(--sc-text-secondary);
    font-size: 12px; letter-spacing: 0.06em; text-transform: lowercase;
    transition: all 200ms ease;
    cursor: pointer;
    font-family: inherit;
  `;
}

function diffStyle(active: boolean): string {
  if (active) {
    return `
      display: flex; align-items: center;
      padding: 14px 16px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--sc-accent) 18%, var(--sc-panel));
      border: 1.5px solid var(--sc-accent);
      color: var(--sc-text);
      text-align: left;
      transition: all 200ms ease;
      cursor: pointer;
      font-family: inherit;
      box-shadow:
        0 0 0 3px color-mix(in srgb, var(--sc-accent) 15%, transparent),
        inset 0 1px 0 color-mix(in srgb, var(--sc-accent) 30%, transparent);
    `;
  }
  return `
    display: flex; align-items: center;
    padding: 14px 16px;
    border-radius: 10px;
    background: var(--sc-panel);
    border: 1px solid var(--sc-border);
    color: var(--sc-text-secondary);
    text-align: left;
    transition: all 200ms ease;
    cursor: pointer;
    font-family: inherit;
  `;
}

/** Pill content: the small sub-blurb stays muted when inactive but lifts to
 * secondary when the pill is active (otherwise it disappears against the
 * tinted background). */
function renderPillContent(glyph: string, label: string, blurb: string, active: boolean): string {
  const blurbColor = active ? 'var(--sc-text-secondary)' : 'var(--sc-text-muted)';
  return `
    <span style="font-size:20px;line-height:1">${glyph}</span>
    <span>${label}</span>
    <span style="font-size:10px;letter-spacing:0.04em;color:${blurbColor};margin-top:2px;font-family:system-ui,sans-serif;">${blurb}</span>
  `;
}

function renderDiffContent(label: string, blurb: string, active: boolean): string {
  const blurbColor = active ? 'var(--sc-text-secondary)' : 'var(--sc-text-muted)';
  return `
    <span style="font-size:13px;font-weight:600;letter-spacing:0.02em;">${label}</span>
    <span style="font-size:11.5px;color:${blurbColor};font-family:system-ui,sans-serif;margin-left:auto;">${blurb}</span>
  `;
}

/** A category accordion: header (master checkbox + title + preview + chevron),
 * collapsible body with per-card rows (checkbox + emoji + name + copies stepper).
 *
 * Re-renders in place \u2014 the parent panel never reloads. Returns a `rerender()`
 * hook so the "reset to defaults" link can refresh the UI after wiping
 * overrides without rebuilding the whole panel.
 */
function buildPoolAccordion(opts: {
  group: { id: string; label: string; blurb: string };
  cards: ReadonlyArray<{ name: string; copies: number; emoji: string }>;
  isCategoryEnabled: () => boolean;
  setCategoryEnabled: (next: boolean) => void;
  getCardCopies: (cardName: string) => number;
  setCardCopies: (cardName: string, copies: number, defaultCopies: number) => void;
}): { element: HTMLElement; rerender: () => void } {
  let expanded = false;

  const wrap = document.createElement('div');
  wrap.style.cssText = `
    display: flex; flex-direction: column;
    border-radius: 9px;
    border: 1px solid var(--sc-border);
    background: var(--sc-panel);
    transition: border-color 180ms ease, box-shadow 180ms ease;
    overflow: hidden;
    font-family: inherit;
  `;

  // Header (the always-visible top row)
  const header = document.createElement('button');
  header.type = 'button';
  header.style.cssText = `
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: var(--sc-text);
    text-align: left;
    cursor: pointer;
    font-family: inherit;
  `;
  wrap.appendChild(header);

  const body = document.createElement('div');
  body.style.cssText = `
    display: none;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px 12px;
    border-top: 1px solid var(--sc-border);
    background: color-mix(in srgb, var(--sc-text) 3%, var(--sc-panel));
  `;
  wrap.appendChild(body);

  function applyContainerActive(active: boolean): void {
    if (active) {
      wrap.style.borderColor = 'var(--sc-accent)';
      wrap.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--sc-accent) 14%, transparent), inset 0 1px 0 color-mix(in srgb, var(--sc-accent) 28%, transparent)';
      wrap.style.background = 'color-mix(in srgb, var(--sc-accent) 14%, var(--sc-panel))';
    } else {
      wrap.style.borderColor = 'var(--sc-border)';
      wrap.style.boxShadow = 'none';
      wrap.style.background = 'var(--sc-panel)';
    }
  }

  function renderHeader(): void {
    const active = opts.isCategoryEnabled();
    const checkbox = active
      ? '<span style="width:16px;height:16px;border-radius:4px;background:var(--sc-accent);display:inline-flex;align-items:center;justify-content:center;color:#000;font-size:11px;font-weight:700;flex-shrink:0;">\u2713</span>'
      : '<span style="width:16px;height:16px;border-radius:4px;border:1.5px solid var(--sc-border);background:transparent;flex-shrink:0;"></span>';
    const preview = opts.cards
      .filter((c) => opts.getCardCopies(c.name) > 0)
      .map((c) => `<span title="${c.name} \u00d7${opts.getCardCopies(c.name)}">${c.emoji}</span>`)
      .join(' ');
    const blurbColor = active ? 'var(--sc-text-secondary)' : 'var(--sc-text-muted)';
    const chevron = expanded ? '\u25BE' : '\u25B8';
    header.innerHTML = `
      <span class="sc-accordion-checkbox" data-role="checkbox" style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${checkbox}</span>
      <div style="display:flex;flex-direction:column;gap:1px;flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:12.5px;font-weight:600;letter-spacing:0.02em;">${opts.group.label}</span>
          <span style="font-size:13px;line-height:1;letter-spacing:0.06em;">${preview || '<span style=\"color:var(--sc-text-muted);font-size:10.5px;letter-spacing:0.16em;text-transform:uppercase;\">empty</span>'}</span>
        </div>
        <span style="font-size:10.5px;color:${blurbColor};font-family:system-ui,sans-serif;line-height:1.35;">${opts.group.blurb}</span>
      </div>
      <span style="font-size:11px;color:var(--sc-text-muted);font-variant-numeric:tabular-nums;">${chevron}</span>
    `;
    applyContainerActive(active);
  }

  function renderBody(): void {
    body.innerHTML = '';

    // "select all / deselect all" mini controls. Quietly tucked at the top
    // of the expanded body so they don't compete with the per-card rows.
    const subToolbar = document.createElement('div');
    subToolbar.style.cssText = `
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 6px;
      font-size: 10.5px; letter-spacing: 0.08em; text-transform: lowercase;
      color: var(--sc-text-muted);
      font-family: system-ui, sans-serif;
    `;
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.style.cssText = inlineLinkStyle();
    allBtn.textContent = 'select all';
    allBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      for (const c of opts.cards) opts.setCardCopies(c.name, c.copies, c.copies);
      renderBody();
      renderHeader();
    });
    const noneBtn = document.createElement('button');
    noneBtn.type = 'button';
    noneBtn.style.cssText = inlineLinkStyle();
    noneBtn.textContent = 'deselect all';
    noneBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      for (const c of opts.cards) opts.setCardCopies(c.name, 0, c.copies);
      renderBody();
      renderHeader();
    });
    subToolbar.appendChild(allBtn);
    subToolbar.appendChild(document.createTextNode(' \u00b7 '));
    subToolbar.appendChild(noneBtn);
    body.appendChild(subToolbar);

    for (const card of opts.cards) {
      body.appendChild(buildCardRow({
        card,
        getCopies: () => opts.getCardCopies(card.name),
        setCopies: (n) => {
          opts.setCardCopies(card.name, n, card.copies);
          renderHeader();
        },
      }));
    }
  }

  // Click on the chevron / row toggles expansion. Click on the checkbox
  // toggles the category. We dispatch by checking the `data-role` of the
  // event target (which is rebuilt by renderHeader, so we walk up).
  header.addEventListener('click', (e) => {
    let el: HTMLElement | null = e.target as HTMLElement | null;
    while (el && el !== header && !el.dataset.role) el = el.parentElement;
    if (el && el.dataset.role === 'checkbox') {
      opts.setCategoryEnabled(!opts.isCategoryEnabled());
      renderHeader();
      return;
    }
    expanded = !expanded;
    body.style.display = expanded ? 'flex' : 'none';
    renderHeader();
    if (expanded) renderBody();
  });

  function rerender(): void {
    renderHeader();
    if (expanded) renderBody();
  }

  renderHeader();
  return { element: wrap, rerender };
}

function inlineLinkStyle(): string {
  return `
    background: transparent; border: none; padding: 0;
    color: var(--sc-text-secondary);
    font-size: 10.5px; letter-spacing: 0.08em; text-transform: lowercase;
    cursor: pointer;
    font-family: system-ui, sans-serif;
    text-decoration: underline; text-underline-offset: 2px;
  `;
}

/** A single per-card row inside an accordion: emoji + name + meta + stepper.
 * The stepper is the canonical input for "how many copies of this card";
 * setting it to 0 effectively excludes the card from the deck. */
function buildCardRow(opts: {
  card: { name: string; copies: number; emoji: string };
  getCopies: () => number;
  setCopies: (n: number) => void;
}): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = `
    display: flex; align-items: center; gap: 10px;
    padding: 6px 8px;
    border-radius: 7px;
    background: var(--sc-panel);
    border: 1px solid var(--sc-border);
  `;

  const checkbox = document.createElement('button');
  checkbox.type = 'button';
  checkbox.style.cssText = `
    background: transparent; border: none; padding: 0;
    cursor: pointer; flex-shrink: 0;
    display: inline-flex; align-items: center; justify-content: center;
  `;

  const emojiBox = document.createElement('span');
  emojiBox.style.cssText = 'font-size: 16px; line-height: 1; flex-shrink: 0; width: 22px; text-align: center;';
  emojiBox.textContent = opts.card.emoji;

  const nameBox = document.createElement('div');
  nameBox.style.cssText = 'flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px;';
  const nameEl = document.createElement('span');
  nameEl.style.cssText = 'font-size: 12.5px; color: var(--sc-text); letter-spacing: 0.02em;';
  nameEl.textContent = opts.card.name;
  nameBox.appendChild(nameEl);
  const meta = document.createElement('span');
  meta.style.cssText = 'font-size: 10px; color: var(--sc-text-muted); font-family: system-ui, sans-serif;';
  meta.textContent = `default \u00d7${opts.card.copies}`;
  nameBox.appendChild(meta);

  const stepper = document.createElement('div');
  stepper.style.cssText = `
    display: inline-flex; align-items: stretch; flex-shrink: 0;
    border: 1px solid var(--sc-border);
    border-radius: 7px;
    background: var(--sc-panel-soft, var(--sc-panel));
    overflow: hidden;
  `;
  const minusBtn = document.createElement('button');
  minusBtn.type = 'button';
  minusBtn.textContent = '\u2212';
  minusBtn.style.cssText = stepperBtnStyle();
  const valueEl = document.createElement('span');
  valueEl.style.cssText = `
    min-width: 22px; padding: 0 6px;
    display: inline-flex; align-items: center; justify-content: center;
    font-variant-numeric: tabular-nums;
    font-size: 12.5px; color: var(--sc-text);
  `;
  const plusBtn = document.createElement('button');
  plusBtn.type = 'button';
  plusBtn.textContent = '+';
  plusBtn.style.cssText = stepperBtnStyle();
  stepper.appendChild(minusBtn);
  stepper.appendChild(valueEl);
  stepper.appendChild(plusBtn);

  function applyState(): void {
    const copies = opts.getCopies();
    valueEl.textContent = String(copies);
    const enabled = copies > 0;
    nameEl.style.opacity = enabled ? '1' : '0.55';
    emojiBox.style.opacity = enabled ? '1' : '0.55';
    minusBtn.disabled = copies <= CARD_OVERRIDE_MIN;
    plusBtn.disabled = copies >= CARD_OVERRIDE_MAX;
    minusBtn.style.opacity = minusBtn.disabled ? '0.35' : '1';
    plusBtn.style.opacity = plusBtn.disabled ? '0.35' : '1';
    if (enabled) {
      checkbox.innerHTML = '<span style="width:14px;height:14px;border-radius:3px;background:var(--sc-accent);display:inline-flex;align-items:center;justify-content:center;color:#000;font-size:10px;font-weight:700;">\u2713</span>';
    } else {
      checkbox.innerHTML = '<span style="width:14px;height:14px;border-radius:3px;border:1.5px solid var(--sc-border);background:transparent;display:inline-block;"></span>';
    }
  }

  checkbox.addEventListener('click', () => {
    const copies = opts.getCopies();
    if (copies > 0) {
      opts.setCopies(0);
    } else {
      // Re-enabling: restore to the default copies, not 1, so toggling
      // off-then-on returns the player to the JSON shape.
      opts.setCopies(opts.card.copies);
    }
    applyState();
  });
  minusBtn.addEventListener('click', () => {
    const copies = opts.getCopies();
    if (copies > CARD_OVERRIDE_MIN) {
      opts.setCopies(copies - 1);
      applyState();
    }
  });
  plusBtn.addEventListener('click', () => {
    const copies = opts.getCopies();
    if (copies < CARD_OVERRIDE_MAX) {
      opts.setCopies(copies + 1);
      applyState();
    }
  });

  row.appendChild(checkbox);
  row.appendChild(emojiBox);
  row.appendChild(nameBox);
  row.appendChild(stepper);

  applyState();
  return row;
}

function stepperBtnStyle(): string {
  return `
    background: transparent; border: none; padding: 0 10px;
    color: var(--sc-text); font-size: 14px; line-height: 1;
    cursor: pointer; font-family: inherit;
    transition: background 120ms ease;
  `;
}

function buildEmptyPoolRow(label: string, blurb: string): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = `
    display: flex; align-items: center;
    padding: 7px 12px;
    border-radius: 9px;
    background: var(--sc-panel);
    border: 1px dashed var(--sc-border);
    color: var(--sc-text-muted);
    font-family: inherit;
    opacity: 0.55;
  `;
  row.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1px;">
      <span style="font-size:12.5px;font-weight:600;letter-spacing:0.02em;">${label}</span>
      <span style="font-size:10.5px;font-family:system-ui,sans-serif;">${blurb}</span>
    </div>
    <span style="margin-left:auto;font-size:9.5px;letter-spacing:0.16em;text-transform:uppercase;">empty</span>
  `;
  return row;
}
