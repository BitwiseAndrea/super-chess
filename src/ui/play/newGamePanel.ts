// src/ui/play/newGamePanel.ts
// Pre-game setup overlay: pick your side and bot difficulty, then start.
import type { PieceColor } from '../../engine/types.ts';
import { getOpenOpponentHandPref, setOpenOpponentHandPref } from './prefs.ts';

export interface NewGameConfig {
  humanColor: PieceColor;
  botDepth: number;            // 1 = easy, 2 = normal, 3 = hard
  botLabel: string;
  /** If true, the opponent's hand is shown face-up. Easier / good for learning. */
  openOpponentHand: boolean;
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
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 800;
    background: rgba(8, 5, 3, 0.6);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background: var(--sc-panel-soft);
    border: 1px solid var(--sc-border);
    border-radius: 16px;
    padding: 36px 40px 32px;
    width: 100%; max-width: 520px;
    color: var(--sc-text);
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.55);
  `;
  overlay.appendChild(card);

  const eyebrow = document.createElement('div');
  eyebrow.style.cssText = `
    font-size: 11px; letter-spacing: 0.32em; text-transform: uppercase;
    color: var(--sc-text-muted); margin-bottom: 8px;
  `;
  eyebrow.textContent = 'super chess';
  card.appendChild(eyebrow);

  const title = document.createElement('h1');
  title.style.cssText = `
    font-size: 38px; line-height: 1.05; font-weight: 400;
    margin: 0 0 8px;
    color: var(--sc-text);
  `;
  title.textContent = 'play a game';
  card.appendChild(title);

  const blurb = document.createElement('p');
  blurb.style.cssText = `
    font-size: 14px; line-height: 1.5;
    color: var(--sc-text-secondary);
    margin: 0 0 26px;
    font-family: system-ui, sans-serif;
  `;
  blurb.textContent = 'Chess with a 20-card deck. Each turn you may play a card before moving — freeze pieces, teleport them, build shields, rewind time. Hover any card in your hand to see what it does.';
  card.appendChild(blurb);

  // --- side picker ---
  const sideLabel = sectionLabel('your side');
  card.appendChild(sideLabel);

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
  card.appendChild(sideRow);

  // --- hand visibility picker ---
  const handLabel = sectionLabel('opponent\u2019s hand');
  card.appendChild(handLabel);

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
  card.appendChild(handRow);

  // --- difficulty picker ---
  const diffLabel = sectionLabel('bot difficulty');
  card.appendChild(diffLabel);

  let selectedDiff = DIFFICULTIES[1];
  const diffWrap = document.createElement('div');
  diffWrap.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 28px;';
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
  card.appendChild(diffWrap);

  // --- start button ---
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
    opts.onStart({
      humanColor,
      botDepth: selectedDiff.depth,
      botLabel: selectedDiff.label,
      openOpponentHand: openHand,
    });
  });
  card.appendChild(startBtn);

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
