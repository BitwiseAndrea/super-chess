// src/ui/play/playPanel.ts
// Top-level play view: header (turn indicator + bot label + new-game button),
// 2-column layout (board + side panel), captured ribbons above/below the
// board, opponent hand on top, own hand on bottom, scrolling move log on the
// right.

import type { PieceColor } from '../../engine/types.ts';
import { BoardRenderer } from '../board.ts';
import { CardHandsRenderer } from '../cardHands.ts';
import { CapturedPiecesRenderer } from './capturedPieces.ts';
import { DeckPanelRenderer } from './deckPanel.ts';
import { PlayController, type PlayViewModel } from './playController.ts';
import { MinimaxAI } from '../../ai/minimaxAI.ts';
import { HeuristicCardAI } from '../../ai/heuristicCardAI.ts';
import { showNewGamePanel, type NewGameConfig } from './newGamePanel.ts';
import { THEME, onThemeChange } from '../theme.ts';
import { DebugLog } from './debugLog.ts';
import { showBugReportModal } from './bugReportModal.ts';
import { showPilotPickerModal } from './pilotPickerModal.ts';

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
  // Hand visibility is a STATE chosen on the new-game page \u2014 not an
  // in-game action \u2014 so it's locked for the duration of this game.
  // (The pre-game panel persists this preference.)
  const revealOpponent = cfg.openOpponentHand;
  const layout = buildLayout(root, cfg);

  // Session-wide debug log — captures bot decisions, card applications,
  // and validation findings. Surfaced by the bug-report modal.
  const debugLog = new DebugLog();

  layout.newGameBtn.addEventListener('click', () => {
    if (confirm('Resign and start a new game?')) {
      renderPlayMode(root);
    }
  });

  layout.pilotChipStopBtn.addEventListener('click', () => {
    controller.disengagePilot('user clicked stop');
  });

  layout.pilotConfirmBtn.addEventListener('click', () => {
    controller.confirmPilotMove();
  });
  layout.pilotSkipBtn.addEventListener('click', () => {
    controller.disengagePilot('user clicked "take over" on proposal');
  });

  layout.usePilotBtn.addEventListener('click', () => {
    showPilotPickerModal({
      humanColor: cfg.humanColor,
      onPick: (openingId) => {
        controller.engagePilot(openingId).catch((err) => {
          debugLog.error('pilot', 'engagePilot threw', {
            message: (err as Error).message,
            openingId,
          });
        });
      },
    });
  });

  layout.autoMoveBtn.addEventListener('click', () => {
    controller.autoPlayHumanMove().catch((err) => {
      debugLog.error('session', 'autoPlayHumanMove threw', {
        message: (err as Error).message,
      });
    });
  });

  layout.endTurnBtn.addEventListener('click', () => {
    controller.endTurnExplicit().catch((err) => {
      debugLog.error('session', 'endTurnExplicit threw', {
        message: (err as Error).message,
      });
    });
  });

  layout.bugReportBtn.addEventListener('click', () => {
    showBugReportModal({
      state: controller.getState(),
      debugLog,
      config: {
        humanColor: cfg.humanColor,
        botLabel: cfg.botLabel,
        botDepth: cfg.botDepth,
        openOpponentHand: cfg.openOpponentHand,
      },
    });
  });

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
    debugLog,
    enabledCategories: cfg.enabledCategories,
    maxHandSize: cfg.maxHandSize,
    cardOverrides: cfg.cardOverrides,
  });

  const board = new BoardRenderer(layout.board, { interactive: true });
  const oppHand = new CardHandsRenderer(layout.oppHand);
  const youHand = new CardHandsRenderer(layout.youHand);
  const oppCaptured = new CapturedPiecesRenderer(layout.oppCaptured);
  const youCaptured = new CapturedPiecesRenderer(layout.youCaptured);
  const deckPanel = new DeckPanelRenderer(layout.deck);

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
      pilotSuggestionFrom: vm.pilotProposal?.from ?? null,
      pilotSuggestionTo: vm.pilotProposal?.to ?? null,
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
      // Cards are only "playable" when it's actually the human's
      // turn-phase \u2014 in pre OR in post (the controller will refuse
      // mismatched phases). Surfacing the dim state in post phase is
      // important so post-eligible cards are highlighted while
      // pre-only cards visibly recede.
      playable: vm.turnOwner === vm.humanColor && !vm.botThinking && !vm.state.result,
      currentTurnPhase: vm.turnPhase,
    });
    oppCaptured.render(vm.state, vm.humanColor === 'w' ? 'b' : 'w');
    youCaptured.render(vm.state, vm.humanColor);
    deckPanel.render(vm.state, { revealHands: revealOpponent });
    updateHeader(layout, vm, cfg);
    updateLog(layout.log, vm, revealOpponent);
    updateBanner(layout.banner, vm);
    updatePilotProposal(layout, vm);
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
  pilotChip: HTMLElement;
  pilotChipStopBtn: HTMLButtonElement;
  usePilotBtn: HTMLButtonElement;
  autoMoveBtn: HTMLButtonElement;
  endTurnBtn: HTMLButtonElement;
  newGameBtn: HTMLElement;
  bugReportBtn: HTMLButtonElement;
  board: HTMLElement;
  oppCaptured: HTMLElement;
  youCaptured: HTMLElement;
  oppLabel: HTMLElement;
  youLabel: HTMLElement;
  oppHand: HTMLElement;
  youHand: HTMLElement;
  log: HTMLElement;
  deck: HTMLElement;
  banner: HTMLElement;
  pilotProposalBanner: HTMLElement;
  pilotProposalText: HTMLElement;
  pilotConfirmBtn: HTMLButtonElement;
  pilotSkipBtn: HTMLButtonElement;
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
  // Lean by design \u2014 most contextual info has been pushed down to the
  // strip / panel where it belongs (botLabel \u2192 oppStrip, handStateLabel \u2192
  // deckPanel, usePilotBtn / pilotChip / autoMove / endTurn \u2192 youStrip,
  // bugReport \u2192 logPanel footer). What's left here:
  //   - turnIndicator: the high-level "whose turn + which phase" pill
  //   - newGameBtn: meta-action that wants to be a global escape hatch
  // The spacer between them keeps newGame anchored at the right edge.
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

  // \u2014\u2014 Elements that are positioned LATER but constructed up-front so we
  // can return them on the Layout. Construction order is uncoupled from
  // DOM-insertion order. \u2014\u2014

  // bot \u00b7 normal label \u2014 lives next to the opponent's name in oppStrip.
  // Identical typography to the player labels so it reads as "facts about
  // who's playing" rather than a clickable thing.
  const botLabel = document.createElement('div');
  botLabel.style.cssText = `
    font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--sc-text-muted);
  `;
  botLabel.textContent = `bot \u00b7 ${cfg.botLabel}`;

  // Pilot chip \u2014 shown only when an opening pilot is engaged. Includes a
  // small stop button so the user can take the wheel without picking up a
  // piece first. Lives in the youStrip on the LEFT (after the player's
  // name) because it's a "your turn" status indicator.
  const pilotChip = document.createElement('div');
  pilotChip.style.cssText = `
    display: none;
    align-items: center; gap: 8px;
    padding: 4px 6px 4px 12px;
    background: color-mix(in srgb, var(--sc-accent) 18%, var(--sc-panel));
    border: 1px solid var(--sc-accent);
    border-radius: 999px;
    font-size: 11px; letter-spacing: 0.06em;
    color: var(--sc-text);
    font-family: system-ui, sans-serif;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--sc-accent) 15%, transparent);
  `;
  const pilotChipStopBtn = document.createElement('button');
  pilotChipStopBtn.type = 'button';
  pilotChipStopBtn.title = 'Stop the opening pilot';
  pilotChipStopBtn.textContent = 'stop';
  pilotChipStopBtn.style.cssText = `
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--sc-accent) 60%, transparent);
    background: var(--sc-panel);
    color: var(--sc-text);
    font-size: 10.5px; letter-spacing: 0.08em;
    cursor: pointer;
    font-family: inherit;
  `;
  pilotChip.appendChild(pilotChipStopBtn);

  // "use an opening" button \u2014 visible only on the human's very first move.
  // Lives in the youStrip's action cluster (next to auto-move) since it's
  // a "your turn" action. Tinted accent so it reads as a helpful suggestion.
  // Compact styling matches the other buttons in the action cluster so the
  // strip doesn't grow vertically when this button toggles visibility.
  const usePilotBtn = document.createElement('button');
  usePilotBtn.className = 'sc-btn';
  usePilotBtn.title = 'Auto-play a chosen opening until the line breaks';
  usePilotBtn.innerHTML = '\u{1F3BC} use an opening';
  usePilotBtn.style.display = 'none';
  usePilotBtn.style.background = 'color-mix(in srgb, var(--sc-accent) 20%, var(--sc-panel))';
  usePilotBtn.style.borderColor = 'var(--sc-accent)';
  usePilotBtn.style.color = 'var(--sc-text)';
  usePilotBtn.style.padding = '4px 10px';
  usePilotBtn.style.fontSize = '11.5px';

  // "auto-move" and "end turn" buttons live in the YOU strip below the
  // board (close to the player's name + captured pieces ribbon, where the
  // user's eye actually rests after a move).
  const autoMoveBtn = document.createElement('button');
  autoMoveBtn.className = 'sc-btn';
  autoMoveBtn.title = 'Let the bot pick this move for you (\u201cmove for me\u201d)';
  autoMoveBtn.innerHTML = '\u{1F916} auto-move';
  autoMoveBtn.style.display = 'none';
  autoMoveBtn.style.padding = '4px 10px';
  autoMoveBtn.style.fontSize = '11.5px';

  // "end turn" is rendered as a primary affordance because it's the
  // closing beat of the post-move phase. The button only appears when
  // the human is in their post-card phase AND has at least one defensive
  // card in hand; otherwise the controller auto-ends after a settle.
  const endTurnBtn = document.createElement('button');
  endTurnBtn.type = 'button';
  endTurnBtn.className = 'sc-btn sc-btn--primary';
  endTurnBtn.title = 'End your turn without playing a defensive card';
  endTurnBtn.innerHTML = '\u23ed\uFE0F end turn';
  endTurnBtn.style.display = 'none';
  endTurnBtn.style.padding = '4px 10px';
  endTurnBtn.style.fontSize = '11.5px';

  // Bug-report button \u2014 lives in the move log panel footer (low-traffic
  // area, but reachable). Constructed here so we can return it on the
  // Layout struct; appended below once the logPanel exists.
  const bugReportBtn = document.createElement('button');
  bugReportBtn.className = 'sc-btn';
  bugReportBtn.title = 'Capture game state + recent debug log for a bug report';
  bugReportBtn.innerHTML = '\u{1F41E} bug report';
  bugReportBtn.style.cssText = `
    width: 100%;
    margin-top: 6px;
    font-size: 11px;
  `;

  // Spacer pushes new-game to the right edge.
  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  header.appendChild(spacer);

  const newGameBtn = document.createElement('button');
  newGameBtn.className = 'sc-btn';
  newGameBtn.textContent = 'new game';
  newGameBtn.style.flexShrink = '0';
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

  // Opp strip (label + bot pill + captured) just above the board. The bot
  // pill ("bot \u00b7 normal") used to live in the page header but is more
  // legible here next to the opponent's name \u2014 it's a fact about WHO is
  // playing, so it belongs with their identity.
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
  oppStrip.appendChild(botLabel);
  oppStrip.appendChild(oppCaptured);
  boardCol.appendChild(oppStrip);

  // Board container.
  const board = document.createElement('div');
  board.style.cssText = 'display: flex; justify-content: center;';
  boardCol.appendChild(board);

  // You strip (label + pilot chip + captured + your-move actions) just below
  // the board. Left side groups identity-of-this-turn things (your label,
  // engaged opening pilot status). Right side groups action buttons that
  // act on the current move/turn (use opening, auto-move, end turn).
  // Putting these clusters adjacent to the board keeps them in eye-line
  // after a move \u2014 the previous header placement was too far away.
  //
  // min-height locks the strip at the height it has WITH the buttons
  // visible, so the board doesn't bounce up/down when buttons appear /
  // disappear between phases (e.g. auto-move hides the moment you enter
  // post-move; end-turn shows up; both are absent during the bot's turn).
  // The compact button styling below targets this height.
  const youStrip = document.createElement('div');
  youStrip.style.cssText = `
    display: flex; align-items: center; gap: 14px;
    padding: 6px 4px;
    flex-wrap: wrap;
    min-height: 38px;
  `;
  const youLabel = document.createElement('div');
  youLabel.style.cssText = `
    font-size: 13px;
    letter-spacing: 0.12em;
    color: var(--sc-text-secondary);
  `;
  const youCaptured = document.createElement('div');
  youStrip.appendChild(youLabel);
  youStrip.appendChild(pilotChip);
  youStrip.appendChild(youCaptured);

  // Spacer pushes the action cluster to the right edge.
  const youStripSpacer = document.createElement('div');
  youStripSpacer.style.flex = '1';
  youStrip.appendChild(youStripSpacer);

  // Action cluster: use-opening (first move only) + auto-move + end-turn.
  // Wrapped so the gap and alignment stay tight even when only one button
  // is visible. We use `flex-wrap: nowrap` to keep the buttons on the same
  // row; the strip itself can wrap if the captured ribbon is long.
  const youActionCluster = document.createElement('div');
  youActionCluster.style.cssText = `
    display: flex; align-items: center; gap: 8px;
    flex-shrink: 0; flex-wrap: nowrap;
  `;
  youActionCluster.appendChild(usePilotBtn);
  youActionCluster.appendChild(autoMoveBtn);
  youActionCluster.appendChild(endTurnBtn);
  youStrip.appendChild(youActionCluster);

  boardCol.appendChild(youStrip);

  // Your hand at the bottom of the column.
  const youHand = document.createElement('div');
  boardCol.appendChild(youHand);

  // Banner (slides in, e.g. "opponent played \uD83C\uDF00 Teleport").
  // We reserve a fixed line of vertical space ALWAYS so the board doesn't
  // jump up/down each turn when the banner appears or disappears \u2014 only
  // opacity animates. min-height is the height of one line of body text
  // plus the small vertical padding below.
  const banner = document.createElement('div');
  banner.style.cssText = `
    min-height: 1.4em;
    line-height: 1.4em;
    opacity: 0;
    transition: opacity 220ms ease;
    padding: 2px 14px 0;
    font-size: 13px;
    color: var(--sc-accent);
    text-align: center;
    font-family: system-ui, sans-serif;
  `;
  boardCol.appendChild(banner);

  // Pilot proposal banner \u2014 only rendered while a pilot is engaged. We
  // intentionally do NOT reserve its space when no pilot is engaged (most
  // games, especially for casual users who never engage one), since
  // reserving 50px+ of empty padding-block below the player's hand looks
  // weird. While engaged-but-between-proposals (during the bot's turn),
  // we keep the reserved space via `visibility: hidden` so the layout
  // doesn't bounce per turn. updatePilotProposal toggles all three modes.
  //
  // Positioning note: the banner sits DIRECTLY UNDER THE HEADER, not at
  // the bottom of the board column. The user's mental model is "the
  // 'use an opening' button engages a pilot, the pilot proposes here";
  // putting these two elements far apart (header vs below-the-hand) made
  // the suggestion easy to miss. They live next to each other now so
  // the engage \u2192 propose \u2192 confirm flow reads top-to-bottom.
  const pilotProposalBanner = document.createElement('div');
  pilotProposalBanner.style.cssText = `
    display: none;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--sc-accent) 16%, var(--sc-panel));
    border: 1.5px solid var(--sc-accent);
    color: var(--sc-text);
    font-family: system-ui, sans-serif;
    font-size: 13px;
    transition: opacity 180ms ease;
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--sc-accent) 14%, transparent),
      inset 0 1px 0 color-mix(in srgb, var(--sc-accent) 28%, transparent);
  `;
  const pilotProposalText = document.createElement('div');
  pilotProposalText.style.cssText = 'flex: 1; line-height: 1.4;';
  const pilotConfirmBtn = document.createElement('button');
  pilotConfirmBtn.type = 'button';
  pilotConfirmBtn.className = 'sc-btn sc-btn--primary';
  pilotConfirmBtn.style.padding = '8px 14px';
  pilotConfirmBtn.style.fontSize = '13px';
  const pilotSkipBtn = document.createElement('button');
  pilotSkipBtn.type = 'button';
  pilotSkipBtn.className = 'sc-btn';
  pilotSkipBtn.style.padding = '8px 14px';
  pilotSkipBtn.style.fontSize = '13px';
  pilotSkipBtn.textContent = 'I\u2019ll take it';
  pilotProposalBanner.appendChild(pilotProposalText);
  pilotProposalBanner.appendChild(pilotConfirmBtn);
  pilotProposalBanner.appendChild(pilotSkipBtn);
  // Insert right after the header, before the 2-column body. (The
  // banner DOM was already created above, but appended into boardCol
  // historically; moving it to `wrap` keeps it adjacent to the
  // engage button.)
  wrap.insertBefore(pilotProposalBanner, body);

  // Right: side panel \u2014 split into two stacked sub-panels (deck on top,
  // move log on bottom) so the player can see the deck composition AND
  // the move history without switching tabs. Total fixed height matches
  // the old single panel (600px) so the board column lines up the same.
  const sidePanel = document.createElement('aside');
  sidePanel.style.cssText = `
    display: flex; flex-direction: column;
    gap: 12px;
    height: 600px;
    min-height: 0;
  `;
  body.appendChild(sidePanel);

  // Deck panel \u2014 mounted into here by DeckPanelRenderer. Fills 40% of
  // the column height; scrolls internally when the deck has many types.
  const deck = document.createElement('div');
  deck.style.cssText = `
    flex: 0 1 40%;
    min-height: 0;
  `;
  sidePanel.appendChild(deck);

  // Move log panel \u2014 fills the rest. Self-contained box (border, header,
  // scrolling body, footer tip) so it visually mirrors the deck panel.
  const logPanel = document.createElement('div');
  logPanel.style.cssText = `
    flex: 1 1 60%;
    display: flex; flex-direction: column;
    min-height: 0;
    background: var(--sc-panel);
    border: 1px solid var(--sc-border);
    border-radius: 12px;
    overflow: hidden;
  `;
  sidePanel.appendChild(logPanel);

  const logHeader = document.createElement('div');
  logHeader.style.cssText = `
    padding: 10px 14px 8px;
    border-bottom: 1px solid var(--sc-border);
    font-size: 10.5px; letter-spacing: 0.28em; text-transform: uppercase;
    color: var(--sc-text-muted);
    flex: 0 0 auto;
  `;
  logHeader.textContent = 'move log';
  logPanel.appendChild(logHeader);

  const log = document.createElement('div');
  log.style.cssText = `
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 8px 14px;
    font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace;
    font-size: 12.5px;
    line-height: 1.7;
  `;
  logPanel.appendChild(log);

  // Footer: tip text + bug-report button. The bug-report used to live in
  // the page header but it's a low-traffic action, and tucking it under
  // the move log keeps the header clean while staying findable. The tip
  // and button stack vertically so the tip retains its prose layout and
  // the button takes its own row, full width.
  const tip = document.createElement('div');
  tip.style.cssText = `
    padding: 10px 14px;
    border-top: 1px solid var(--sc-border);
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--sc-text-secondary);
    font-family: system-ui, sans-serif;
    flex: 0 0 auto;
  `;
  const tipText = document.createElement('div');
  tipText.innerHTML = `
    <strong style="color:var(--sc-text);font-weight:600;">tip \u00b7</strong>
    click a piece to see moves, a card to play it. hover any row in the
    <em>deck</em> for that card's rules.
  `;
  tip.appendChild(tipText);
  tip.appendChild(bugReportBtn);
  logPanel.appendChild(tip);

  // Labels (set once based on color).
  oppLabel.textContent = cfg.humanColor === 'w' ? '♚  black' : '♔  white';
  youLabel.textContent = cfg.humanColor === 'w' ? '♔  white (you)' : '♚  black (you)';

  return {
    header, turnIndicator, pilotChip, pilotChipStopBtn, usePilotBtn,
    autoMoveBtn, endTurnBtn, newGameBtn,
    bugReportBtn,
    board, oppCaptured, youCaptured, oppLabel, youLabel,
    oppHand, youHand, log, deck, banner,
    pilotProposalBanner, pilotProposalText, pilotConfirmBtn, pilotSkipBtn,
  };
}

