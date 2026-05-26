// src/ui/play/playPanel.ts
// Top-level play view: header (turn indicator + bot label + new-game button),
// 2-column layout (board + side panel), captured ribbons above/below the
// board, opponent hand on top, own hand on bottom, scrolling move log on the
// right.

import type { PieceColor } from '../../engine/types.ts';
import { BoardRenderer } from '../board.ts';
import { CardHandsRenderer } from '../cardHands.ts';
import { CapturedPiecesRenderer } from './capturedPieces.ts';
import { PlayController, type PlayViewModel } from './playController.ts';
import { MinimaxAI } from '../../ai/minimaxAI.ts';
import { HeuristicCardAI } from '../../ai/heuristicCardAI.ts';
import { showNewGamePanel, type NewGameConfig } from './newGamePanel.ts';
import { setOpenOpponentHandPref } from './prefs.ts';
import { THEME, onThemeChange } from '../theme.ts';

export function renderPlayMode(root: HTMLElement): void {
  root.innerHTML = '';
  showNewGamePanel({
    onStart: (cfg) => {
      mountGame(root, cfg);
    },
  });
}

function mountGame(root: HTMLElement, cfg: NewGameConfig): void {
  root.innerHTML = '';
  // Local copy so the user can toggle reveal mid-game.
  let revealOpponent = cfg.openOpponentHand;
  const layout = buildLayout(root, cfg);

  layout.newGameBtn.addEventListener('click', () => {
    if (confirm('Resign and start a new game?')) {
      renderPlayMode(root);
    }
  });

  layout.handToggleBtn.addEventListener('click', () => {
    revealOpponent = !revealOpponent;
    setOpenOpponentHandPref(revealOpponent);
    updateHandToggle(layout.handToggleBtn, revealOpponent);
    controller.requestRender();
  });
  updateHandToggle(layout.handToggleBtn, revealOpponent);

  // Higher difficulty gets a longer minimum think time so it feels more
  // deliberate. (Depth 3 search often exceeds these anyway.)
  const thinkByDepth = { 1: 550, 2: 800, 3: 1100 } as const;
  const minThink = thinkByDepth[cfg.botDepth as 1 | 2 | 3] ?? 800;

  const controller = new PlayController({
    humanColor: cfg.humanColor,
    chessAI: new MinimaxAI(cfg.botDepth),
    cardAI: new HeuristicCardAI(),
    botMinThinkMs: minThink,
    humanMoveSettleMs: 280,
    onRequestNewGame: () => renderPlayMode(root),
  });

  const board = new BoardRenderer(layout.board, { interactive: true });
  const oppHand = new CardHandsRenderer(layout.oppHand);
  const youHand = new CardHandsRenderer(layout.youHand);
  const oppCaptured = new CapturedPiecesRenderer(layout.oppCaptured);
  const youCaptured = new CapturedPiecesRenderer(layout.youCaptured);

  board.setHandlers({
    onSquareClick: (sq) => { controller.handleSquareClick(sq); },
  });
  youHand.setHandlers({
    onCardClick: (card) => { controller.handleCardClick(card); },
  });

  controller.onChange((vm) => {
    board.renderWith({
      state: vm.state,
      orientation: vm.humanColor,
      selectedSquare: vm.selectedSquare,
      legalDestinations: vm.legalDestinations,
      cardTargetSquares: vm.cardTargets,
      checkSquare: vm.checkSquare,
    });
    const selectedCardId =
      vm.cardPhase.kind === 'card-picked'
        ? vm.cardPhase.card.id
        : vm.cardPhase.kind === 'card-second-target'
          ? vm.cardPhase.card.id
          : null;
    oppHand.renderSide({
      state: vm.state,
      side: vm.humanColor === 'w' ? 'b' : 'w',
      humanColor: vm.humanColor,
      reveal: revealOpponent,
    });
    youHand.renderSide({
      state: vm.state,
      side: vm.humanColor,
      humanColor: vm.humanColor,
      selectedCardId,
      playable: vm.whoseTurn === 'human',
    });
    oppCaptured.render(vm.state, vm.humanColor === 'w' ? 'b' : 'w');
    youCaptured.render(vm.state, vm.humanColor);
    updateHeader(layout, vm, cfg);
    updateLog(layout.log, vm);
    updateBanner(layout.banner, vm);
  });

  // Escape cancels card targeting or piece selection.
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') controller.escape();
  };
  document.addEventListener('keydown', escHandler);
  // We don't currently dispose this when navigating away — main.ts wipes
  // the container, the listeners on stale controllers just become no-ops.

  // When the user toggles the theme, baked-in inline styles use CSS variables
  // and update automatically — but the board SVG, hand cards, log rows and
  // header dot are re-rendered each emit using JS-interpolated THEME values.
  // We force a fresh render here so they pick up the new palette immediately.
  onThemeChange(() => {
    controller.requestRender();
  });

  controller.start();
}

