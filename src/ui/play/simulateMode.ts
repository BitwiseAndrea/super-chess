// src/ui/play/simulateMode.ts
// Renders the original simulator UI (board + hands + stats + log + controls).
// Lifted out of the old main.ts so the new tabbed router can switch to it.

import { BoardRenderer } from '../board.ts';
import { CardHandsRenderer } from '../cardHands.ts';
import { GameLogRenderer } from '../gameLog.ts';
import { StatsDashboard } from '../statsDashboard.ts';
import { ControlsPanel } from '../controls.ts';
import { DeckPanelRenderer } from './deckPanel.ts';
import { MinimaxAI } from '../../ai/minimaxAI.ts';
import { HeuristicCardAI } from '../../ai/heuristicCardAI.ts';
import { SimulationRunner } from '../../simulation/runner.ts';
import { StatsCollector } from '../../simulation/stats.ts';
import type { SimulationConfig, AggregatedStats } from '../../simulation/types.ts';
import { parseFEN, STARTING_FEN } from '../../engine/fen.ts';
import { createSuperState } from '../../game/types.ts';
import { buildDeck } from '../../cards/definitions.ts';
import { Deck } from '../../cards/deck.ts';
import { THEME } from '../theme.ts';

export function renderSimulateMode(root: HTMLElement): void {
  root.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.style.cssText = `
    max-width: 1280px;
    margin: 0 auto;
    padding: 18px 20px 32px;
    color: ${THEME.textPrimary};
    display: flex; flex-direction: column;
    gap: 18px;
  `;
  root.appendChild(wrap);

  // Header \u2014 mirrors Play's header (turn-indicator pill on the left, action
  // buttons on the right) so the two modes feel like siblings. Where Play
  // shows "your move", Simulate shows a fixed "bots playing" eyebrow pill.
  const header = document.createElement('header');
  header.style.cssText = 'display: flex; align-items: center; gap: 14px; flex-wrap: wrap;';
  wrap.appendChild(header);

  const modePill = document.createElement('div');
  modePill.style.cssText = `
    display: flex; align-items: center; gap: 10px;
    padding: 8px 14px;
    background: ${THEME.panel};
    border: 1px solid ${THEME.border};
    border-radius: 999px;
    font-size: 13px;
    letter-spacing: 0.04em;
    color: ${THEME.textPrimary};
  `;
  modePill.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${THEME.accent};display:inline-block;"></span><span>bot vs bot \u00b7 research</span>`;
  header.appendChild(modePill);

  const tagline = document.createElement('div');
  tagline.style.cssText = `
    font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase;
    color: ${THEME.textMuted};
  `;
  tagline.textContent = 'card balance simulator';
  header.appendChild(tagline);

  const headerSpacer = document.createElement('div');
  headerSpacer.style.flex = '1';
  header.appendChild(headerSpacer);

  const lede = document.createElement('p');
  lede.style.cssText = `
    margin: 0;
    color: ${THEME.textSecondary};
    font-size: 13px;
    font-family: system-ui, sans-serif;
    max-width: 100%;
  `;
  lede.textContent = 'Pit two bots against each other for N games. Per-card win-rate, play-rate, and utilization roll up in the dashboard. Export CSV/JSON for analysis.';
  wrap.appendChild(lede);

  // Layout grid \u2014 board on the left, narrow center column (hands + deck
  // composition + move log stacked), stats on the right. The "deck" panel
  // is new and matches the one in Play \u2014 a consistent way to see the
  // pool of cards in play.
  const grid = document.createElement('div');
  grid.style.cssText = `
    display: grid;
    grid-template-areas:
      "board hands stats"
      "board deck  stats"
      "board log   stats"
      "ctrl  ctrl  ctrl";
    grid-template-columns: minmax(360px, 480px) 280px 1fr;
    grid-template-rows: auto auto 1fr auto;
    gap: 12px;
  `;
  wrap.appendChild(grid);

  const make = (area: string, opts: { padded?: boolean } = {}) => {
    const d = document.createElement('div');
    d.style.gridArea = area;
    d.style.background = THEME.panel;
    d.style.border = `1px solid ${THEME.border}`;
    d.style.borderRadius = '12px';
    if (opts.padded !== false) d.style.padding = '12px';
    d.style.minWidth = '0';
    grid.appendChild(d);
    return d;
  };
  const boardC = make('board');
  const handsC = make('hands');
  // Deck panel renders its own border/padding via DeckPanelRenderer; we
  // give it an unstyled host so the panel's chrome owns the visuals.
  const deckC  = document.createElement('div');
  deckC.style.cssText = 'grid-area: deck; min-width: 0;';
  grid.appendChild(deckC);
  const logC   = make('log');
  const statsC = make('stats');
  const ctrlC  = make('ctrl');

  const boardR = new BoardRenderer(boardC);
  const handsR = new CardHandsRenderer(handsC);
  const deckR  = new DeckPanelRenderer(deckC);
  const logR   = new GameLogRenderer(logC);
  const statsR = new StatsDashboard(statsC);
  const ctrl   = new ControlsPanel(ctrlC);

  let runner: SimulationRunner | null = null;
  let statsCollector = new StatsCollector();

  ctrl.onRun = async (cfg) => {
    const chessAI = new MinimaxAI(cfg.depth);
    const cardAI = new HeuristicCardAI();

    const simConfig: SimulationConfig = {
      games: cfg.games,
      chessAI: { white: chessAI, black: chessAI },
      cardAI: { white: cardAI, black: cardAI },
      searchDepth: cfg.depth,
      speedMs: cfg.speed === 'instant' ? 0 : 200,
      maxMovesPerGame: 200,
    };

    statsCollector = new StatsCollector();
    runner = new SimulationRunner(simConfig);
    ctrl.setRunning(true);
    ctrl.setProgress(0, cfg.games);
    logR.reset();

    let done = 0;
    for await (const { game, stats } of runner.run()) {
      done++;
      statsCollector.addGame(game);
      statsR.render(stats);
      ctrl.setProgress(done, cfg.games);
      const last = runner.lastState;
      if (last) {
        boardR.render(last);
        handsR.render(last);
        deckR.render(last);
        logR.render(last);
      }
    }
    ctrl.setRunning(false);
    statsR.render(statsCollector.getStats());
  };

  ctrl.onPause = () => runner?.pause();
  ctrl.onStop = () => { runner?.stop(); ctrl.setRunning(false); };
  logR.onMoveClick = (chess) => boardR.renderChess(chess);

  ctrl.onExportJSON = () => downloadFile(
    'sim-results.json', statsCollector.exportJSON(), 'application/json',
  );
  ctrl.onExportCSV = () => downloadFile(
    'sim-results.csv', statsCollector.exportCSV(), 'text/csv',
  );

  // initial empty render
  const initialDeck = new Deck(buildDeck());
  const initialState = {
    chess: parseFEN(STARTING_FEN),
    deck: initialDeck.getState(),
    superState: createSuperState(),
    history: [],
    result: null,
    snapshots: [],
  };
  boardR.render(initialState);
  handsR.render(initialState);
  deckR.render(initialState);
  logR.render(initialState);
  const empty: AggregatedStats = {
    totalGames: 0, whiteWins: 0, blackWins: 0, draws: 0,
    winRates: { white: 0, black: 0, draw: 0 },
    avgGameLength: 0, medianGameLength: 0,
    avgCardsDrawnPerGame: 0, avgCardsPlayedPerGame: 0, cardUtilizationRate: 0,
    perCard: new Map(),
  };
  statsR.render(empty);
}

function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}