function updateHeader(layout: Layout, vm: PlayViewModel, _cfg: NewGameConfig): void {
  // "use an opening" button \u2014 only shown before the human's first move.
  layout.usePilotBtn.style.display = vm.pilotPickerAvailable ? 'inline-flex' : 'none';

  // "auto-move" button \u2014 visible whenever the human can move via the
  // board. We hide it during card-targeting (input is mid-flight), during
  // the bot's turn, after game over, and while a pilot proposal is up
  // (the proposal banner already provides "play [Nf3]" as the same kind
  // of one-click delegation, so showing both would be redundant noise).
  // Also hide during the post-card phase \u2014 the move already happened.
  const canAutoMove =
    vm.whoseTurn === 'human'
    && !vm.botThinking
    && vm.cardPhase.kind === 'none'
    && !vm.state.result
    && !vm.pilotProposal
    && !(vm.turnOwner === vm.humanColor && vm.turnPhase === 'post');
  layout.autoMoveBtn.style.display = canAutoMove ? 'inline-flex' : 'none';

  // End-turn button \u2014 visible only when the human is in their post-card
  // phase AND has at least one defensive card in hand. The controller
  // surfaces this as `postPhaseAwaitingHuman` so this UI doesn't need to
  // know which cards are post-eligible.
  layout.endTurnBtn.style.display = vm.postPhaseAwaitingHuman ? 'inline-flex' : 'none';

  // Opening pilot chip \u2014 visible only while a pilot is engaged. Shows the
  // opening name + progress; the per-move detail (label + confirm/skip) is
  // rendered separately in the proposal banner near the board.
  if (vm.pilot) {
    layout.pilotChip.style.display = 'inline-flex';
    const label = document.createElement('span');
    label.innerHTML = `\u{1F3BC} <strong style="font-weight:600;">${escapeHtml(vm.pilot.name)}</strong> <span style="color:var(--sc-text-muted);">(${vm.pilot.nextIdx}/${vm.pilot.total})</span>`;
    while (layout.pilotChip.firstChild && layout.pilotChip.firstChild !== layout.pilotChipStopBtn) {
      layout.pilotChip.removeChild(layout.pilotChip.firstChild);
    }
    layout.pilotChip.insertBefore(label, layout.pilotChipStopBtn);
  } else {
    layout.pilotChip.style.display = 'none';
  }

  // Turn indicator \u2014 the lone status pill remaining in the page header.
  // Combines three facts:
  //   1. Whose turn it is (animated dot, color-coded)
  //   2. Stage label ("your move" / "opponent thinking" / "playing X")
  //   3. Phase tag ("pre-move" / "post-move") so the player can see at a
  //      glance whether they're in the offensive or defensive window.
  // The phase tag also appears as a faint background tint of the pill so
  // the phase change registers peripherally even when not reading the text.
  layout.turnIndicator.innerHTML = '';
  const phaseTint =
    vm.state.result || vm.botThinking
      ? 'var(--sc-panel)'
      : vm.turnPhase === 'pre'
        ? 'color-mix(in srgb, var(--sc-accent) 8%, var(--sc-panel))'
        : 'color-mix(in srgb, var(--sc-accent-danger) 10%, var(--sc-panel))';
  layout.turnIndicator.style.background = phaseTint;

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
      text.textContent = `playing ${vm.cardPhase.card.definition.name} \u00b7 ${hint}`;
    } else if (vm.cardPhase.kind === 'card-second-target') {
      text.textContent = `playing ${vm.cardPhase.card.definition.name} \u00b7 choose destination`;
    } else {
      text.textContent = 'your move';
    }
  } else {
    if (vm.botThinking) {
      text.appendChild(document.createTextNode('opponent thinking'));
      const dots = document.createElement('span');
      dots.className = 'sc-think-dots';
      dots.innerHTML = '<span>\u00b7</span><span>\u00b7</span><span>\u00b7</span>';
      text.appendChild(dots);
    } else {
      text.textContent = 'opponent move';
    }
  }
  layout.turnIndicator.appendChild(text);

  // Phase tag \u2014 small, subdued, sits at the right end of the pill. We
  // hide it on game-over since the concept stops applying.
  if (!vm.state.result) {
    const phaseGlyph = vm.turnPhase === 'pre' ? '\u2694\uFE0F' : '\u{1F6E1}\uFE0F';
    const phaseName = vm.turnPhase === 'pre' ? 'pre-move' : 'post-move';
    const sep = document.createElement('span');
    sep.style.cssText = `color: var(--sc-text-muted); margin: 0 2px;`;
    sep.textContent = '\u00b7';
    const phaseTag = document.createElement('span');
    phaseTag.style.cssText = `
      font-size: 11.5px;
      color: var(--sc-text-muted);
      letter-spacing: 0.06em;
    `;
    phaseTag.textContent = `${phaseGlyph} ${phaseName}`;
    phaseTag.title =
      vm.turnPhase === 'pre'
        ? 'pre-move: play offensive / move-modifier cards, or move'
        : 'post-move: play defensive cards (shield / freeze / foul ground) or end turn';
    layout.turnIndicator.appendChild(sep);
    layout.turnIndicator.appendChild(phaseTag);
  }

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

