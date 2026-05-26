// Super Chess main entry point
import { injectTheme, BoardRenderer, CardHandsRenderer, GameLogRenderer, StatsDashboard, ControlsPanel } from './ui/index.ts';
import { MinimaxAI } from './ai/minimaxAI.ts';
import { HeuristicCardAI } from './ai/heuristicCardAI.ts';
import { SimulationRunner } from './simulation/runner.ts';
import { StatsCollector } from './simulation/stats.ts';
import type { SimulationConfig } from './simulation/types.ts';
import type { AggregatedStats } from './simulation/types.ts';
import { parseFEN, STARTING_FEN } from './engine/fen.ts';
import { createSuperState } from './game/types.ts';
import { buildDeck } from './cards/definitions.ts';
import { Deck } from './cards/deck.ts';

injectTheme();

const app = document.getElementById('app')!;
app.style.cssText = `
  display: grid;
  grid-template-areas:
    "board hands stats"
    "board log   stats"
    "ctrl  ctrl  ctrl";
  grid-template-columns: 420px 300px 1fr;
  grid-template-rows: auto 1fr auto;
  gap: 12px; padding: 12px; min-height: 100vh;
`;

function makeDiv(area: string): HTMLDivElement {
  const d = document.createElement('div');
  d.style.gridArea = area;
  app.appendChild(d);
  return d;
}

const boardContainer = makeDiv('board');
const handsContainer = makeDiv('hands');
const logContainer = makeDiv('log');
const statsContainer = makeDiv('stats');
const controlsContainer = makeDiv('ctrl');

const boardRenderer = new BoardRenderer(boardContainer);
const handsRenderer = new CardHandsRenderer(handsContainer);
const logRenderer = new GameLogRenderer(logContainer);
const statsRenderer = new StatsDashboard(statsContainer);
const controls = new ControlsPanel(controlsContainer);

let runner: SimulationRunner | null = null;
let statsCollector = new StatsCollector();

controls.onRun = async (cfg) => {
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
  controls.setRunning(true);
  controls.setProgress(0, cfg.games);
  logRenderer.reset();

  let gamesDone = 0;
  for await (const { game, stats } of runner.run()) {
    gamesDone++;
    statsCollector.addGame(game);
    statsRenderer.render(stats);
    controls.setProgress(gamesDone, cfg.games);
    // Show the last position of the completed game
    const lastState = runner.lastState;
    if (lastState) {
      boardRenderer.render(lastState);
      handsRenderer.render(lastState);
      logRenderer.render(lastState);
    }
  }

  controls.setRunning(false);
  statsRenderer.render(statsCollector.getStats());
};

controls.onPause = () => runner?.pause();
controls.onStop = () => { runner?.stop(); controls.setRunning(false); };

// Click a move in the log → show that board position
logRenderer.onMoveClick = (chess) => boardRenderer.renderChess(chess);

controls.onExportJSON = () => {
  const data = statsCollector.exportJSON();
  downloadFile('sim-results.json', data, 'application/json');
};

controls.onExportCSV = () => {
  downloadFile('sim-results.csv', statsCollector.exportCSV(), 'text/csv');
};

function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  URL.revokeObjectURL(a.href);
}

// Initial board render
const initialDeck = new Deck(buildDeck());
const initialState = {
  chess: parseFEN(STARTING_FEN),
  deck: initialDeck.getState(),
  superState: createSuperState(),
  history: [],
  result: null,
  snapshots: [],
};

boardRenderer.render(initialState);
handsRenderer.render(initialState);
logRenderer.render(initialState);
const emptyStats: AggregatedStats = {
  totalGames: 0, whiteWins: 0, blackWins: 0, draws: 0,
  winRates: { white: 0, black: 0, draw: 0 },
  avgGameLength: 0, medianGameLength: 0,
  avgCardsDrawnPerGame: 0, avgCardsPlayedPerGame: 0, cardUtilizationRate: 0,
  perCard: new Map(),
};
statsRenderer.render(emptyStats);

