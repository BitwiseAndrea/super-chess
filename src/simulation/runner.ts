// src/simulation/runner.ts
import type { SimulationConfig, SimulationResult, AggregatedStats } from './types.ts';
import type { GameResult } from '../game/types.ts';
import { SuperChessGame } from '../game/superChess.ts';
import { StatsCollector } from './stats.ts';

export class SimulationRunner {
  private config: SimulationConfig;
  private results: GameResult[] = [];
  private isRunning = false;
  private shouldStop = false;
  private isPaused = false;
  private statsCollector = new StatsCollector();
  lastState: import('../game/types.ts').SuperChessState | null = null;

  constructor(config: SimulationConfig) {
    this.config = config;
  }

  // Async generator: yields after each game
  async *run(): AsyncGenerator<{ game: GameResult; index: number; stats: AggregatedStats }> {
    this.isRunning = true;
    this.shouldStop = false;
    this.results = [];
    this.statsCollector = new StatsCollector();

    for (let i = 0; i < this.config.games; i++) {
      if (this.shouldStop) break;
      while (this.isPaused) {
        await sleep(100);
      }

      const seed = this.config.seed !== undefined ? this.config.seed + i : undefined;
      const gameCfg = { ...this.config, seed };

      const game = new SuperChessGame(gameCfg);
      const result = await game.runToCompletion();
      this.lastState = game.getState();

      this.results.push(result);
      this.statsCollector.addGame(result);

      yield { game: result, index: i, stats: this.statsCollector.getStats() };

      // Always yield to the macrotask queue so the browser can repaint
      await sleep(this.config.speedMs > 0 ? this.config.speedMs : 0);
    }

    this.isRunning = false;
  }

  // Fire-and-forget for CLI
  async runAll(): Promise<SimulationResult> {
    const startedAt = new Date();
    this.results = [];
    this.statsCollector = new StatsCollector();

    for (let i = 0; i < this.config.games; i++) {
      const seed = this.config.seed !== undefined ? this.config.seed + i : undefined;
      const game = new SuperChessGame({ ...this.config, seed });
      const result = await game.runToCompletion();
      this.results.push(result);
      this.statsCollector.addGame(result);

      if (i % 10 === 0) {
        const pct = Math.round(((i + 1) / this.config.games) * 100);
        process.stdout?.write?.(`\r  Game ${i + 1}/${this.config.games} (${pct}%)  `);
      }
    }
    process.stdout?.write?.('\n');

    const completedAt = new Date();
    const { chessAI: _ca, cardAI: _cai, ...safeConfig } = this.config;

    return {
      config: safeConfig,
      games: this.results,
      stats: this.statsCollector.getStats(),
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  }

  pause(): void { this.isPaused = true; }
  resume(): void { this.isPaused = false; }
  stop(): void { this.shouldStop = true; this.isPaused = false; }
  get running(): boolean { return this.isRunning; }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