function updateLog(log: HTMLElement, vm: PlayViewModel, revealOpponent: boolean): void {
  // Render the last ~60 events so the log can show full game without growing forever.
  // When the opponent's hand is closed, we hide the *identity* of their draws
  // and discards — leaking those would defeat the whole "closed hand" mode.
  // Plays are still shown by name because the effect is already visible on
  // the board (and the banner spells it out).
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
      const isStarting = ev.data.reason === 'startingHand';
      if (isHuman) {
        row.textContent = isStarting
          ? `   • starting card: ${ev.data.card.definition.name}`
          : `   • you drew ${ev.data.card.definition.name}`;
      } else if (revealOpponent) {
        row.textContent = isStarting
          ? `   • they start with ${ev.data.card.definition.name}`
          : `   • they drew ${ev.data.card.definition.name}`;
      } else {
        // Hand closed → show that a draw happened but not what.
        row.textContent = isStarting ? `   • they start with a card` : `   • they drew a card`;
      }
    } else if (ev.type === 'cardDiscard') {
      row.style.color = THEME.textMuted;
      row.style.fontSize = '11px';
      row.style.fontStyle = 'italic';
      const isHuman = ev.data.color === vm.humanColor;
      if (isHuman) {
        row.textContent = `   • you discarded ${ev.data.card.definition.name}`;
      } else if (revealOpponent) {
        row.textContent = `   • they discarded ${ev.data.card.definition.name}`;
      } else {
        row.textContent = `   • they discarded a card`;
      }
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

/** Show / hide + populate the pilot's proposal banner \u2014 the per-move
 * "play [Nf3]" / "I'll take it" confirmation UI.
 *
 * Three-mode visibility to avoid layout jump:
 *   1. Pilot disengaged \u2014 fully collapsed (display: none).
 *   2. Pilot engaged, no proposal queued (e.g. during bot's turn) \u2014
 *      laid out but invisible (visibility: hidden + opacity: 0). Reserves
 *      vertical space so the board doesn't shift between turns while a
 *      pilot is active.
 *   3. Pilot engaged, proposal queued \u2014 fully visible.
 */
function updatePilotProposal(layout: Layout, vm: PlayViewModel): void {
  const banner = layout.pilotProposalBanner;
  if (!vm.pilot) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = 'flex';
  if (!vm.pilotProposal) {
    banner.style.visibility = 'hidden';
    banner.style.opacity = '0';
    return;
  }
  banner.style.visibility = 'visible';
  banner.style.opacity = '1';
  layout.pilotProposalText.innerHTML = `
    \u{1F3BC} <strong style="font-weight:600;">${escapeHtml(vm.pilotProposal.openingName)}</strong>
    suggests
    <span style="font-family:ui-monospace,'JetBrains Mono',Menlo,monospace;font-weight:600;">${escapeHtml(vm.pilotProposal.label)}</span>
  `;
  layout.pilotConfirmBtn.textContent = `play ${vm.pilotProposal.label}`;
}

/** Minimal HTML escape for user-derived strings injected via innerHTML. The
 * pilot opening names + move labels come from a static curated table so this
 * is belt-and-braces — but the cost is one regex, the benefit is "no XSS if
 * someone later sources opening names from a URL param". */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}