interface Layout {
  header: HTMLElement;
  turnIndicator: HTMLElement;
  botLabel: HTMLElement;
  slowGameChip: HTMLElement;
  newGameBtn: HTMLElement;
  handToggleBtn: HTMLButtonElement;
  board: HTMLElement;
  oppCaptured: HTMLElement;
  youCaptured: HTMLElement;
  oppLabel: HTMLElement;
  youLabel: HTMLElement;
  oppHand: HTMLElement;
  youHand: HTMLElement;
  log: HTMLElement;
  banner: HTMLElement;
}

function buildLayout(root: HTMLElement, cfg: NewGameConfig): Layout {
  const wrap = document.createElement('div');
  wrap.style.cssText = `
    max-width: 1280px;
    margin: 0 auto;
    padding: 18px 20px 32px;
    display: flex; flex-direction: column;
    gap: 18px;
    color: var(--sc-text);
  `;
  root.appendChild(wrap);

  // Header.
  const header = document.createElement('header');
  header.style.cssText = `
    display: flex; align-items: center; gap: 14px;
    flex-wrap: wrap;
  `;
  wrap.appendChild(header);

  const turnIndicator = document.createElement('div');
  turnIndicator.style.cssText = `
    display: flex; align-items: center; gap: 10px;
    padding: 8px 14px;
    background: var(--sc-panel);
    border: 1px solid var(--sc-border);
    border-radius: 999px;
    font-size: 13px;
    letter-spacing: 0.04em;
  `;
  header.appendChild(turnIndicator);

  const botLabel = document.createElement('div');
  botLabel.style.cssText = `
    font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase;
    color: var(--sc-text-muted);
  `;
  botLabel.textContent = `bot \u00b7 ${cfg.botLabel}`;
  header.appendChild(botLabel);

  const slowGameChip = document.createElement('div');
  slowGameChip.style.cssText = `
    padding: 4px 10px;
    background: var(--sc-panel);
    border: 1px solid var(--sc-border);
    border-radius: 999px;
    font-size: 10.5px; letter-spacing: 0.14em;
    color: var(--sc-text-muted);
    font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace;
    cursor: help;
  `;
  slowGameChip.title =
    'Slow-game rule: after every 6 plies without a capture, whoever just '
    + 'moved gets a free card. Captures reset the counter.';
  header.appendChild(slowGameChip);

  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  header.appendChild(spacer);

  const handToggleBtn = document.createElement('button');
  handToggleBtn.className = 'sc-btn';
  handToggleBtn.title = 'Show / hide the opponent\u2019s cards';
  header.appendChild(handToggleBtn);

  const newGameBtn = document.createElement('button');
  newGameBtn.className = 'sc-btn';
  newGameBtn.textContent = 'new game';
  header.appendChild(newGameBtn);
  // wired below once we know the root reference

  // 2-column body.
  const body = document.createElement('div');
  body.style.cssText = `
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 20px;
    align-items: start;
  `;
  wrap.appendChild(body);

  // Left: board column.
  const boardCol = document.createElement('div');
  boardCol.style.cssText = `
    display: flex; flex-direction: column; gap: 12px;
    min-width: 0;
  `;
  body.appendChild(boardCol);

  // Opp hand (card backs) — top of column.
  const oppHand = document.createElement('div');
  boardCol.appendChild(oppHand);

  // Opp strip (label + captured) just above the board.
  const oppStrip = document.createElement('div');
  oppStrip.style.cssText = `
    display: flex; align-items: center; gap: 14px;
    padding: 6px 4px 2px;
  `;
  const oppLabel = document.createElement('div');
  oppLabel.style.cssText = `
    font-size: 13px;
    letter-spacing: 0.12em;
    color: var(--sc-text-secondary);
  `;
  const oppCaptured = document.createElement('div');
  oppStrip.appendChild(oppLabel);
  oppStrip.appendChild(oppCaptured);
  boardCol.appendChild(oppStrip);

  // Board container.
  const board = document.createElement('div');
  board.style.cssText = 'display: flex; justify-content: center;';
  boardCol.appendChild(board);

  // You strip (label + captured) just below the board.
  const youStrip = document.createElement('div');
  youStrip.style.cssText = `
    display: flex; align-items: center; gap: 14px;
    padding: 6px 4px;
  `;
  const youLabel = document.createElement('div');
  youLabel.style.cssText = `
    font-size: 13px;
    letter-spacing: 0.12em;
    color: var(--sc-text-secondary);
  `;
  const youCaptured = document.createElement('div');
  youStrip.appendChild(youLabel);
  youStrip.appendChild(youCaptured);
  boardCol.appendChild(youStrip);

  // Your hand at the bottom of the column.
  const youHand = document.createElement('div');
  boardCol.appendChild(youHand);

  // Banner (slides in, e.g. "opponent played 🌀 Teleport")
  const banner = document.createElement('div');
  banner.style.cssText = `
    min-height: 0;
    opacity: 0;
    transition: opacity 220ms ease;
    padding: 0 14px;
    font-size: 13px;
    color: var(--sc-accent);
    text-align: center;
    font-family: system-ui, sans-serif;
  `;
  boardCol.appendChild(banner);

  // Right: side panel (move log + tips).
  const sidePanel = document.createElement('aside');
  sidePanel.style.cssText = `
    display: flex; flex-direction: column;
    background: var(--sc-panel);
    border: 1px solid var(--sc-border);
    border-radius: 12px;
    height: 600px;
    overflow: hidden;
  `;
  body.appendChild(sidePanel);

  const logHeader = document.createElement('div');
  logHeader.style.cssText = `
    padding: 12px 16px;
    border-bottom: 1px solid var(--sc-border);
    font-size: 10.5px; letter-spacing: 0.28em; text-transform: uppercase;
    color: var(--sc-text-muted);
  `;
  logHeader.textContent = 'move log';
  sidePanel.appendChild(logHeader);

  const log = document.createElement('div');
  log.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 8px 16px;
    font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace;
    font-size: 12.5px;
    line-height: 1.7;
  `;
  sidePanel.appendChild(log);

  const tip = document.createElement('div');
  tip.style.cssText = `
    padding: 12px 16px;
    border-top: 1px solid var(--sc-border);
    font-size: 12px;
    line-height: 1.55;
    color: var(--sc-text-secondary);
    font-family: system-ui, sans-serif;
  `;
  tip.innerHTML = `
    <strong style="color:var(--sc-text);font-weight:600;">tip \u00b7</strong>
    Click a piece to see legal moves. Click a card to play it (then click its
    target on the board). Click a card again to cancel. Use the
    <em>hand</em> button up top to peek at the bot\u2019s cards.
  `;
  sidePanel.appendChild(tip);

  // Labels (set once based on color).
  oppLabel.textContent = cfg.humanColor === 'w' ? '♚  black' : '♔  white';
  youLabel.textContent = cfg.humanColor === 'w' ? '♔  white (you)' : '♚  black (you)';

  return {
    header, turnIndicator, botLabel, slowGameChip, newGameBtn, handToggleBtn,
    board, oppCaptured, youCaptured, oppLabel, youLabel,
    oppHand, youHand, log, banner,
  };
}

function updateHandToggle(btn: HTMLButtonElement, revealed: boolean): void {
  btn.innerHTML = revealed
    ? '\u{1F441} hand: open'
    : '\u{1F0A0} hand: closed';
  btn.setAttribute('aria-pressed', revealed ? 'true' : 'false');
}

function updateHeader(layout: Layout, vm: PlayViewModel, cfg: NewGameConfig): void {
  // slow-game card-draw countdown
  const plies = vm.slowGame.pliesSinceCapture;
  const threshold = vm.slowGame.threshold;
  const untilNext = threshold - (plies % threshold);
  if (plies === 0) {
    layout.slowGameChip.textContent = `\u{1F0CF} next slow draw: ${threshold} plies`;
    layout.slowGameChip.style.color = THEME.textMuted;
  } else {
    layout.slowGameChip.textContent = `\u{1F0CF} ${untilNext} ${untilNext === 1 ? 'ply' : 'plies'} \u2192 slow draw`;
    // amber as we get close, red the ply BEFORE a draw fires
    layout.slowGameChip.style.color =
      untilNext === 1 ? THEME.accent : untilNext <= 2 ? THEME.accent : THEME.textMuted;
  }

  layout.turnIndicator.innerHTML = '';
  const dot = document.createElement('span');
  dot.style.cssText = `
    width: 8px; height: 8px; border-radius: 50%;
    background: ${vm.whoseTurn === 'human' ? THEME.accent : vm.whoseTurn === 'bot' ? THEME.accentDanger : THEME.textMuted};
    box-shadow: 0 0 10px ${vm.whoseTurn === 'human' ? THEME.accent : 'transparent'};
    animation: ${vm.botThinking ? 'scPulse 1s ease-in-out infinite' : 'none'};
  `;
  layout.turnIndicator.appendChild(dot);

  const text = document.createElement('span');
  if (vm.whoseTurn === 'game-over') {
    text.textContent = 'game over';
  } else if (vm.whoseTurn === 'human') {
    if (vm.cardPhase.kind === 'card-picked') {
      const hint = humanCardHint(vm);
      text.textContent = `playing ${vm.cardPhase.card.definition.name} · ${hint}`;
    } else if (vm.cardPhase.kind === 'card-second-target') {
      text.textContent = `playing ${vm.cardPhase.card.definition.name} · choose destination`;
    } else {
      text.textContent = 'your move';
    }
  } else {
    if (vm.botThinking) {
      text.appendChild(document.createTextNode('opponent thinking'));
      const dots = document.createElement('span');
      dots.className = 'sc-think-dots';
      dots.innerHTML = '<span>·</span><span>·</span><span>·</span>';
      text.appendChild(dots);
    } else {
      text.textContent = 'opponent move';
    }
  }
  layout.turnIndicator.appendChild(text);

  // inject keyframes once.
  if (!document.getElementById('sc-anims')) {
    const sty = document.createElement('style');
    sty.id = 'sc-anims';
    sty.textContent = `
      @keyframes scPulse { 0%, 100% { opacity: 0.55; transform: scale(0.85) } 50% { opacity: 1; transform: scale(1.15) } }
      @keyframes scFade  { from { opacity: 0 } to { opacity: 1 } }
      @keyframes scBlink { 0%, 80%, 100% { opacity: 0.25 } 40% { opacity: 1 } }
      .sc-think-dots {
        display: inline-flex; gap: 2px; margin-left: 4px;
        letter-spacing: 1px; font-weight: 700;
      }
      .sc-think-dots span {
        display: inline-block;
        animation: scBlink 1.1s ease-in-out infinite;
        opacity: 0.25;
      }
      .sc-think-dots span:nth-child(1) { animation-delay: 0s; }
      .sc-think-dots span:nth-child(2) { animation-delay: 0.18s; }
      .sc-think-dots span:nth-child(3) { animation-delay: 0.36s; }
    `;
    document.head.appendChild(sty);
  }
}

function humanCardHint(vm: PlayViewModel): string {
  if (vm.cardPhase.kind !== 'card-picked') return '';
  switch (vm.cardPhase.needs.kind) {
    case 'ownPiece': return 'click one of your pieces';
    case 'oppPiece': return 'click an opponent piece';
    case 'square': return 'click any empty square';
    case 'pawn': return 'click one of your pawns';
    case 'twoOwnPieces': return 'click first piece to swap';
    case 'teleport': return 'click piece to teleport';
    case 'retreat': return 'click piece to retreat';
    case 'pieceType': return 'pick a piece type…';
    default: return '';
  }
}

function updateLog(log: HTMLElement, vm: PlayViewModel): void {
  // Render the last ~40 events so the log can show full game without grow forever.
  const events = vm.state.history.slice(-60);
  log.innerHTML = '';
  for (const ev of events) {
    const row = document.createElement('div');
    if (ev.type === 'move') {
      row.style.color = ev.data.color === vm.humanColor ? THEME.textPrimary : THEME.textSecondary;
      row.textContent = `${ev.data.turnNumber}. ${ev.data.color === 'w' ? '' : '… '}${ev.data.algebraic}`;
    } else if (ev.type === 'cardPlay') {
      row.style.color = THEME.accent;
      row.style.fontSize = '11.5px';
      row.textContent = `   ↳ ${ev.data.cardName}`;
    } else if (ev.type === 'cardDraw') {
      row.style.color = THEME.textMuted;
      row.style.fontSize = '11px';
      const isHuman = ev.data.color === vm.humanColor;
      const verb = isHuman ? 'you drew' : 'they drew';
      row.textContent = `   • ${verb} ${ev.data.card.definition.name}`;
    } else if (ev.type === 'cardDiscard') {
      row.style.color = THEME.textMuted;
      row.style.fontSize = '11px';
      row.style.fontStyle = 'italic';
      const isHuman = ev.data.color === vm.humanColor;
      row.textContent = `   • ${isHuman ? 'you discarded' : 'they discarded'} ${ev.data.card.definition.name}`;
    } else if (ev.type === 'gameOver') {
      row.style.color = THEME.accent;
      row.style.fontWeight = '600';
      row.textContent = `— ${ev.data.reason} —`;
    }
    log.appendChild(row);
  }
  log.scrollTop = log.scrollHeight;
}

function updateBanner(banner: HTMLElement, vm: PlayViewModel): void {
  if (vm.banner) {
    banner.textContent = vm.banner;
    banner.style.opacity = '1';
  } else {
    banner.style.opacity = '0';
  }
}
