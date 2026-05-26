// src/ui/play/newGamePanel.ts
// Pre-game setup overlay: pick your side and bot difficulty, then start.
import type { PieceColor } from '../../engine/types.ts';
import { THEME } from '../theme.ts';

export interface NewGameConfig {
  humanColor: PieceColor;
  botDepth: number;            // 1 = easy, 2 = normal, 3 = hard
  botLabel: string;
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
    background: ${THEME.panelSoft};
    border: 1px solid ${THEME.border};
    border-radius: 16px;
    padding: 36px 40px 32px;
    width: 100%; max-width: 520px;
    color: ${THEME.textPrimary};
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.55);
  `;
  overlay.appendChild(card);

  const eyebrow = document.createElement('div');
  eyebrow.style.cssText = `
    font-size: 11px; letter-spacing: 0.32em; text-transform: uppercase;
    color: ${THEME.textMuted}; margin-bottom: 8px;
  `;
  eyebrow.textContent = 'super chess';
  card.appendChild(eyebrow);

  const title = document.createElement('h1');
  title.style.cssText = `
    font-size: 38px; line-height: 1.05; font-weight: 400;
    margin: 0 0 8px;
    color: ${THEME.textPrimary};
  `;
  title.textContent = 'play a game';
  card.appendChild(title);

  const blurb = document.createElement('p');
  blurb.style.cssText = `
    font-size: 14px; line-height: 1.5;
    color: ${THEME.textSecondary};
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

  // --- difficulty picker ---
  const diffLabel = sectionLabel('bot difficulty');
  card.appendChild(diffLabel);

  let selectedDiff = DIFFICULTIES[1];
  const diffWrap = document.createElement('div');
  diffWrap.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 28px;';
  const diffButtons: HTMLButtonElement[] = [];
  for (const d of DIFFICULTIES) {
    const btn = document.createElement('button');
    btn.style.cssText = diffStyle(d === selectedDiff);
    btn.innerHTML = `
      <span style="font-size:13px;font-weight:600;letter-spacing:0.02em;">${d.label}</span>
      <span style="font-size:11.5px;color:${THEME.textMuted};font-family:system-ui,sans-serif;margin-left:auto;">${d.blurb}</span>
    `;
    btn.addEventListener('click', () => {
      selectedDiff = d;
      for (let i = 0; i < diffButtons.length; i++) {
        diffButtons[i].style.cssText = diffStyle(DIFFICULTIES[i] === selectedDiff);
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
    opts.onStart({
      humanColor,
      botDepth: selectedDiff.depth,
      botLabel: selectedDiff.label,
    });
  });
  card.appendChild(startBtn);

  document.body.appendChild(overlay);
  return overlay;
}

function sectionLabel(text: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `
    font-size: 10.5px; letter-spacing: 0.28em; text-transform: uppercase;
    color: ${THEME.textMuted}; margin: 0 0 10px;
  `;
  el.textContent = text;
  return el;
}

function pillStyle(active: boolean): string {
  return `
    flex: 1;
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 14px 10px;
    border-radius: 12px;
    background: ${active ? `rgba(244, 199, 90, 0.18)` : THEME.panel};
    border: 1px solid ${active ? THEME.accent : THEME.border};
    color: ${active ? THEME.textPrimary : THEME.textSecondary};
    font-size: 12px; letter-spacing: 0.06em; text-transform: lowercase;
    transition: all 200ms ease;
    cursor: pointer;
    font-family: inherit;
  `;
}

function diffStyle(active: boolean): string {
  return `
    display: flex; align-items: center;
    padding: 14px 16px;
    border-radius: 10px;
    background: ${active ? `rgba(244, 199, 90, 0.14)` : THEME.panel};
    border: 1px solid ${active ? THEME.accent : THEME.border};
    color: ${active ? THEME.textPrimary : THEME.textSecondary};
    text-align: left;
    transition: all 200ms ease;
    cursor: pointer;
    font-family: inherit;
  `;
}
